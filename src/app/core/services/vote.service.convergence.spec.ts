import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VoteService } from './vote.service';
import { ApiService, Post, User } from './api.service';
import { AuthService } from './auth.service';

const TEST_USER: User = { id: 1, email: 't@t.co', username: 'tester', is_admin: false };
const AUTH = { user: signal(TEST_USER) };

class FakeServer {
  others: number;
  userVote: number | null;
  calls = 0;
  callId: number;
  delayCalls = new Set<number>();
  private static seed = 0;

  constructor(others: number, userVote: number | null) {
    this.callId = ++FakeServer.seed;
    this.others = others;
    this.userVote = userVote;
  }

  reset(others: number, userVote: number | null) {
    this.others = others;
    this.userVote = userVote;
    this.calls = 0;
    this.delayCalls.clear();
  }

  truth() {
    const raw = this.others + (this.userVote ?? 0);
    return { upvotes: Math.max(0, raw), raw_upvotes: raw, user_vote: this.userVote };
  }

  async vote(_postId: number, value: number) {
    this.calls++;
    if (this.delayCalls.has(this.calls)) {
      await new Promise(r => setTimeout(r, 2));
    }
    if (value === 0) this.userVote = null;
    else this.userVote = value;
    return this.truth();
  }
}

function seedPost(upvotes: number, raw_upvotes: number, user_vote: number | null): Post {
  return {
    id: 1,
    user_id: 2,
    type: 'feature',
    status: 'current',
    title: 'T',
    content: 'C',
    username: 'u',
    created_at: '2024-01-01',
    upvotes,
    raw_upvotes,
    user_vote,
  };
}

interface Harness {
  service: VoteService;
  server: FakeServer;
}

// Build one service against one FakeServer (api.vote delegates to the server).
// The server is reset between cases; the service is reused.
function makeHarness(): Harness {
  const server = new FakeServer(0, null);
  const api = { vote: vi.fn((_p: number, v: number) => server.vote(_p, v)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: AuthService, useValue: AUTH },
    ],
  });
  const service = TestBed.inject(VoteService);
  return { service, server };
}

function reseed(h: Harness, others: number, seedVote: number | null) {
  h.server.reset(others, seedVote);
  const seed = h.server.truth();
  h.service.setServerPosts([seedPost(seed.upvotes, seed.raw_upvotes, seed.user_vote)]);
}

function label(others: number, seedVote: number | null, seq: number[]) {
  return `others=${others}, seedVote=${seedVote}, seq=[${seq.join(',')}]`;
}

async function settle(service: VoteService) {
  // Instantly-resolving responses drain entirely within microtasks.
  for (let i = 0; i < 50 && service.voteInFlight().has(1); i++) {
    await Promise.resolve();
  }
  // Slow (deliberately delayed) responses need real timer turns.
  for (let i = 0; i < 15 && service.voteInFlight().has(1); i++) {
    await new Promise(r => setTimeout(r, 1));
  }
}

function assertConverged(h: Harness, seqLabel: string) {
  const truth = h.server.truth();
  const post = h.service.posts()[0];
  expect(post.upvotes, seqLabel).toBe(truth.upvotes);
  expect(post.raw_upvotes, seqLabel).toBe(truth.raw_upvotes);
  expect(post.user_vote, seqLabel).toBe(truth.user_vote);
  expect(h.service.voteErrors().get(1), seqLabel).toBeUndefined();
  expect(h.service.voteInFlight().has(1), seqLabel).toBe(false);
}

const CLICKS = [1, -1, 0] as const;

function sequencesOfLength(len: number): number[][] {
  if (len === 0) return [[]];
  return sequencesOfLength(len - 1).flatMap(seq => CLICKS.map(v => [...seq, v]));
}

const INITIAL = [
  { others: 0, seedVote: null },
  { others: 2, seedVote: 1 },
  { others: -1, seedVote: -1 },
] as const;

describe('VoteService exhaustive convergence under rapid clicking', () => {
  afterEach(() => TestBed.resetTestingModule());

  for (const len of [1, 2, 3, 4, 5]) {
    const cases = 3 * Math.pow(3, len);
    it(`converges for every click sequence of length ${len} from every start state (${cases} cases)`, async () => {
      const h = makeHarness();
      let count = 0;
      for (const { others, seedVote } of INITIAL) {
        for (const seq of sequencesOfLength(len)) {
          reseed(h, others, seedVote);
          for (const v of seq) {
            h.service.applyVote(1, v);
          }
          await settle(h.service);
          assertConverged(h, label(others, seedVote, seq));
          count++;
        }
      }
      expect(count).toBe(cases);
    }, 60000);
  }
});

