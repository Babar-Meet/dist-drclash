export class MockApiHandler {
  constructor() {
    this.posts = new Map();
    this.votes = [];
    this.otherVotes = new Map();
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
      const upvotes = 10000 - i * 100;
      this.posts.set(id, {
        id,
        user_id: 1,
        type: 'feature',
        status: 'current',
        title: `Post ${i}`,
        content: 'Test content',
        upvotes,
        raw_upvotes: upvotes,
        username: 'tester',
        user_vote: null,
        created_at: new Date().toISOString(),
      });
      // Baseline of votes from "other" (non test-user) voters, matching the
      // seeded counter. The test user's votes live in this.votes and are
      // summed on top, mirroring the real worker's votes table.
      this.otherVotes.set(id, upvotes);
    }
  }

  setFailNextVote(fail) { this.failNextVote = fail; }
  setSlowNextVote(slow) { this.slowNextVote = slow; }
  setSlowPosts(slow) { this.slowPosts = slow; }
  setStalePosts(stale) { this.stalePosts = stale; }

  reset() {
    this.posts.clear();
    this.votes = [];
    this.otherVotes.clear();
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
        this.otherVotes.set(id, 0);
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

      // Mirror the real worker: only mutate the test user's vote, then derive
      // the count from the votes array summed on top of the "other voters"
      // baseline. The votes array is the source of truth for the user's own
      // vote, so rapid clicks / replays can never drift the count.
      const existingIdx = this.votes.findIndex(v => v.post_id === post_id);
      if (value === 0) {
        if (existingIdx >= 0) this.votes.splice(existingIdx, 1);
      } else if (existingIdx >= 0) {
        this.votes[existingIdx].value = value;
      } else {
        this.votes.push({ post_id, user_id: 1, value });
      }

      const ownSum = this.votes
        .filter(v => v.post_id === post_id)
        .reduce((acc, v) => acc + v.value, 0);
      const raw = (this.otherVotes.get(post_id) ?? 0) + ownSum;
      post.upvotes = Math.max(0, raw);
      post.raw_upvotes = raw;
      post.user_vote = value === 0 ? null : value;

      if (this.slowNextVote) {
        this.slowNextVote = false;
        await new Promise(r => setTimeout(r, 500));
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ upvotes: post.upvotes, raw_upvotes: post.raw_upvotes, user_vote: post.user_vote }),
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
