import { TestBed } from '@angular/core/testing';
import { signal, effect } from '@angular/core';
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
    localStorage.clear();
    api = { vote: vi.fn() };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('applies optimistic upvote immediately', () => {
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
  });

  it('applies optimistic downvote immediately', () => {
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, -1);
    expect(service.posts()[0].upvotes).toBe(9);
    expect(service.posts()[0].user_vote).toBe(-1);
  });

  it('switching up to down applies a delta of -2', () => {
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    service.applyVote(1, -1);
    expect(service.posts()[0].upvotes).toBe(9);
    expect(service.posts()[0].user_vote).toBe(-1);
  });

  it('switching down to up applies a delta of +2', () => {
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 9, user_vote: -1 })]);
    service.applyVote(1, 1);
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
  });

  it('clicking the same value sends an unvote', () => {
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    service.applyVote(1, 1);
    expect(service.posts()[0].upvotes).toBe(10);
    expect(service.posts()[0].user_vote).toBeNull();
  });

  it('does nothing when not authenticated', () => {
    const service = configure(makeAuth(null));
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    expect(service.posts()[0].upvotes).toBe(10);
    expect(api.vote).not.toHaveBeenCalled();
  });

  it('coalesces rapid clicks into one request with the final value', async () => {
    api.vote.mockResolvedValue({ upvotes: 9, user_vote: -1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    service.applyVote(1, -1);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.vote).toHaveBeenCalledTimes(1);
    expect(api.vote).toHaveBeenCalledWith(1, -1);
  });

  it('does not send concurrent requests for the same post', async () => {
    let resolveVote: (v: any) => void = () => {};
    api.vote.mockImplementation(
      () => new Promise(res => { resolveVote = res; })
    );
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.vote).toHaveBeenCalledTimes(1);

    service.applyVote(1, -1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.vote).toHaveBeenCalledTimes(1);

    resolveVote({ upvotes: 11, user_vote: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.vote).toHaveBeenCalledTimes(2);
    expect(api.vote).toHaveBeenLastCalledWith(1, -1);
  });

  it('writes the intent to the localStorage outbox before the network call', () => {
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    const stored = localStorage.getItem('pendingVotes');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ 1: 1 });
  });

  it('removes the outbox entry after a successful flush', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem('pendingVotes')).toBeNull();
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
  });

  it('hydrates pending intents from the outbox and flushes them', async () => {
    localStorage.setItem('pendingVotes', JSON.stringify({ 1: 1, 5: -1 }));
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.vote).toHaveBeenCalledWith(1, 1);
    expect(api.vote).toHaveBeenCalledWith(5, -1);
  });

  it('re-applies a pending intent on top of a fresh server list without double counting', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    expect(service.posts()[0].upvotes).toBe(11);

    service.setServerPosts([makePost(1)]);
    expect(service.posts()[0].upvotes).toBe(11);

    await vi.advanceTimersByTimeAsync(300);
    expect(service.posts()[0].upvotes).toBe(11);
    expect(api.vote).toHaveBeenCalledTimes(1);
  });

  it('keeps the intent on network failure and retries with backoff', async () => {
    api.vote.mockRejectedValueOnce(new Error('Network error'));
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.vote).toHaveBeenCalledTimes(1);
    expect(service.voteErrors().get(1)).toBe('Network error');
    expect(JSON.parse(localStorage.getItem('pendingVotes')!)).toEqual({ 1: 1 });
    expect(service.posts()[0].upvotes).toBe(11);

    await vi.advanceTimersByTimeAsync(3000);
    expect(api.vote).toHaveBeenCalledTimes(2);
    expect(service.posts()[0].upvotes).toBe(11);
    expect(localStorage.getItem('pendingVotes')).toBeNull();
    expect(service.voteErrors().has(1)).toBe(false);
  });

  it('drops the intent on a 400 validation error without retrying', async () => {
    const err: any = new Error('Value must be -1, 0, or 1.');
    err.status = 400;
    api.vote.mockRejectedValueOnce(err);
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.vote).toHaveBeenCalledTimes(1);
    expect(service.voteErrors().get(1)).toBe('Value must be -1, 0, or 1.');
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.vote).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pendingVotes')).toBeNull();
  });

  it('drops the intent and requests a reload on a 404', async () => {
    const err: any = new Error('Post not found.');
    err.status = 404;
    api.vote.mockRejectedValueOnce(err);
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(service.reloadRequested()).toBe(1);
    expect(localStorage.getItem('pendingVotes')).toBeNull();
  });

  it('honors the Retry-After header on a 429', async () => {
    const err: any = new Error('Too many votes.');
    err.status = 429;
    err.retryAfter = '10';
    api.vote.mockRejectedValueOnce(err);
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.vote).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.vote).toHaveBeenCalledTimes(2);
  });

  it('clears all vote state when the user logs out', () => {
    const auth = makeAuth();
    const service = configure(auth);
    TestBed.flushEffects();

    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    expect(service.posts()[0].user_vote).toBe(1);

    auth.user.set(null);
    TestBed.flushEffects();

    expect(service.posts().length).toBe(0);
    expect(localStorage.getItem('pendingVotes')).toBeNull();
    expect(service.voteInFlight().size).toBe(0);
  });

  it('falls back to in-memory storage when localStorage throws', () => {
    const original = localStorage.setItem;
    localStorage.setItem = (() => {
      throw new Error('quota exceeded');
    }) as any;
    try {
      const service = configure();
      service.setServerPosts([makePost(1)]);
      service.applyVote(1, 1);
      expect(service.posts()[0].upvotes).toBe(11);
    } finally {
      localStorage.setItem = original;
    }
  });

  // --- NEW TESTS ---

  it('atomically updates posts without transient double-count on flush success', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    
    let callCount = 0;
    // We observe the computed posts to catch any transient states
    TestBed.runInInjectionContext(() => {
      effect(() => {
        service.posts();
        callCount++;
      });
    });
    TestBed.flushEffects();
    
    const beforeCount = callCount;
    await vi.advanceTimersByTimeAsync(300); // Trigger flush
    TestBed.flushEffects();
    
    // The flush success should trigger exactly one computed update
    expect(callCount).toBe(beforeCount + 1);
    expect(service.posts()[0].upvotes).toBe(11);
  });

  it('rejects stale list data if loadPosts started before vote was confirmed', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    
    const reqTimeOld = Date.now();
    await vi.advanceTimersByTimeAsync(10);
    
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300); // Flush vote, confirmedAt is now Date.now()
    
    // Simulate list response arriving late with stale data
    service.setServerPosts([makePost(1, { upvotes: 10, user_vote: null })], reqTimeOld);
    
    // The confirmed vote state should win
    expect(service.posts()[0].upvotes).toBe(11);
    expect(service.posts()[0].user_vote).toBe(1);
  });

  it('accepts fresh list data if loadPosts started after vote was confirmed', async () => {
    api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
    const service = configure();
    
    service.setServerPosts([makePost(1)]);
    service.applyVote(1, 1);
    await vi.advanceTimersByTimeAsync(300); // Flush vote, confirmedAt is Date.now()
    
    await vi.advanceTimersByTimeAsync(10);
    const reqTimeNew = Date.now();
    
    // Simulate someone else voted on the same post making it 12, and we fetch
    service.setServerPosts([makePost(1, { upvotes: 12, user_vote: 1 })], reqTimeNew);
    
    // The fresh list data should win and evict the confirmed state
    expect(service.posts()[0].upvotes).toBe(12);
    expect(service.posts()[0].user_vote).toBe(1);
  });

  it('properly handles unvote (intent 0)', async () => {
    api.vote.mockResolvedValue({ upvotes: 10, user_vote: null });
    const service = configure();
    service.setServerPosts([makePost(1, { upvotes: 11, user_vote: 1 })]);
    
    service.applyVote(1, 1); // unvote
    expect(service.posts()[0].upvotes).toBe(10);
    expect(service.posts()[0].user_vote).toBeNull();
    
    await vi.advanceTimersByTimeAsync(300); // Flush
    expect(api.vote).toHaveBeenCalledWith(1, 0);
    expect(service.posts()[0].upvotes).toBe(10);
  });

  it('hydrates pending intents from legacy pendingVotes format correctly', () => {
    localStorage.setItem('pendingVotes', JSON.stringify({ 1: 1, 5: -1 }));
    const service = configure(); // hydration happens in constructor
    service.setServerPosts([
      makePost(1, { upvotes: 10, user_vote: null }),
      makePost(5, { upvotes: 10, user_vote: null })
    ]);
    
    expect(service.posts().find(p => p.id === 1)!.user_vote).toBe(1);
    expect(service.posts().find(p => p.id === 5)!.user_vote).toBe(-1);
  });

  it('syncs outbox across tabs via storage event', () => {
    const service = configure();
    service.setServerPosts([makePost(1)]);
    
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'pendingVotes',
      newValue: JSON.stringify({ 1: 1 })
    }));
    
    expect(service.posts()[0].user_vote).toBe(1);
  });

});
