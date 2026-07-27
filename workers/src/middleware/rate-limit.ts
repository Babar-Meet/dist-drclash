import { Context, Next } from 'hono';

async function rateLimit(c: Context, next: Next, max: number, windowMs: number, failClosed = false) {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const encoder = new TextEncoder();
  const ipHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(ip))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `${c.req.path}:${ipHash}`;

  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / (windowMs / 1000));

  try {
    await c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_key, count, expires_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(key, window_key) DO UPDATE SET count = count + 1`
    ).bind(key, windowKey, now + Math.ceil(windowMs / 1000)).run();

    const row = await c.env.DB.prepare(
      'SELECT count FROM rate_limits WHERE key = ? AND window_key = ?'
    ).bind(key, windowKey).first() as { count: number } | null;

    if (row && row.count > max) {
      return c.json({ error: 'Too many requests. Try again later.' }, 429);
    }
  } catch (e) {
    console.error('Rate limit check failed:', e);
    if (failClosed) {
      return c.json({ error: 'Service temporarily unavailable. Try again.' }, 503);
    }
  }

  await next();
}

function strictRateLimit(c: Context, next: Next) { return rateLimit(c, next, 10, 60_000, true); }
function standardRateLimit(c: Context, next: Next) { return rateLimit(c, next, 30, 60_000, false); }

async function voteRateLimit(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const { verify } = await import('hono/jwt');
    const payload: any = await verify(authHeader.slice(7), c.env.JWT_SECRET, 'HS256');
    const key = `vote:user:${payload.id}`;
    const max = 60;
    const windowMs = 60_000;
    const now = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(now / (windowMs / 1000));

    await c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_key, count, expires_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(key, window_key) DO UPDATE SET count = count + 1`
    ).bind(key, windowKey, now + Math.ceil(windowMs / 1000)).run();

    const row = await c.env.DB.prepare(
      'SELECT count FROM rate_limits WHERE key = ? AND window_key = ?'
    ).bind(key, windowKey).first() as { count: number } | null;

    if (row && row.count > max) {
      return c.json({ error: 'Too many votes. Please slow down.' }, 429);
    }
  } catch (e) {
    console.error('Vote rate limit check failed:', e);
    return c.json({ error: 'Service temporarily unavailable. Try again.' }, 503);
  }

  await next();
}

export { strictRateLimit, standardRateLimit, voteRateLimit };
