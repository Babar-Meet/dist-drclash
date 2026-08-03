import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VoteService } from './vote.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { User } from './api.service';

const TEST_USER: User = { id: 1, email: 't@t.co', username: 'tester', is_admin: false };

function makeAuth(user: User | null = TEST_USER) {
  return { user: signal(user) };
}

function makePost(id: number, overrides: any = {}) {
  return {
    id,
    upvotes: 10,
    user_vote: null,
    type: 'feature' as const,
    status: 'current' as const,
    title: 'T',
    content: 'C',
    username: 'u',
    user_id: 1,
    created_at: '2024-01-01',
    ...overrides,
  };
}

describe('VoteService', () => {
  let api: { vote: ReturnType<typeof vi.fn> };

  function configure(auth: any = makeAuth()) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    });
    return TestBed.inject(VoteService);
  }

  beforeEach(() => {
    api = { vote: vi.fn() };
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('optimistically applies an upvote immediately', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    
    const votePromise = service.applyVote(1, 1);
    
    // UI immediately updates
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
    
    await votePromise;
    expect(api.vote).toHaveBeenCalledWith(1, 1);
  });

  it('optimistically applies a downvote immediately', async () => {
    api.vote.mockResolvedValue({ upvotes: 9, user_vote: -1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    
    const votePromise = service.applyVote(1, -1);
    
    expect(service.posts()[0].upvotes).toBe(9);
    expect(service.posts()[0].user_vote).toBe(-1);
    
    await votePromise;
  });

  it('switching up to down applies a delta of -2', async () => {
    api.vote.mockResolvedValue({ upvotes: 9, user_vote: -1 });
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    
    const votePromise = service.applyVote(1, -1);
    
    expect(service.posts()[0].upvotes).toBe(9);
    expect(service.posts()[0].user_vote).toBe(-1);
    
    await votePromise;
  });

  it('switching down to up applies a delta of +2', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 9, user_vote: -1 })]);
    
    const votePromise = service.applyVote(1, 1);
    
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
    
    await votePromise;
  });

  it('clicking the same value does nothing (no-op)', async () => {
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    
    await service.applyVote(1, 1);
    
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
    expect(api.vote).not.toHaveBeenCalled();
  });

  it('clearing a vote sends 0 and removes the vote', async () => {
    api.vote.mockResolvedValue({ upvotes: 10, user_vote: null });
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    
    const votePromise = service.applyVote(1, 0);
    
    expect(service.posts()[0].upvotes).toBe(10);
    expect(service.posts()[0].user_vote).toBeNull();
    
    await votePromise;
    expect(api.vote).toHaveBeenCalledWith(1, 0);
  });

  it('adopts server truth upon successful request', async () => {
    api.vote.mockResolvedValue({ upvotes: 99, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    
    await service.applyVote(1, 1);
    
    expect(service.posts()[0].upvotes).toBe(99);
  });

  it('reverts the UI and sets an error on network failure', async () => {
    api.vote.mockRejectedValue(new Error('Network error'));
    const service = configure();
    service.setServerPosts([makePost(1)]);
    
    await service.applyVote(1, 1);
    
    // UI reverted to old state
    expect(service.posts()[0].upvotes).toBe(10);
    expect(service.posts()[0].user_vote).toBeNull();
    expect(service.voteErrors().get(1)).toBe('Network error');
  });

  it('does nothing when not authenticated', async () => {
    const service = configure(makeAuth(null));
    service.setServerPosts([makePost(1)]);
    
    await service.applyVote(1, 1);
    
    expect(service.posts()[0].upvotes).toBe(10);
    expect(api.vote).not.toHaveBeenCalled();
  });

  it('clears all vote state when the user logs out', () => {
    const auth = makeAuth();
    const service = configure(auth);
    TestBed.flushEffects();

    service.setServerPosts([makePost(1, { user_vote: 1 })]);
    expect(service.posts()[0].user_vote).toBe(1);

    auth.user.set(null);
    TestBed.flushEffects();

    expect(service.posts()[0].user_vote).toBeNull();
  });

  it('triggers reload when auth transitions from null to User', () => {
    const auth = makeAuth(null);
    const service = configure(auth);
    TestBed.flushEffects();

    expect(service.reloadRequested()).toBeNull();

    auth.user.set(TEST_USER);
    TestBed.flushEffects();

    expect(service.reloadRequested()).not.toBeNull();
  });
});
