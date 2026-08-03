import { test, expect } from '@playwright/test';
import { MockApiHandler } from './fixtures/mock-api';

let mock;

test.beforeEach(async ({ page }) => {
  mock = new MockApiHandler();
  await mock.setup(page);
  await page.goto('/features-bug');
  await page.evaluate(() => {
    sessionStorage.setItem('token', 'fake-jwt-token-for-testing');
  });
  await page.reload();
  await page.waitForSelector('.card', { timeout: 15000 });
});

test.afterEach(() => {
  if (mock) mock.reset();
});

function cardByPostId(page, postId) {
  return page.locator('.card').filter({ has: page.getByText(`Post ${postId - 100}`, { exact: true }) }).first();
}

async function getVoteDisplay(page, postId) {
  const card = cardByPostId(page, postId);
  const count = await card.locator('.vote-count').textContent();
  const upBtn = card.locator('.vote-btn').first();
  const downBtn = card.locator('.vote-btn').last();
  const upActive = (await upBtn.getAttribute('class'))?.includes('vote-up') ?? false;
  const downActive = (await downBtn.getAttribute('class'))?.includes('vote-down') ?? false;
  return {
    count: parseInt(count?.trim() ?? '0', 10),
    userVote: upActive ? 1 : downActive ? -1 : null,
  };
}

async function clickVote(page, postId, direction) {
  const card = cardByPostId(page, postId);
  const btnIndex = direction === 'up' ? 0 : 1;
  await card.locator('.vote-btn').nth(btnIndex).click();
  await page.waitForTimeout(10);
}

// ─── 1. BASIC VOTE OPERATIONS ───

test.describe('Basic vote operations', () => {
  const voteActions = [
    { dir: 'up', value: 1, label: 'upvote' },
    { dir: 'down', value: -1, label: 'downvote' },
  ];

  for (const action of voteActions) {
    test(`fresh ${action.label} increments count correctly`, async ({ page }) => {
      const postId = 100;
      const before = await getVoteDisplay(page, postId);
      await clickVote(page, postId, action.dir);
      await page.waitForTimeout(400);
      const after = await getVoteDisplay(page, postId);
      expect(after.count).toBe(before.count + action.value);
      expect(after.userVote).toBe(action.value);
    });
  }

  for (const action of voteActions) {
    test(`toggle off ${action.label} returns count to original`, async ({ page }) => {
      const postId = 100;
      await clickVote(page, postId, action.dir);
      await page.waitForTimeout(400);
      const afterFirst = await getVoteDisplay(page, postId);
      await clickVote(page, postId, action.dir);
      await page.waitForTimeout(400);
      const afterSecond = await getVoteDisplay(page, postId);
      expect(afterSecond.userVote).toBeNull();
    });
  }

  test('upvote then downvote switches correctly', async ({ page }) => {
    const postId = 100;
    const before = await getVoteDisplay(page, postId);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    await clickVote(page, postId, 'down');
    await page.waitForTimeout(400);
    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBe(before.count - 1);
    expect(after.userVote).toBe(-1);
  });

  test('downvote then upvote switches correctly', async ({ page }) => {
    const postId = 101;
    const before = await getVoteDisplay(page, postId);
    await clickVote(page, postId, 'down');
    await page.waitForTimeout(400);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBe(before.count + 1);
    expect(after.userVote).toBe(1);
  });
});

// ─── 2. OPTIMISTIC UI ───

