import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
}

function getAuthUser(c: Context): AuthUser | null {
  const user = c.get('user');
  return user || null;
}

async function jwtVerify(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload: any = await verify(auth.slice(7), c.env.JWT_SECRET, 'HS256');
      c.set('user', {
        id: payload.id,
        email: payload.email,
        username: payload.username,
        is_admin: payload.is_admin,
      });
    } catch {}
  }
  await next();
}

function requireAuth(c: Context, next: Next) {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
}

function requireAdmin(c: Context, next: Next) {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!user.is_admin) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
}

export { getAuthUser, jwtVerify, requireAuth, requireAdmin };
