import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { applyVote, type VoteResult } from '../src/index';

interface D1Statement {
  __entry: { sql: string; params: unknown[] };
  first(): Promise<Record<string, unknown> | null>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number } }>;
}

interface FakeD1 {
  prepare(sql: string): { bind(...params: unknown[]): D1Statement };
  batch(stmts: D1Statement[]): Promise<unknown[]>;
}

function createSqlite(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL);
    CREATE TABLE votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      value INTEGER NOT NULL CHECK(value IN (1, -1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );
  `);
  return db;
}

function makeD1(sqlite: DatabaseSync): FakeD1 {
  return {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...params: unknown[]) {
          return {
            __entry: { sql, params },
            async first() {
              const rows = stmt.all(...params);
              return (rows[0] as Record<string, unknown>) ?? null;
            },
            async all() {
              return { results: stmt.all(...(params as never[])) as Record<string, unknown>[] };
            },
            async run() {
              const info = stmt.run(...(params as never[]));
              return {
                success: true,
                meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes },
              };
            },
          };
        },
      };
    },
    async batch(stmts: D1Statement[]) {
      const results: unknown[] = [];
      for (const s of stmts) {
        const run = sqlite.prepare(s.__entry.sql);
        const info = run.run(...(s.__entry.params as never[]));
        results.push({ success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } });
      }
      return results;
    },
  };
}

function seedPost(sqlite: DatabaseSync, id: number): void {
  sqlite.prepare('INSERT INTO posts (id, title) VALUES (?, ?)').run(id, 'Post');
}

function seedOthers(sqlite: DatabaseSync, postId: number, others: number): void {
  // Represent the net sum of other users' votes as individual rows.
  let user = 100;
  while (others > 0) {
    sqlite.prepare('INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, 1)').run(postId, user++);
    others -= 1;
  }
  while (others < 0) {
    sqlite.prepare('INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, -1)').run(postId, user++);
    others += 1;
  }
}

function seedUserVote(sqlite: DatabaseSync, postId: number, userId: number, vote: number | null): void {
  if (vote !== null) {
    sqlite.prepare('INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, ?)').run(postId, userId, vote);
  }
}

function dbTruth(sqlite: DatabaseSync, postId: number, userId: number) {
  const sumRow = sqlite
    .prepare('SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE post_id = ?')
    .get(postId) as { s: number };
  const voteRow = sqlite
    .prepare('SELECT value FROM votes WHERE post_id = ? AND user_id = ?')
    .get(postId, userId) as { value: number } | undefined;
  return { raw: Number(sumRow.s), userVote: voteRow?.value ?? null };
}

function reference(others: number, seedVote: number | null, seq: number[]) {
  let uv = seedVote;
  for (const v of seq) {
    uv = v === 0 ? null : v;
  }
  const raw = others + (uv ?? 0);
  return { raw, userVote: uv, upvotes: Math.max(0, raw) };
}

const CLICKS = [1, -1, 0] as const;

function* sequences(maxLen: number): Generator<number[]> {
  let prev: number[][] = [[]];
  for (let len = 1; len <= maxLen; len++) {
    const cur: number[][] = [];
    for (const seq of prev) {
      for (const v of CLICKS) cur.push([...seq, v]);
    }
    prev = cur;
    for (const s of cur) yield s;
  }
}

const INITIAL = [
  { others: 0, seedVote: null },
  { others: 1, seedVote: null },
  { others: 2, seedVote: 1 },
  { others: -1, seedVote: -1 },
  { others: 0, seedVote: 1 },
  { others: 1, seedVote: -1 },
] as const;

function caseLabel(others: number, seedVote: number | null, seq: number[]) {
  return `others=${others}, seedVote=${seedVote}, seq=[${seq.join(',')}]`;
}

async function runSequence(others: number, seedVote: number | null, seq: number[], userId = 42) {
  const sqlite = createSqlite();
  seedPost(sqlite, 7);
  seedOthers(sqlite, 7, others);
  seedUserVote(sqlite, 7, userId, seedVote);
  const db = makeD1(sqlite) as unknown as D1Database;

  let last: VoteResult | { error: string } | undefined;
  for (const v of seq) {
    last = await applyVote(db, 7, userId, v);
  }
  const truth = dbTruth(sqlite, 7, userId);
  return { last, truth };
}

describe('applyVote (server vote contract, real SQLite)', () => {
  it('rejects an invalid value', async () => {
    const sqlite = createSqlite();
    seedPost(sqlite, 1);
    const db = makeD1(sqlite) as unknown as D1Database;
    const res = await applyVote(db, 1, 5, 2 as never);
    expect(res).toEqual({ error: 'Value must be -1, 0, or 1.' });
  });

  it('returns Post not found for a missing post', async () => {
    const sqlite = createSqlite();
    const db = makeD1(sqlite) as unknown as D1Database;
    const res = await applyVote(db, 999, 5, 1);
    expect(res).toEqual({ error: 'Post not found.' });
  });

  it('a single user can vote, switch, and clear without drifting the count', async () => {
    const sqlite = createSqlite();
    seedPost(sqlite, 1);
    const db = makeD1(sqlite) as unknown as D1Database;

    const up = await applyVote(db, 1, 5, 1);
    expect(up).toEqual({ upvotes: 1, raw_upvotes: 1, user_vote: 1 });
    const sw = await applyVote(db, 1, 5, -1);
    expect(sw).toEqual({ upvotes: 0, raw_upvotes: -1, user_vote: -1 });
    const up2 = await applyVote(db, 1, 5, 1);
    expect(up2).toEqual({ upvotes: 1, raw_upvotes: 1, user_vote: 1 });
    const clear = await applyVote(db, 1, 5, 0);
    expect(clear).toEqual({ upvotes: 0, raw_upvotes: 0, user_vote: null });
  });

  it('repeated identical values are absolute-state no-ops (no drift)', async () => {
    const sqlite = createSqlite();
    seedPost(sqlite, 1);
    seedOthers(sqlite, 1, 2);
    const db = makeD1(sqlite) as unknown as D1Database;

    const first = await applyVote(db, 1, 5, 1);
    const second = await applyVote(db, 1, 5, 1);
    const third = await applyVote(db, 1, 5, 1);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first).toEqual({ upvotes: 3, raw_upvotes: 3, user_vote: 1 });
  });

  it('different users vote independently on the same post', async () => {
    const sqlite = createSqlite();
    seedPost(sqlite, 1);
    const db = makeD1(sqlite) as unknown as D1Database;

    await applyVote(db, 1, 5, 1);
    await applyVote(db, 1, 6, -1);
    const r = await applyVote(db, 1, 7, 1);
    expect(r).toEqual({ upvotes: 1, raw_upvotes: 1, user_vote: 1 });
    expect(dbTruth(sqlite, 1, 5)).toEqual({ raw: 1, userVote: 1 });
    expect(dbTruth(sqlite, 1, 6)).toEqual({ raw: 1, userVote: -1 });
    expect(dbTruth(sqlite, 1, 7)).toEqual({ raw: 1, userVote: 1 });
  });

  it('floors the displayed count at 0 while preserving the raw sum', async () => {
    const sqlite = createSqlite();
    seedPost(sqlite, 1);
    const db = makeD1(sqlite) as unknown as D1Database;
    await applyVote(db, 1, 5, -1);
    await applyVote(db, 1, 6, -1);
    const r = await applyVote(db, 1, 7, -1);
    expect(r).toEqual({ upvotes: 0, raw_upvotes: -3, user_vote: -1 });
  });
});

describe('applyVote exhaustive: every click sequence converges to the votes table (1000+ cases)', () => {
  for (const { others, seedVote } of INITIAL) {
    for (const seq of sequences(5)) {
      it(`converges: ${caseLabel(others, seedVote, seq)}`, async () => {
        const { last, truth } = await runSequence(others, seedVote, seq);
        const expected = reference(others, seedVote, seq);

        if ('error' in last!) {
          throw new Error(`unexpected error for ${caseLabel(others, seedVote, seq)}: ${last.error}`);
        }
        expect(last.upvotes).toBe(expected.upvotes);
        expect(last.raw_upvotes).toBe(expected.raw);
        expect(last.user_vote).toBe(expected.userVote);
        expect(truth.raw).toBe(expected.raw);
        expect(truth.userVote).toBe(expected.userVote);
      });
    }
  }
});