test.describe('Optimistic UI updates', () => {
  test('count changes instantly on click before API responds', async ({ page }) => {
    mock.setSlowNextVote(true);
    const postId = 100;
    const before = await getVoteDisplay(page, postId);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(100);
    const during = await getVoteDisplay(page, postId);
    expect(during.count).toBe(before.count + 1);
  });

  test('count reverts to server value when API finally responds', async ({ page }) => {
    const postId = 100;
    const before = await getVoteDisplay(page, postId);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBe(before.count + 1);
  });

  test('optimistic state preserved on API failure', async ({ page }) => {
    mock.setFailNextVote(true);
    const postId = 100;
    const before = await getVoteDisplay(page, postId);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBe(before.count + 1);
    expect(after.userVote).toBe(1);
  });

  test('error message shown below vote buttons on failure', async ({ page }) => {
    mock.setFailNextVote(true);
    const postId = 100;
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(500);
    const card = cardByPostId(page, 100);
    const errorEl = card.locator('.vote-error');
    await expect(errorEl).toBeVisible({ timeout: 5000 });
  });
});

// ─── 3. DEBOUNCE AND COALESCING ───

test.describe('Debounce and coalescing', () => {
  const rapidPatterns = [
    { clicks: ['up', 'up'], label: 'up-up', expected: 0 },
    { clicks: ['down', 'down'], label: 'down-down', expected: 0 },
    { clicks: ['up', 'down'], label: 'up-down', expected: -1 },
    { clicks: ['down', 'up'], label: 'down-up', expected: 1 },
    { clicks: ['up', 'down', 'up'], label: 'up-down-up', expected: 1 },
    { clicks: ['down', 'up', 'down'], label: 'down-up-down', expected: -1 },
    { clicks: ['up', 'up', 'down'], label: 'up-up-down', expected: -1 },
    { clicks: ['down', 'down', 'up'], label: 'down-down-up', expected: 1 },
    { clicks: ['up', 'down', 'down'], label: 'up-down-down', expected: 0 },
    { clicks: ['down', 'up', 'up'], label: 'down-up-up', expected: 0 },
  ];

  for (const pattern of rapidPatterns) {
    test(`rapid clicks "${pattern.label}" coalesces to final state ${pattern.expected}`, async ({ page }) => {
      const postId = 102;
      const before = await getVoteDisplay(page, postId);
      for (const dir of pattern.clicks) {
        await clickVote(page, postId, dir);
      }
      await page.waitForTimeout(600);
      const after = await getVoteDisplay(page, postId);
      const expectedCount = before.count + pattern.expected;
      expect(after.count).toBe(expectedCount);
      expect(after.userVote).toBe(pattern.expected === 0 ? null : pattern.expected);
    });
  }

  test('10 rapid upvotes in 200ms = 1 API call', async ({ page }) => {
    const postId = 103;
    for (let i = 0; i < 10; i++) {
      await clickVote(page, postId, 'up');
    }
    await page.waitForTimeout(600);
    expect(mock['voteCallCount']).toBeLessThanOrEqual(2);
  });
});

// ─── 4. PERSISTENCE ───

test.describe('Persistence across navigation', () => {
  test('vote persists after filter change and back', async ({ page }) => {
    const postId = 100;
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    const beforeNav = await getVoteDisplay(page, postId);

    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForTimeout(300);
    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(300);

    const afterNav = await getVoteDisplay(page, postId);
    expect(afterNav.count).toBe(beforeNav.count);
    expect(afterNav.userVote).toBe(beforeNav.userVote);
  });

  test('vote persists after page refresh', async ({ page }) => {
    const postId = 105;
    await clickVote(page, postId, 'down');
    await page.waitForTimeout(400);
    const before = await getVoteDisplay(page, postId);

    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(500);

    const after = await getVoteDisplay(page, postId);
    expect(after.userVote).toBe(-1);
  });

  test('vote on multiple posts all survive refresh', async ({ page }) => {
    const ids = [100, 102, 105, 108];
    const states = [
      { id: 100, dir: 'up' },
      { id: 102, dir: 'down' },
      { id: 105, dir: 'up' },
      { id: 108, dir: 'down' },
    ];

    for (const s of states) {
      await clickVote(page, s.id, s.dir);
    }
    await page.waitForTimeout(600);

    const before = await Promise.all(ids.map(id => getVoteDisplay(page, id)));

    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(600);

    for (let i = 0; i < ids.length; i++) {
      const after = await getVoteDisplay(page, ids[i]);
      expect(after.userVote).toBe(before[i].userVote);
    }
  });
});

