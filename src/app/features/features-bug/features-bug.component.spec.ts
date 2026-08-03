import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesBugComponent } from './features-bug.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { VoteService } from '../../core/services/vote.service';
import { signal } from '@angular/core';

class MockApiService {
  getPosts = vi.fn();
  vote = vi.fn();
  createPost = vi.fn();
}

function createMockAuth(user: any = null) {
  return { user: signal(user) };
}

function createMockVoteService() {
  return {
    posts: signal([]),
    voteErrors: signal(new Map()),
    voteInFlight: signal(new Set()),
    reloadRequested: signal<number | null>(null),
    applyVote: vi.fn(),
    setServerPosts: vi.fn(),
    appendServerPosts: vi.fn(),
    prependServerPost: vi.fn(),
  };
}

describe('FeaturesBugComponent', () => {
  let component: FeaturesBugComponent;
  let fixture: ComponentFixture<FeaturesBugComponent>;
  let api: MockApiService;
  let voteService: ReturnType<typeof createMockVoteService>;

  beforeAll(() => {
    window.scrollTo = vi.fn() as any;
  });

  beforeEach(() => {
    api = new MockApiService();
    api.getPosts.mockResolvedValue({ posts: [], nextCursor: null, reqTime: 123 });
    voteService = createMockVoteService();

    TestBed.configureTestingModule({
      imports: [FeaturesBugComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: createMockAuth({ id: 1, username: 'test' }) },
        { provide: VoteService, useValue: voteService },
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
    it('does nothing when not authenticated', () => {
      const auth = TestBed.inject(AuthService);
      auth.user.set(null);
      component.vote(1, 1);
      expect(voteService.applyVote).not.toHaveBeenCalled();
    });

    it('delegates to VoteService when authenticated', () => {
      component.vote(1, 1);
      expect(voteService.applyVote).toHaveBeenCalledWith(1, 1);
    });

    it('delegates downvotes too', () => {
      component.vote(1, -1);
      expect(voteService.applyVote).toHaveBeenCalledWith(1, -1);
    });
  });

  describe('loadPosts', () => {
    it('feeds the server list into VoteService on fresh load', async () => {
      api.getPosts.mockResolvedValue({ posts: [{ id: 1 }], nextCursor: null, reqTime: 123 });
      await component.loadPosts();
      expect(voteService.setServerPosts).toHaveBeenCalledWith([{ id: 1 }], 123);
    });

    it('appends posts via VoteService on pagination', async () => {
      api.getPosts.mockResolvedValue({ posts: [{ id: 2 }], nextCursor: null, reqTime: 123 });
      await component.loadPosts(5);
      expect(voteService.appendServerPosts).toHaveBeenCalledWith([{ id: 2 }], 123);
    });

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

  describe('submitPost', () => {
    it('prepends the created post via VoteService', async () => {
      api.createPost.mockResolvedValue({ post: { id: 7 } });
      component.formTitle = 'New';
      component.formContent = 'Body';
      await component.submitPost();
      expect(voteService.prependServerPost).toHaveBeenCalledWith({ id: 7 });
      expect(component.showForm()).toBe(false);
    });
  });

  describe('setFilter', () => {
    it('reloads posts when the filter changes', () => {
      const spy = vi.spyOn(component, 'loadPosts');
      component.setFilter('bug');
      expect(spy).toHaveBeenCalled();
    });
  });
});