describe('VoteService races and ordering (delayed first response)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const tricky: { seq: number[]; label: string }[] = [
    { seq: [1, -1], label: 'up then down' },
    { seq: [1, -1, 1], label: 'up down up' },
    { seq: [1, 0, -1], label: 'up clear down' },
    { seq: [-1, 1], label: 'down then up' },
    { seq: [1, 1], label: 'double up' },
    { seq: [-1, -1], label: 'double down' },
    { seq: [1, 0], label: 'up then clear' },
    { seq: [0, 1, -1, 0], label: 'clear up down clear' },
    { seq: [1, -1, 0, 1], label: 'up down clear up' },
    { seq: [1, -1, 1, -1, 1], label: 'alternating five' },
  ];

  for (const t of tricky) {
    it(`converges when the first response is slow (${t.label})`, async () => {
      const h = makeHarness();
      for (const { others, seedVote } of INITIAL) {
        reseed(h, others, seedVote);
        h.server.delayCalls.add(1);
        for (const v of t.seq) {
          h.service.applyVote(1, v);
        }
        await settle(h.service);
        assertConverged(h, label(others, seedVote, t.seq));
      }
    });
  }
});

describe('VoteService stale list responses cannot revert a vote', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ignores a list response issued before the vote click', async () => {
    const h = makeHarness();
    reseed(h, 0, null);
    h.service.applyVote(1, 1);
    await settle(h.service);
    const before = Date.now() - 500;
    h.service.setServerPosts([seedPost(0, 0, null)], before);
    expect(h.service.posts()[0].upvotes).toBe(1);
    expect(h.service.posts()[0].user_vote).toBe(1);
  });

  it('keeps the optimistic vote when a list arrives during voting', async () => {
    const h = makeHarness();
    reseed(h, 0, null);
    h.server.delayCalls.add(1);
    h.service.applyVote(1, 1);
    // A list response arrives while votes are still draining; it must not
    // clobber the optimistic state.
    h.service.setServerPosts([seedPost(1, 1, 1)], Date.now() + 500);
    await settle(h.service);
    assertConverged(h, 'during-vote list arrival');
  });

  it('adopts a genuinely newer list response after votes settle', async () => {
    const h = makeHarness();
    reseed(h, 0, null);
    h.service.applyVote(1, 1);
    await settle(h.service);
    h.service.setServerPosts([seedPost(5, 5, 1)], Date.now() + 1000);
    const post = h.service.posts()[0];
    expect(post.upvotes).toBe(5);
    expect(post.user_vote).toBe(1);
  });
});

describe('VoteService edge cases', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('clearing when there is no vote is a no-op (no request sent)', async () => {
    const server = new FakeServer(0, null);
    const api = { vote: vi.fn((_p: number, v: number) => server.vote(_p, v)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: AUTH },
      ],
    });
    const service = TestBed.inject(VoteService);
    service.setServerPosts([seedPost(0, 0, null)]);
    service.applyVote(1, 0);
    await settle(service);
    expect(api.vote).not.toHaveBeenCalled();
  });

  it('reverts to confirmed state when a request in a rapid chain fails', async () => {
    const server = new FakeServer(0, null);
    const api = {
      vote: vi.fn((_p: number, v: number) => {
        if (v === 1) return Promise.reject(new Error('Network error'));
        return server.vote(_p, v);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: AUTH },
      ],
    });
    const service = TestBed.inject(VoteService);
    service.setServerPosts([seedPost(0, 0, null)]);
    service.applyVote(1, 1); // fails
    service.applyVote(1, -1); // queued behind it, never sent
    await settle(service);
    const post = service.posts()[0];
    expect(post.upvotes).toBe(0);
    expect(post.user_vote).toBeNull();
    expect(service.voteErrors().get(1)).toBe('Network error');
  });

  it('rolls back all vote state on a 401 response', async () => {
    const api = {
      vote: vi.fn((_p: number, _v: number) => {
        const e: any = new Error('Unauthorized');
        e.status = 401;
        return Promise.reject(e);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: AUTH },
      ],
    });
    const service = TestBed.inject(VoteService);
    service.setServerPosts([seedPost(0, 0, null)]);
    service.applyVote(1, 1);
    await settle(service);
    expect(service.posts()[0].user_vote).toBeNull();
  });

  it('does nothing when not authenticated', async () => {
    const server = new FakeServer(0, null);
    const api = { vote: vi.fn((_p: number, v: number) => server.vote(_p, v)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { user: signal<User | null>(null) } },
      ],
    });
    const service = TestBed.inject(VoteService);
    service.setServerPosts([seedPost(0, 0, null)]);
    service.applyVote(1, 1);
    await settle(service);
    expect(api.vote).not.toHaveBeenCalled();
  });

  it('voting on a missing post is a safe no-op', async () => {
    const server = new FakeServer(0, null);
    const api = { vote: vi.fn((_p: number, v: number) => server.vote(_p, v)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: AUTH },
      ],
    });
    const service = TestBed.inject(VoteService);
    service.setServerPosts([]);
    service.applyVote(99, 1);
    await settle(service);
    expect(api.vote).not.toHaveBeenCalled();
    expect(service.posts()).toEqual([]);
  });
});