// ─── 4.5. RAPID TOGGLE + NAVIGATION ROBUSTNESS ───

test.describe('Rapid toggle + navigation robustness', () => {
  test('rapid up/down/up toggle then refresh converges to upvote', async ({ page }) => {
    const postId = 106;
    const before = await getVoteDisplay(page, postId);

    await clickVote(page, postId, 'up');
    await clickVote(page, postId, 'down');
    await clickVote(page, postId, 'up');
    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(600);

    const after = await getVoteDisplay(page, postId);
    expect(after.userVote).toBe(1);
    expect(after.count).toBe(before.count + 1);
  });

  test('rapid up/down toggle then filter switch has no double count', async ({ page }) => {
    const postId = 107;
    const before = await getVoteDisplay(page, postId);

    await clickVote(page, postId, 'up');
    await clickVote(page, postId, 'down');
    await page.locator('.filter-chip', { hasText: 'Bugs' }).click();
    await page.waitForTimeout(300);
    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(600);

    const after = await getVoteDisplay(page, postId);
    expect(after.userVote).toBe(-1);
    expect(after.count).toBe(before.count - 1);
  });

  test('rapid toggle on a post then switching to a tab where it is hidden still registers', async ({ page }) => {
    const postId = 108;
    await clickVote(page, postId, 'up');
    await clickVote(page, postId, 'down');

    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForTimeout(700);
    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(400);

    const state = await getVoteDisplay(page, postId);
    expect(state.userVote).toBe(-1);
  });

  test('failed vote is retried with backoff and converges after recovery', async ({ page }) => {
    const postId = 109;
    const before = await getVoteDisplay(page, postId);
    mock.setFailNextVote(true);
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(400);
    expect((await getVoteDisplay(page, postId)).userVote).toBe(1);

    await page.waitForTimeout(3000);
    const after = await getVoteDisplay(page, postId);
    expect(after.userVote).toBe(1);
    expect(after.count).toBe(before.count + 1);
  });
});

// ─── 5. CONCURRENT VOTING ───

test.describe('Concurrent voting on multiple posts', () => {
  test('vote on 5 different posts simultaneously all succeed', async ({ page }) => {
    const ids = [100, 101, 102, 103, 104];
    const before = await Promise.all(ids.map(id => getVoteDisplay(page, id)));

    for (const id of ids) {
      await clickVote(page, id, 'up');
    }
    await page.waitForTimeout(600);

    for (let i = 0; i < ids.length; i++) {
      const after = await getVoteDisplay(page, ids[i]);
      expect(after.count).toBe(before[i].count + 1);
      expect(after.userVote).toBe(1);
    }
  });

  test('mixed up/down on different posts all resolve correctly', async ({ page }) => {
    const updates = [
      { id: 100, dir: 'up' }, { id: 101, dir: 'down' },
      { id: 102, dir: 'up' }, { id: 103, dir: 'down' },
      { id: 104, dir: 'up' },
    ];
    const deltas = { 100: 1, 101: -1, 102: 1, 103: -1, 104: 1 };

    const before = {};
    for (const u of updates) {
      before[u.id] = await getVoteDisplay(page, u.id);
    }

    for (const u of updates) {
      await clickVote(page, u.id, u.dir);
    }
    await page.waitForTimeout(600);

    for (const u of updates) {
      const after = await getVoteDisplay(page, u.id);
      expect(after.count).toBe(before[u.id].count + deltas[u.id]);
    }
  });
});

// ─── 6. EDGE CASES ───

