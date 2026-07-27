import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesBugComponent } from './features-bug.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';

class MockApiService {
  getPosts = vi.fn();
  vote = vi.fn();
  createPost = vi.fn();
}

function createMockAuth(user: any = null) {
  return { user: signal(user) };
}

describe('FeaturesBugComponent', () => {
  let component: FeaturesBugComponent;
  let fixture: ComponentFixture<FeaturesBugComponent>;
  let api: MockApiService;

  beforeAll(() => {
    window.scrollTo = vi.fn() as any;
  });

  beforeEach(() => {
    api = new MockApiService();
    api.getPosts.mockResolvedValue({ posts: [], nextCursor: null });

    TestBed.configureTestingModule({
      imports: [FeaturesBugComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: createMockAuth({ id: 1, username: 'test' }) },
      ],
    });

    fixture = TestBed.createComponent(FeaturesBugComponent);
    component = fixture.componentInstance;
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('starts with empty posts and no error', () => {
    expect(component.posts()).toEqual([]);
    expect(component.loadError()).toBeNull();
    expect(component.loading()).toBe(true);
  });

  it('calls loadPosts on init', () => {
    const spy = vi.spyOn(component, 'loadPosts');
    component.ngOnInit();
    expect(spy).toHaveBeenCalled();
  });

  describe('vote()', () => {
    const mockPost = {
      id: 1, upvotes: 10, user_vote: null, type: 'feature' as const,
      status: 'current' as const, title: 'Test', content: 'Content',
      username: 'user', user_id: 1, created_at: '2024-01-01',
    };

    beforeEach(() => {
      component.posts.set([mockPost]);
    });

    it('does nothing when not authenticated', () => {
      const auth = TestBed.inject(AuthService);
      auth.user.set(null);
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(10);
    });

    it('does nothing for non-existent post', () => {
      component.vote(999, 1);
      expect(component.posts()[0].upvotes).toBe(10);
    });

    it('sets up VoteState with intent on vote', () => {
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      expect(state).toBeDefined();
      expect(state.intent).toBe(1);
    });

    it('applies optimistic update immediately on new upvote', () => {
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(11);
      expect(component.posts()[0].user_vote).toBe(1);
    });

    it('applies optimistic update immediately on new downvote', () => {
      component.vote(1, -1);
      expect(component.posts()[0].upvotes).toBe(9);
      expect(component.posts()[0].user_vote).toBe(-1);
    });

    it('toggles off when clicking same vote value', () => {
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(11);
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(10);
      expect(component.posts()[0].user_vote).toBeNull();
    });

    it('saves to sessionStorage on vote', () => {
      component.vote(1, 1);
      const stored = sessionStorage.getItem('pendingVotes');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed[1]).toBe(1);
    });

    it('sets debounce timer on vote', () => {
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      component.vote(1, 1);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300);
    });

    it('coalesces rapid clicks within debounce window', () => {
      component.vote(1, 1);
      component.vote(1, -1);
      component.vote(1, 0);
      const state = (component as any).voteStates.get(1);
      expect(state.intent).toBe(0);
    });
  });

  describe('applyOptimistic logic', () => {
    const basePost = {
      id: 1, upvotes: 10, user_vote: null, type: 'feature' as const,
      status: 'current' as const, title: 'T', content: 'C',
      username: 'u', user_id: 1, created_at: '2024-01-01',
    };

    it('new upvote: fromVote=0, intent=1 → delta=1', () => {
      component.posts.set([{ ...basePost, user_vote: null }]);
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(11);
      expect(component.posts()[0].user_vote).toBe(1);
    });

    it('new downvote: fromVote=0, intent=-1 → delta=-1', () => {
      component.posts.set([{ ...basePost, user_vote: null }]);
      component.vote(1, -1);
      expect(component.posts()[0].upvotes).toBe(9);
      expect(component.posts()[0].user_vote).toBe(-1);
    });

    it('toggle off upvote: fromVote=1, intent=0 → delta=-1', () => {
      component.posts.set([{ ...basePost, upvotes: 11, user_vote: 1 }]);
      component.vote(1, 0);
      const state = (component as any).voteStates.get(1);
      expect(state.intent).toBe(0);
      expect(component.posts()[0].upvotes).toBe(10);
      expect(component.posts()[0].user_vote).toBeNull();
    });

    it('switch upvote→downvote: fromVote=1, intent=-1 → delta=-2', () => {
      component.posts.set([{ ...basePost, upvotes: 11, user_vote: 1 }]);
      component.vote(1, -1);
      expect(component.posts()[0].upvotes).toBe(9);
      expect(component.posts()[0].user_vote).toBe(-1);
    });

    it('switch downvote→upvote: fromVote=-1, intent=1 → delta=2', () => {
      component.posts.set([{ ...basePost, upvotes: 9, user_vote: -1 }]);
      component.vote(1, 1);
      expect(component.posts()[0].upvotes).toBe(11);
      expect(component.posts()[0].user_vote).toBe(1);
    });
  });

  describe('flushVote', () => {
    const mockPost = {
      id: 1, upvotes: 10, user_vote: null, type: 'feature' as const,
      status: 'current' as const, title: 'T', content: 'C',
      username: 'u', user_id: 1, created_at: '2024-01-01',
    };

    beforeEach(() => {
      component.posts.set([mockPost]);
    });

    it('calls api.vote with correct params on flush', async () => {
      api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(api.vote).toHaveBeenCalledWith(1, 1);
    });

    it('updates post with server response on success', async () => {
      api.vote.mockResolvedValue({ upvotes: 15, user_vote: 1 });
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(component.posts()[0].upvotes).toBe(15);
      expect(component.posts()[0].user_vote).toBe(1);
    });

    it('clears serverSnapshot after successful flush', async () => {
      api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(state.serverSnapshot).toBeNull();
    });

    it('removes from voteStates on successful flush with no chained intent', async () => {
      api.vote.mockResolvedValue({ upvotes: 11, user_vote: 1 });
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect((component as any).voteStates.has(1)).toBe(false);
    });

    it('handles error and preserves optimistic state', async () => {
      api.vote.mockRejectedValue(new Error('Network error'));
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(component.posts()[0].upvotes).toBe(11);
      expect(component.posts()[0].user_vote).toBe(1);
    });

    it('sets voteError on API failure', async () => {
      api.vote.mockRejectedValue(new Error('Network error'));
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(component.voteErrors().get(1)).toBe('Network error');
    });

    it('clears voteInFlight on error', async () => {
      api.vote.mockRejectedValue(new Error('Network error'));
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(component.voteInFlight().has(1)).toBe(false);
    });

    it('sets retry timer on error', async () => {
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      api.vote.mockRejectedValue(new Error('Network error'));
      component.vote(1, 1);
      const state = (component as any).voteStates.get(1);
      state.inFlight = false;
      await (component as any).flushVote(1);
      expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2000);
    });
  });

  describe('replayPendingVotes', () => {
    const mockPost = {
      id: 1, upvotes: 10, user_vote: null, type: 'feature' as const,
      status: 'current' as const, title: 'T', content: 'C',
      username: 'u', user_id: 1, created_at: '2024-01-01',
    };

    beforeEach(() => {
      component.posts.set([mockPost]);
      sessionStorage.clear();
    });

    it('replays pending votes from sessionStorage', () => {
      api.vote.mockResolvedValue({ upvotes: 15, user_vote: 1 });
      sessionStorage.setItem('pendingVotes', JSON.stringify({ 1: 1 }));
      (component as any).replayPendingVotes();
      const state = (component as any).voteStates.get(1);
      expect(state).toBeDefined();
      expect(state.intent).toBe(1);
    });

    it('skips posts not in current post list', () => {
      sessionStorage.setItem('pendingVotes', JSON.stringify({ 999: 1 }));
      (component as any).replayPendingVotes();
      expect((component as any).voteStates.has(999)).toBe(false);
    });

    it('skips invalid intent values', () => {
      sessionStorage.setItem('pendingVotes', JSON.stringify({ 1: 42 }));
      (component as any).replayPendingVotes();
      expect((component as any).voteStates.has(1)).toBe(false);
    });

    it('clears corrupted sessionStorage data', () => {
      sessionStorage.setItem('pendingVotes', 'not-json');
      (component as any).replayPendingVotes();
      expect(sessionStorage.getItem('pendingVotes')).toBeNull();
    });
  });

  describe('loadPosts', () => {
    it('sets loadError on failure', async () => {
      api.getPosts.mockRejectedValue(new Error('Network error'));
      await component.loadPosts();
      expect(component.loadError()).toBe('Failed to load posts. Check your connection.');
    });

    it('clears loading state after fetch', async () => {
      await component.loadPosts();
      expect(component.loading()).toBe(false);
    });
  });
});
