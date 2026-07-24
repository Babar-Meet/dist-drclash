import { Context, Next } from 'hono';

interface RateLimitStore {
  [key: string]: { count: number; reset: number };
}

const store: RateLimitStore = {};

function rateLimit(max: number, windowMs: number) {
  return (c: Context, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();

    const entry = store[key];
    if (!entry || now > entry.reset) {
      store[key] = { count: 1, reset: now + windowMs };
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests. Try again later.' }, 429);
    }

    return next();
  };
}

const strictRateLimit = rateLimit(10, 60_000);
const standardRateLimit = rateLimit(30, 60_000);
const generousRateLimit = rateLimit(100, 60_000);

export { strictRateLimit, standardRateLimit, generousRateLimit };