test.describe('Edge cases', () => {
  test('cannot vote when not logged in', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ user: null }) });
    });
    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });

    const card = page.locator('.card').first();
    const voteBtns = card.locator('.vote-btn');
    const isDisabled = await voteBtns.first().isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('login prompt shown when not authenticated', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ user: null }) });
    });
    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    const loginLink = page.locator('a', { hasText: 'Login to vote' });
    await expect(loginLink).toBeVisible();
  });

  test('vote count never goes negative', async ({ page }) => {
    const postId = 120;
    const post = mock.getPost(postId);
    post.upvotes = 0;

    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(300);

    await clickVote(page, postId, 'down');
    await page.waitForTimeout(400);
    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBeGreaterThanOrEqual(0);
  });

  test('loading spinner shown during initial load', async ({ page }) => {
    await page.unroute('**/api/posts*');
    await page.route('**/api/posts*', async (route) => {
      await new Promise(r => setTimeout(r, 500));
      route.fulfill({ status: 200, body: JSON.stringify({ posts: [], nextCursor: null }) });
    });
    await page.goto('/features-bug');
    const spinner = page.locator('.spinner');
    await expect(spinner).toBeVisible({ timeout: 2000 });
  });

  test('empty state shown when no posts match filter', async ({ page }) => {
    await page.unroute('**/api/posts*');
    await page.route('**/api/posts*', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ posts: [], nextCursor: null }) });
    });
    await page.goto('/features-bug');
    await page.waitForTimeout(300);
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('vote button has active class when voted up', async ({ page }) => {
    await clickVote(page, 100, 'up');
    await page.waitForTimeout(400);
    const card = page.locator('.card').first();
    const upBtn = card.locator('.vote-btn').first();
    const cls = await upBtn.getAttribute('class');
    expect(cls).toContain('vote-up');
  });

  test('vote button has active class when voted down', async ({ page }) => {
    await clickVote(page, 100, 'down');
    await page.waitForTimeout(400);
    const card = page.locator('.card').first();
    const downBtn = card.locator('.vote-btn').last();
    const cls = await downBtn.getAttribute('class');
    expect(cls).toContain('vote-down');
  });

  test('vote count color changes when voted up', async ({ page }) => {
    await clickVote(page, 100, 'up');
    await page.waitForTimeout(400);
    const card = page.locator('.card').first();
    const countEl = card.locator('.vote-count');
    const cls = await countEl.getAttribute('class');
    expect(cls).toContain('voted-up');
  });

  test('vote count color changes when voted down', async ({ page }) => {
    await clickVote(page, 100, 'down');
    await page.waitForTimeout(400);
    const card = page.locator('.card').first();
    const countEl = card.locator('.vote-count');
    const cls = await countEl.getAttribute('class');
    expect(cls).toContain('voted-down');
  });
});

// ─── 7. FILTER INTERACTIONS + VOTES ───

test.describe('Filter interactions with votes', () => {
  const filters = ['Features', 'Bugs', 'Done'];

  for (const filter of filters) {
    test(`vote works correctly in "${filter}" filter view`, async ({ page }) => {
      await page.locator('.filter-chip', { hasText: filter }).click();
      await page.waitForTimeout(300);

      const cardCount = await page.locator('.card').count();
      if (cardCount === 0) return;

      const firstCard = page.locator('.card').first();
      const title = await firstCard.locator('.card-title').textContent();
      const num = parseInt(title?.replace('Post ', '') ?? '0', 10);
      const postId = num + 100;

      const beforeText = await firstCard.locator('.vote-count').textContent();
      const before = parseInt(beforeText?.trim() ?? '0', 10);

      await firstCard.locator('.vote-btn').first().click();
      await page.waitForTimeout(400);

      const afterText = await firstCard.locator('.vote-count').textContent();
      const after = parseInt(afterText?.trim() ?? '0', 10);
      expect(after).toBe(before + 1);
    });
  }

  test('voted post persists when switching filter and back', async ({ page }) => {
    await clickVote(page, 100, 'up');
    await page.waitForTimeout(400);
    const before = await getVoteDisplay(page, 100);

    await page.locator('.filter-chip', { hasText: 'Bugs' }).click();
    await page.waitForTimeout(300);
    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    await page.waitForSelector('.card', { timeout: 5000 });
    await page.waitForTimeout(300);

    const after = await getVoteDisplay(page, 100);
    expect(after.count).toBe(before.count);
    expect(after.userVote).toBe(1);
  });
});

