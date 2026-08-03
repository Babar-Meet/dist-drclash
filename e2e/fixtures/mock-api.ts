export class MockApiHandler {
  constructor() {
    this.posts = new Map();
    this.votes = [];
    this.nextId = 100;
    this.failNextVote = false;
    this.slowNextVote = false;
    this.slowPosts = false;
    this.stalePosts = false;
    this.voteCallCount = 0;
    this.seedPosts();
  }

  seedPosts() {
    for (let i = 0; i < 55; i++) {
      const id = this.nextId++;
      this.posts.set(id, {
        id,
        user_id: 1,
        type: 'feature',
        status: 'current',
        title: `Post ${i}`,
        content: 'Test content',
        upvotes: 10000 - i * 100,
        username: 'tester',
        user_vote: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  setFailNextVote(fail) { this.failNextVote = fail; }
  setSlowNextVote(slow) { this.slowNextVote = slow; }
  setSlowPosts(slow) { this.slowPosts = slow; }
  setStalePosts(stale) { this.stalePosts = stale; }

  reset() {
    this.posts.clear();
    this.votes = [];
    this.nextId = 100;
    this.failNextVote = false;
    this.slowNextVote = false;
    this.slowPosts = false;
    this.stalePosts = false;
    this.voteCallCount = 0;
    this.seedPosts();
  }

  getPost(id) {
    return this.posts.get(id);
  }

  getAllPosts() {
    return Array.from(this.posts.values())
      .sort((a, b) => b.upvotes - a.upvotes || b.id - a.id);
  }

  async setup(page) {
    await page.unroute('**/api/**');
    await page.unroute('**/api/posts*');
    await page.unroute('**/api/vote');
    await page.unroute('**/api/auth/me');

    await page.route('**/api/**', (route) => {
      route.fallback();
    });

    await page.route('**/api/posts*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const id = this.nextId++;
        const post = {
          id, user_id: 1, type: body.type, status: 'current',
          title: body.title, content: body.content,
          upvotes: 0, username: 'tester', user_vote: null,
          created_at: new Date().toISOString(),
        };
        this.posts.set(id, post);
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ post }),
        });
      }
      const url = new URL(route.request().url());
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      let filtered = this.getAllPosts();
      if (type) filtered = filtered.filter(p => p.type === type);
      if (status) filtered = filtered.filter(p => p.status === status);

      if (this.stalePosts) {
        this.stalePosts = false;
        const snapshot = JSON.parse(JSON.stringify(filtered));
        await new Promise(r => setTimeout(r, 500));
        filtered = snapshot;
      } else if (this.slowPosts) {
        this.slowPosts = false;
        await new Promise(r => setTimeout(r, 500));
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: filtered, nextCursor: null }),
      });
    });

    await page.route('**/api/vote', async (route) => {
      this.voteCallCount++;
      if (this.failNextVote) {
        this.failNextVote = false;
        return route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) });
      }

      const body = route.request().postDataJSON();
      const { post_id, value } = body;
      const post = this.posts.get(post_id);
      if (!post) {
        return route.fulfill({ status: 404, body: JSON.stringify({ error: 'Post not found' }) });
      }

      let newUserVote;
      let newUpvotes = post.upvotes;

      if (value === 0) {
        if (post.user_vote !== null) {
          newUpvotes = post.upvotes - post.user_vote;
        }
        newUserVote = null;
      } else if (post.user_vote === value) {
        // Idempotent no-op: requested state already matches.
        newUserVote = value;
      } else if (post.user_vote === -value) {
        newUpvotes = post.upvotes + value * 2;
        newUserVote = value;
      } else if (post.user_vote === null) {
        newUpvotes = post.upvotes + value;
        newUserVote = value;
      } else {
        newUpvotes = post.upvotes + value;
        newUserVote = value;
      }

      const existingIdx = this.votes.findIndex(v => v.post_id === post_id);
      if (value === 0 && existingIdx >= 0) {
        this.votes.splice(existingIdx, 1);
      } else if (value !== 0 && existingIdx >= 0) {
        this.votes[existingIdx].value = value;
      } else if (value !== 0) {
        this.votes.push({ post_id, user_id: 1, value });
      }

      post.upvotes = Math.max(0, newUpvotes);
      post.user_vote = newUserVote;

      if (this.slowNextVote) {
        this.slowNextVote = false;
        await new Promise(r => setTimeout(r, 500));
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ upvotes: post.upvotes, user_vote: post.user_vote }),
      });
    });

    await page.route('**/api/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 1, email: 'test@test.com', username: 'tester', is_admin: false } }),
      });
    });
  }
}