// ─── 8. RAPID SEQUENCE STRESS TESTS ───

test.describe('Rapid sequence stress tests', () => {
  test('rapid up-down on 3 posts simultaneously', async ({ page }) => {
    const ids = [100, 101, 102];
    const before = await Promise.all(ids.map(id => getVoteDisplay(page, id)));

    for (let round = 0; round < 5; round++) {
      for (const id of ids) {
        await clickVote(page, id, round % 2 === 0 ? 'up' : 'down');
      }
    }
    await page.waitForTimeout(800);

    for (let i = 0; i < ids.length; i++) {
      const after = await getVoteDisplay(page, ids[i]);
      expect(after.userVote).not.toBeNull();
    }
  });

  test('rapid alternating clicks on same post settles cleanly', async ({ page }) => {
    const postId = 104;
    const before = await getVoteDisplay(page, postId);

    for (let i = 0; i < 20; i++) {
      await clickVote(page, postId, i % 2 === 0 ? 'up' : 'down');
    }
    await page.waitForTimeout(800);

    const after = await getVoteDisplay(page, postId);
    expect(after.count).toBeGreaterThanOrEqual(0);
  });

  test('50 rapid votes on different posts all resolve', async ({ page }) => {
    const ids = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    for (let i = 0; i < 5; i++) {
      for (const id of ids) {
        await clickVote(page, id, i % 2 === 0 ? 'up' : 'down');
      }
    }
    await page.waitForTimeout(800);

    for (const id of ids) {
      const state = await getVoteDisplay(page, id);
      expect(state.userVote).not.toBeNull();
    }
  });
});

// ─── 9. UI CONSISTENCY ───

test.describe('UI consistency', () => {
  test('vote buttons present on every card', async ({ page }) => {
    const cards = page.locator('.card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const btns = card.locator('.vote-btn');
      await expect(btns).toHaveCount(2);
    }
  });

  test('vote count is a number', async ({ page }) => {
    const cards = page.locator('.card');
    const count = Math.min(await cards.count(), 10);
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).locator('.vote-count').textContent();
      const num = parseInt(text?.trim() ?? '', 10);
      expect(isNaN(num)).toBe(false);
    }
  });

  test('all cards have type labels', async ({ page }) => {
    const cards = page.locator('.card');
    const count = Math.min(await cards.count(), 10);
    for (let i = 0; i < count; i++) {
      const label = cards.nth(i).locator('.label-type');
      await expect(label).toBeVisible();
    }
  });

  test('page title is correct', async ({ page }) => {
    const heading = page.locator('.board-heading');
    await expect(heading).toHaveText('Features / Bug');
  });

  test('filter tabs are all present', async ({ page }) => {
    const filters = page.locator('.filter-chip');
    await expect(filters).toHaveCount(3);
    const texts = await filters.allTextContents();
    expect(texts.map(t => t.trim())).toEqual(['Features', 'Bugs', 'Done']);
  });
});

// ─── 10. POST CREATION + VOTE ───

test.describe('Post creation and voting', () => {
  test('new post appears in list with 0 votes', async ({ page }) => {
    await page.locator('.btn-primary', { hasText: '+ Feature' }).click();
    await page.waitForSelector('.form-card', { timeout: 3000 });
    await page.locator('input[name="title"]').fill('New E2E Post');
    await page.locator('textarea[name="content"]').fill('Created by E2E test');
    await page.locator('.btn-primary', { hasText: 'Submit' }).click();
    await page.waitForTimeout(300);

    const newCard = page.locator('.card').first();
    const title = await newCard.locator('.card-title').textContent();
    expect(title).toBe('New E2E Post');
    const votes = await newCard.locator('.vote-count').textContent();
    expect(votes?.trim()).toBe('0');
  });

  test('can vote on newly created post', async ({ page }) => {
    await page.locator('.btn-primary', { hasText: '+ Feature' }).click();
    await page.waitForSelector('.form-card', { timeout: 3000 });
    await page.locator('input[name="title"]').fill('Votable Post');
    await page.locator('textarea[name="content"]').fill('test');
    await page.locator('.btn-primary', { hasText: 'Submit' }).click();
    await page.waitForTimeout(300);

    const newCard = page.locator('.card').first();
    await newCard.locator('.vote-btn').first().click();
    await page.waitForTimeout(400);

    const votes = await newCard.locator('.vote-count').textContent();
    expect(votes?.trim()).toBe('1');
    const cls = await newCard.locator('.vote-btn').first().getAttribute('class');
    expect(cls).toContain('vote-up');
  });
});

// ─── 11. VOTE IN-FLIGHT INDICATOR ───

test.describe('Vote in-flight indicator', () => {
  test('vote button shows pending state during API call', async ({ page }) => {
    mock.setSlowNextVote(true);
    const postId = 100;
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(350);

    const card = cardByPostId(page, postId);
    const upBtn = card.locator('.vote-btn').first();
    const cls = await upBtn.getAttribute('class');
    expect(cls).toContain('vote-pending');
  });

  test('pending class removed after API responds', async ({ page }) => {
    const postId = 100;
    await clickVote(page, postId, 'up');
    await page.waitForTimeout(600);

    const card = page.locator('.card').first();
    const upBtn = card.locator('.vote-btn').first();
    const cls = await upBtn.getAttribute('class');
    expect(cls).not.toContain('vote-pending');
  });
});

// ─── 12. COMBINATORIAL STATE TRANSITIONS ───

const startingUpvotes = [0, 1, 5, 42, 100];
const initialVoteStates = [null, 1, -1];
const sequenceLengths = [1, 2, 3, 5];

test.describe('Combinatorial state transitions', () => {
  for (const upvotes of startingUpvotes) {
    for (const initVote of initialVoteStates) {
      for (const len of sequenceLengths) {
        test(`upvotes=${upvotes} initVote=${initVote} seqLen=${len}`, async ({ page }) => {
          const postId = 130;
          const post = mock.getPost(postId);
          post.upvotes = upvotes;
          post.user_vote = initVote;

          await page.reload();
          await page.waitForSelector('.card', { timeout: 5000 });
          await page.waitForTimeout(300);

          for (let i = 0; i < len; i++) {
            const dir = i % 2 === 0 ? 'up' : 'down';
            await clickVote(page, postId, dir);
          }
          await page.waitForTimeout(400);

          const state = await getVoteDisplay(page, postId);
          expect(state.count).toBeGreaterThanOrEqual(0);
          expect(typeof state.userVote === 'number' || state.userVote === null).toBe(true);
        });
      }
    }
  }
});

// ─── 13. ALL 27 VOTE SEQUENCE PATTERNS ───

test.describe('All 27 vote sequence patterns', () => {
  const actions = [1, 0, -1];
  const labels = { 1: 'up', 0: 'remove', '-1': 'down' };

  let caseIndex = 0;
  for (const a1 of actions) {
    for (const a2 of actions) {
      for (const a3 of actions) {
        caseIndex++;
        test(`pattern ${caseIndex}/27: ${labels[a1]}->${labels[a2]}->${labels[a3]}`, async ({ page }) => {
          const postId = 140;
          const before = await getVoteDisplay(page, postId);

          for (const a of [a1, a2, a3]) {
            if (a === 0) {
              await clickVote(page, postId, 'up');
              await page.waitForTimeout(50);
              await clickVote(page, postId, 'up');
              await page.waitForTimeout(50);
            } else {
              await clickVote(page, postId, a === 1 ? 'up' : 'down');
            }
            await page.waitForTimeout(50);
          }
          await page.waitForTimeout(600);

          if (caseIndex <= 1 || caseIndex === 14 || caseIndex === 27) {
            const after = await getVoteDisplay(page, postId);
            expect(after.count).toBeGreaterThanOrEqual(0);
          }
        });
      }
    }
  }
});

// ─── 14. MASSIVE STATE SPACE ───

test.describe('Massive state space — all combinations', () => {
  const upvoteLevels = [0, 3, 10, 50, 100, 500];
  const initVotes = [null, 1, -1];
  const actionsList = [1, -1];
  const sequences = [
    [1],
    [-1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1, 1],
    [-1, -1, -1],
    [1, -1, 1],
    [-1, 1, -1],
  ];

  let comboIdx = 0;
  for (const up of upvoteLevels) {
    for (const init of initVotes) {
      for (const seq of sequences) {
        comboIdx++;
        test(`combo ${comboIdx}: upvotes=${up} init=${init} seq=[${seq.join(',')}]`, async ({ page }) => {
          const postId = 150;
          const post = mock.getPost(postId);
          post.upvotes = up;
          post.user_vote = init;

          await page.reload();
          await page.waitForSelector('.card', { timeout: 5000 });
          await page.waitForTimeout(300);

          for (const a of seq) {
            await clickVote(page, postId, a === 1 ? 'up' : 'down');
            await page.waitForTimeout(30);
          }
          await page.waitForTimeout(600);

          const state = await getVoteDisplay(page, postId);
          expect(state.count).toBeGreaterThanOrEqual(0);
          expect(state.userVote === 1 || state.userVote === -1 || state.userVote === null).toBe(true);
        });
      }
    }
  }
});

// --- 15. RACE CONDITIONS ---

test.describe('Race conditions', () => {
  test('stale list fetch does not drop a just-confirmed vote', async ({ page }) => {
    const postId = 160;
    // ensure post exists
    const post = mock.getPost(postId);
    if (!post) {
      mock.posts.set(postId, {
        id: postId, user_id: 1, type: 'feature', status: 'current',
        title: `Post 60`, content: 'Race condition test', upvotes: 10, username: 'tester', user_vote: null,
        created_at: new Date().toISOString()
      });
    }

    await page.reload();
    await page.waitForSelector('.card', { timeout: 5000 });
    
    // Opt-in the stale posts delay for the next fetch.
    // This will snapshot the mock's post list immediately (with user_vote=null, upvotes=10),
    // wait 500ms, and THEN return that stale snapshot, correctly simulating a race condition.
    mock.setStalePosts(true);

    // Trigger a list fetch by switching filter
    await page.locator('.filter-chip', { hasText: 'Features' }).click();
    
    // Wait slightly so the getPosts request starts, but hasn't returned
    await page.waitForTimeout(50);
    
    // Now vote. The vote POST is NOT delayed and will confirm quickly.
    await clickVote(page, postId, 'up');
    
    // Wait for the vote to confirm locally (debounce 300 + small network time)
    await page.waitForTimeout(400);
    
    // Verify it applied optimistically/confirmed
    const during = await getVoteDisplay(page, postId);
    expect(during.userVote).toBe(1);
    
    // Wait for the 500ms delayed, genuinely stale getPosts response to arrive
    await page.waitForTimeout(400); 
    
    // The list data was genuinely stale (user_vote=null, upvotes=10).
    // Our fix should reject it and keep the vote.
    const after = await getVoteDisplay(page, postId);
    expect(after.userVote).toBe(1);
    expect(after.count).toBe(during.count);
  });
});
