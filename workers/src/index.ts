import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { getAuthUser, jwtVerify, requireAuth, requireUserAccount, requireUserVote } from './middleware/auth';
import { strictRateLimit, standardRateLimit, voteRateLimit } from './middleware/rate-limit';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  RESEND_API_KEY: string;
  RESEND_SENDER_EMAIL: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  APP_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', async (c, next) => {
  const origin = c.env.APP_URL || 'https://drclash.vercel.app';
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});
app.use('/api/*', jwtVerify);

// Security headers
app.use('/*', async (c, next) => {
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-XSS-Protection', '0');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' " + (c.env.APP_URL || 'https://drclash.vercel.app') + "; img-src 'self' data:; base-uri 'self'; form-action 'self';");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  await next();
});

// ──────────────────────────────────────
// Rate limited endpoints
// ──────────────────────────────────────
app.use('/api/auth/login', strictRateLimit);
app.use('/api/auth/register', strictRateLimit);
app.use('/api/auth/forgot-password', strictRateLimit);
app.use('/api/admin/login', strictRateLimit);
app.use('/api/auth/reset-password', strictRateLimit);
app.use('/api/posts', standardRateLimit);
app.use('/api/vote', voteRateLimit);

// ──────────────────────────────────────
// Health check
// ──────────────────────────────────────
app.get('/api/health', (c) => c.json({ ok: true }));

// ──────────────────────────────────────
// AUTH ROUTES
// ──────────────────────────────────────

// Register with email + password
app.post('/api/auth/register', async (c) => {
  try {
    const { email, username, password } = await c.req.json();
    if (!email || !username || !password) {
      return c.json({ error: 'Email, username, and password required.' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters.' }, 400);
    }
    if (email.length > 254) return c.json({ error: 'Email too long.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'Invalid email format.' }, 400);
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2 || cleanUsername.length > 30) {
      return c.json({ error: 'Username must be 2-30 characters.' }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      return c.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores.' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).bind(email, cleanUsername).first();

    if (existing) {
      return c.json({ error: 'Email or username already taken.' }, 409);
    }

    const hash = await pbkdf2Hash(password);
    const { success } = await c.env.DB.prepare(
      'INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)'
    ).bind(email, cleanUsername, hash).run();

    if (!success) {
      return c.json({ error: 'Failed to create account.' }, 500);
    }

    return c.json({ ok: true, message: 'Account created.' }, 201);
  } catch (e) {
    console.error('Register error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Login with email + password
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password required.' }, 400);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, email, username, password_hash, is_admin FROM users WHERE email = ?'
    ).bind(email).first<any>();

    if (!user) {
      return c.json({ error: 'Invalid email or password.' }, 401);
    }
    if (!user.password_hash) {
      return c.json({ error: 'This account uses Google sign-in. Sign in with Google or use Forgot Password to set a password.', code: 'oauth_only' }, 401);
    }

    const valid = await pbkdf2Compare(password, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid email or password.' }, 401);
    }

    const token = await sign(
      { sub: String(user.id), id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) },
      c.env.JWT_SECRET
    );

    return c.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin }
    });
  } catch (e) {
    console.error('Login error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Forgot password — sends email via Resend
app.post('/api/auth/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required.' }, 400);

    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    // Always say the same thing — no info leak about whether email exists
    if (!user) {
      return c.json({ message: 'If this email is registered, a reset link has been sent.' });
    }

    const resetToken = await sign(
      { sub: String((user as any).id), id: (user as any).id, purpose: 'password-reset', jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) },
      c.env.JWT_SECRET
    );

    const resetUrl = `${c.env.APP_URL}/reset-password?token=${resetToken}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: c.env.RESEND_SENDER_EMAIL,
        to: email,
        subject: 'Reset your Dr.Clash password',
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
      }),
    });

    return c.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (e) {
    console.error('Forgot password error:', e);
    return c.json({ message: 'Service temporarily unavailable. Please try again later.' }, 503);
  }
});

// Reset password
app.post('/api/auth/reset-password', async (c) => {
  try {
    const { token, password } = await c.req.json();
    if (!token || !password) return c.json({ error: 'Token and password required.' }, 400);
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters.' }, 400);

    const payload: any = await verify(token, c.env.JWT_SECRET, 'HS256');
    if (payload.purpose !== 'password-reset') {
      return c.json({ error: 'Invalid token.' }, 400);
    }

    const hash = await pbkdf2Hash(password);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(hash, payload.id).run();

    return c.json({ ok: true, message: 'Password updated.' });
  } catch (e) {
    console.error('Reset password error:', e);
    return c.json({ error: 'Invalid or expired token.' }, 400);
  }
});

// Update profile (username)
app.put('/api/auth/profile', requireAuth, requireUserAccount, async (c) => {
  try {
    const user = getAuthUser(c)!;
    const { username } = await c.req.json();
    if (!username || typeof username !== 'string') {
      return c.json({ error: 'Username required.' }, 400);
    }
    const clean = username.trim();
    if (clean.length < 2 || clean.length > 30) {
      return c.json({ error: 'Username must be 2-30 characters.' }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
      return c.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores.' }, 400);
    }

    const taken = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ?'
    ).bind(clean, user.id).first();
    if (taken) {
      return c.json({ error: 'Username already taken.' }, 409);
    }

    await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?')
      .bind(clean, user.id).run();

    const updated = await c.env.DB.prepare(
      'SELECT id, email, username, is_admin FROM users WHERE id = ?'
    ).bind(user.id).first<any>();

    return c.json({ user: { id: updated.id, email: updated.email, username: updated.username, is_admin: !!updated.is_admin } });
  } catch (e) {
    console.error('Profile update error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Delete account and all associated data
app.delete('/api/auth/account', requireAuth, requireUserAccount, async (c) => {
  try {
    const user = getAuthUser(c)!;
    await c.env.DB.prepare('DELETE FROM votes WHERE user_id = ?').bind(user.id).run();
    // Delete votes on user's posts first
    await c.env.DB.prepare(
      'DELETE FROM votes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)'
    ).bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM posts WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    return c.json({ ok: true });
  } catch (e) {
    console.error('Delete account error:', e);
    return c.json({ error: 'Failed to delete account.' }, 500);
  }
});

// Google OAuth — initiate login
app.get('/api/auth/google', async (c) => {
  const state = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO rate_limits (key, window_key, count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(key, window_key) DO NOTHING'
  ).bind(`oauth_state:${state}`, 0, Math.floor(Date.now() / 1000) + 300).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', c.env.GOOGLE_CALLBACK_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

// Google OAuth — callback
app.get('/api/auth/google/callback', async (c) => {
  try {
    const code = c.req.query('code');
    if (!code) return c.json({ error: 'No authorization code.' }, 400);
    const state = c.req.query('state');
    if (!state) return c.json({ error: 'Missing state parameter.' }, 400);
    const stateRow = await c.env.DB.prepare(
      'SELECT count FROM rate_limits WHERE key = ? AND window_key = ?'
    ).bind(`oauth_state:${state}`, 0).first();
    if (!stateRow) return c.json({ error: 'Invalid or expired state.' }, 400);
    await c.env.DB.prepare('DELETE FROM rate_limits WHERE key = ? AND window_key = ?')
      .bind(`oauth_state:${state}`, 0).run();

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: c.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    const tokens: any = await tokenRes.json();
    if (!tokens.access_token) {
      return c.json({ error: 'Failed to get token.' }, 400);
    }

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const googleUser: any = await userRes.json();

    if (!googleUser.email) {
      return c.json({ error: 'Failed to get user info.' }, 400);
    }

    // Find or create user
    let user = await c.env.DB.prepare(
      'SELECT id, email, username, is_admin FROM users WHERE oauth_google_id = ?'
    ).bind(googleUser.id).first<any>();

    if (!user) {
      // Check if email already registered
      const existing = await c.env.DB.prepare(
        'SELECT id, email, username, is_admin FROM users WHERE email = ?'
      ).bind(googleUser.email).first<any>();

      if (existing) {
        // Link Google account to existing user
        await c.env.DB.prepare('UPDATE users SET oauth_google_id = ? WHERE id = ?')
          .bind(googleUser.id, existing.id).run();
        user = existing;
      } else {
        // Create new user
        const username = googleUser.email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);
        const { success } = await c.env.DB.prepare(
          'INSERT INTO users (email, username, oauth_google_id) VALUES (?, ?, ?)'
        ).bind(googleUser.email, username, googleUser.id).run();

        if (!success) {
          return c.json({ error: 'Failed to create user.' }, 500);
        }

        const newUser = await c.env.DB.prepare(
          'SELECT id, email, username, is_admin FROM users WHERE oauth_google_id = ?'
        ).bind(googleUser.id).first<any>();
        user = newUser;
      }
    }

    const token = await sign(
      { sub: String(user.id), id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) },
      c.env.JWT_SECRET
    );

    return c.redirect(`${c.env.APP_URL}/oauth-callback#token=${token}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    return c.json({ error: 'Authentication failed.' }, 500);
  }
});

// Get current user from token
app.get('/api/auth/me', async (c) => {
  const user = getAuthUser(c);
  return c.json({ user });
});

// ──────────────────────────────────────
// POST ROUTES
// ──────────────────────────────────────

// Get posts with optional filters
app.get('/api/posts', async (c) => {
  const type = c.req.query('type');
  const status = c.req.query('status') || 'current';
  const cursor = parseInt(c.req.query('cursor') || '0');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  const authUser = getAuthUser(c);
  const userId = authUser?.id || 0;

  let query = `
    SELECT p.*, u.username,
      (SELECT v.value FROM votes v WHERE v.post_id = p.id AND v.user_id = ?) as user_vote
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = ?
  `;
  const params: any[] = [userId, status];

  if (type && (type === 'feature' || type === 'bug')) {
    query += ' AND p.type = ?';
    params.push(type);
  }

  if (cursor > 0) {
    query += ' AND p.id < ?';
    params.push(cursor);
  }

  query += ' ORDER BY p.upvotes DESC, p.id DESC LIMIT ?';
  params.push(limit + 1);

  const { results } = await c.env.DB.prepare(query).bind(...params).all<any>();

  const hasMore = results.length > limit;
  const posts = results.slice(0, limit);
  const nextCursor = hasMore ? posts[posts.length - 1].id : null;

  // Batch fetch replies for all returned posts
  if (posts.length > 0) {
    const ids = posts.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results: replies } = await c.env.DB.prepare(
      `SELECT id, post_id, content, created_at FROM replies WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`
    ).bind(...ids).all<any>();

    const repliesByPost: Record<number, any[]> = {};
    for (const r of replies) {
      if (!repliesByPost[r.post_id]) repliesByPost[r.post_id] = [];
      repliesByPost[r.post_id].push(r);
    }

    for (const post of posts) {
      (post as any).replies = repliesByPost[post.id] || [];
    }
  }

  c.header('Cache-Control', 'public, max-age=30, s-maxage=60');

  return c.json({ posts, nextCursor });
});

// Get single post
app.get('/api/posts/:id', async (c) => {
  const id = parseInt(c.req.param('id') || '0');
  if (!id) return c.json({ error: 'Invalid post ID.' }, 400);

  const authUser = getAuthUser(c);
  const userId = authUser?.id || 0;

  const post = await c.env.DB.prepare(`
    SELECT p.*, u.username,
      (SELECT v.value FROM votes v WHERE v.post_id = p.id AND v.user_id = ?) as user_vote
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(userId, id).first<any>();

  if (!post) return c.json({ error: 'Post not found.' }, 404);

  // Get replies
  const { results: replies } = await c.env.DB.prepare(
    'SELECT id, post_id, content, created_at FROM replies WHERE post_id = ? ORDER BY created_at ASC'
  ).bind(id).all<any>();
  (post as any).replies = replies;

  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ post });
});

// Get replies for a post
app.get('/api/posts/:id/replies', async (c) => {
  const id = parseInt(c.req.param('id') || '0');
  if (!id) return c.json({ error: 'Invalid post ID.' }, 400);
  const { results } = await c.env.DB.prepare(
    'SELECT id, post_id, content, created_at FROM replies WHERE post_id = ? ORDER BY created_at ASC'
  ).bind(id).all();
  return c.json({ replies: results });
});

// Create post (requires auth)
app.post('/api/posts', requireAuth, requireUserAccount, async (c) => {
  try {
    const user = getAuthUser(c)!;
    const { type, title, content } = await c.req.json();

    if (!type || !title || !content) {
      return c.json({ error: 'Type, title, and content required.' }, 400);
    }
    if (type !== 'feature' && type !== 'bug') {
      return c.json({ error: 'Type must be "feature" or "bug".' }, 400);
    }
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (cleanTitle.length < 3) {
      return c.json({ error: 'Title must be at least 3 characters.' }, 400);
    }
    if (cleanTitle.length > 200) {
      return c.json({ error: 'Title too long (max 200 characters).' }, 400);
    }
    if (cleanContent.length > 50000) {
      return c.json({ error: 'Content too long (max 50,000 characters).' }, 400);
    }

    const { success, meta } = await c.env.DB.prepare(
      'INSERT INTO posts (user_id, type, status, title, content, upvotes) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(user.id, type, 'current', cleanTitle, cleanContent).run();

    if (!success) {
      return c.json({ error: 'Failed to create post.' }, 500);
    }

    const post = await c.env.DB.prepare(`
      SELECT p.*, u.username, NULL as user_vote
      FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
    `).bind(meta.last_row_id).first<any>();

    return c.json({ post }, 201);
  } catch (e) {
    console.error('Create post error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// ──────────────────────────────────────
// VOTE ROUTES
// ──────────────────────────────────────

app.post('/api/vote', requireUserVote, async (c) => {
  try {
    const user = getAuthUser(c)!;
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }
    const { post_id, value } = body;

    if (!post_id || value === undefined || value === null) {
      return c.json({ error: 'post_id and value required.' }, 400);
    }
    if (value !== 0 && value !== 1 && value !== -1) {
      return c.json({ error: 'Value must be -1, 0, or 1.' }, 400);
    }

    const post = await c.env.DB.prepare('SELECT id, upvotes FROM posts WHERE id = ?')
      .bind(post_id).first<any>();
    if (!post) {
      return c.json({ error: 'Post not found.' }, 404);
    }

    const existing = await c.env.DB.prepare(
      'SELECT id, value FROM votes WHERE post_id = ? AND user_id = ?'
    ).bind(post_id, user.id).first<any>();

    const stmts: any[] = [];

    if (value === 0) {
      if (existing) {
        stmts.push(
          c.env.DB.prepare('DELETE FROM votes WHERE id = ?').bind(existing.id)
        );
        stmts.push(
          c.env.DB.prepare('UPDATE posts SET upvotes = MAX(0, upvotes - ?) WHERE id = ?').bind(existing.value, post_id)
        );
      }
    } else if (existing) {
      if (existing.value === value) {
        // Idempotent no-op: the requested state already matches. Replays and
        // retries converge instead of toggling.
      } else {
        stmts.push(
          c.env.DB.prepare('UPDATE votes SET value = ?, created_at = datetime(\'now\') WHERE id = ?').bind(value, existing.id)
        );
        stmts.push(
          c.env.DB.prepare('UPDATE posts SET upvotes = MAX(0, upvotes + ?) WHERE id = ?').bind(value * 2, post_id)
        );
      }
    } else {
      stmts.push(
        c.env.DB.prepare('INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, ?)').bind(post_id, user.id, value)
      );
      stmts.push(
        c.env.DB.prepare('UPDATE posts SET upvotes = upvotes + ? WHERE id = ?').bind(value, post_id)
      );
    }

    if (stmts.length > 0) {
      await c.env.DB.batch(stmts);
    }

    // Re-read truth after the batch so the returned count is authoritative even
    // under concurrent requests.
    const updated = await c.env.DB.prepare('SELECT upvotes FROM posts WHERE id = ?')
      .bind(post_id).first<any>();
    const updatedVote = await c.env.DB.prepare(
      'SELECT value FROM votes WHERE post_id = ? AND user_id = ?'
    ).bind(post_id, user.id).first<any>();

    return c.json({ upvotes: updated?.upvotes ?? 0, user_vote: updatedVote?.value ?? null });
  } catch (e) {
    console.error('Vote error:', e);
    return c.json({ error: 'Server error.' }, 500);
  }
});

// ──────────────────────────────────────
// ADMIN ROUTES
// ──────────────────────────────────────

// Admin: Get all posts (includes done items)
app.get('/api/admin/posts', requireAuth, async (c) => {
  const user = getAuthUser(c)!;
  if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

  const status = c.req.query('status'); // optional filter

  let query = `
    SELECT p.*, u.username FROM posts p
    JOIN users u ON u.id = p.user_id
  `;
  const params: any[] = [];

  if (status) {
    query += ' WHERE p.status = ?';
    params.push(status);
  }

  query += ' ORDER BY p.created_at DESC';

  const posts: any[] = (await c.env.DB.prepare(query).bind(...params).all()).results;

  if (posts.length > 0) {
    const ids = posts.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results: replies } = await c.env.DB.prepare(
      `SELECT id, post_id, content, created_at FROM replies WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`
    ).bind(...ids).all<any>();

    const repliesByPost: Record<number, any[]> = {};
    for (const r of replies) {
      if (!repliesByPost[r.post_id]) repliesByPost[r.post_id] = [];
      repliesByPost[r.post_id].push(r);
    }

    for (const post of posts) {
      (post as any).replies = repliesByPost[post.id] || [];
    }
  }

  return c.json({ posts });
});

// Admin: Mark post as done
app.put('/api/admin/posts/:id/done', requireAuth, async (c) => {
  const user = getAuthUser(c)!;
  if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

  const id = parseInt(c.req.param('id') || '0');
  if (!id) return c.json({ error: 'Invalid post ID.' }, 400);

  await c.env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?')
    .bind('done', id).run();

  await auditLog(c, 'mark_done', 'post', id);

  return c.json({ ok: true });
});

// Admin: Move post back to current
app.put('/api/admin/posts/:id/reopen', requireAuth, async (c) => {
  const user = getAuthUser(c)!;
  if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

  const id = parseInt(c.req.param('id') || '0');
  if (!id) return c.json({ error: 'Invalid post ID.' }, 400);

  await c.env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?')
    .bind('current', id).run();

  await auditLog(c, 'reopen', 'post', id);

  return c.json({ ok: true });
});

// Admin: Reply to a post
app.post('/api/admin/posts/:id/reply', requireAuth, async (c) => {
  try {
    const user = getAuthUser(c)!;
    if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ error: 'Invalid post ID.' }, 400);

    const { content } = await c.req.json();
    if (!content || typeof content !== 'string') return c.json({ error: 'Content required.' }, 400);
    const clean = content.trim();
    if (clean.length < 1) return c.json({ error: 'Content required.' }, 400);
    if (clean.length > 50000) return c.json({ error: 'Content too long.' }, 400);

    const { success, meta } = await c.env.DB.prepare(
      'INSERT INTO replies (post_id, content) VALUES (?, ?)'
    ).bind(id, clean).run();

    if (!success) return c.json({ error: 'Failed to create reply.' }, 500);

    const reply = await c.env.DB.prepare(
      'SELECT id, post_id, content, created_at FROM replies WHERE id = ?'
    ).bind(meta.last_row_id).first();

    await auditLog(c, 'create_reply', 'post', id);

    return c.json({ reply }, 201);
  } catch (e) {
    console.error('Admin reply error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Admin: Edit a reply
app.put('/api/admin/replies/:id', requireAuth, async (c) => {
  try {
    const user = getAuthUser(c)!;
    if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ error: 'Invalid reply ID.' }, 400);

    const { content } = await c.req.json();
    if (!content || typeof content !== 'string') return c.json({ error: 'Content required.' }, 400);
    const clean = content.trim();
    if (clean.length < 1) return c.json({ error: 'Content required.' }, 400);
    if (clean.length > 50000) return c.json({ error: 'Content too long.' }, 400);

    await c.env.DB.prepare('UPDATE replies SET content = ? WHERE id = ?')
      .bind(clean, id).run();

    const reply = await c.env.DB.prepare(
      'SELECT id, post_id, content, created_at FROM replies WHERE id = ?'
    ).bind(id).first();

    if (!reply) return c.json({ error: 'Reply not found.' }, 404);

    await auditLog(c, 'edit_reply', 'reply', id);

    return c.json({ reply });
  } catch (e) {
    console.error('Admin edit reply error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Admin: Delete a reply
app.delete('/api/admin/replies/:id', requireAuth, async (c) => {
  try {
    const user = getAuthUser(c)!;
    if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ error: 'Invalid reply ID.' }, 400);

    await c.env.DB.prepare('DELETE FROM replies WHERE id = ?').bind(id).run();

    await auditLog(c, 'delete_reply', 'reply', id);

    return c.json({ ok: true });
  } catch (e) {
    console.error('Admin delete reply error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// Admin: Clear all done posts
app.delete('/api/admin/posts/done', requireAuth, async (c) => {
  try {
    const user = getAuthUser(c)!;
    if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

    await c.env.DB.prepare(
      'DELETE FROM votes WHERE post_id IN (SELECT id FROM posts WHERE status = ?)'
    ).bind('done').run();

    await c.env.DB.prepare(
      'DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE status = ?)'
    ).bind('done').run();

    await c.env.DB.prepare('DELETE FROM posts WHERE status = ?').bind('done').run();

    await auditLog(c, 'clear_done', null, null);

    return c.json({ ok: true });
  } catch (e) {
    console.error('Clear done error:', e);
    return c.json({ error: 'Failed to clear done posts.' }, 500);
  }
});

// Admin: Delete post
app.delete('/api/admin/posts/:id', requireAuth, async (c) => {
  const user = getAuthUser(c)!;
  if (!user.is_admin) return c.json({ error: 'Forbidden.' }, 403);

  const id = parseInt(c.req.param('id') || '0');
  if (!id) return c.json({ error: 'Invalid post ID.' }, 400);

  await c.env.DB.prepare('DELETE FROM replies WHERE post_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM votes WHERE post_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();

  await auditLog(c, 'delete_post', 'post', id);

  return c.json({ ok: true });
});

// Admin: Login (separate from user login, checks env vars)
app.post('/api/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (constantTimeEqual(username, c.env.ADMIN_USERNAME) && constantTimeEqual(password, c.env.ADMIN_PASSWORD)) {
      const token = await sign(
        { sub: '0', id: 0, email: 'admin@drclash', username: 'admin', is_admin: true, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) },
        c.env.JWT_SECRET
      );
      return c.json({ token, user: { username: 'admin', is_admin: true } });
    }
    return c.json({ error: 'Invalid admin credentials.' }, 401);
  } catch (e) {
    console.error('Admin login error:', e);
    return c.json({ error: 'Invalid request.' }, 400);
  }
});

// ──────────────────────────────────────
// Audit log helper
// ──────────────────────────────────────

async function auditLog(c: Context, action: string, targetType: string | null, targetId: number | null, details: string | null = null) {
  try {
    const user = getAuthUser(c);
    const adminId = user?.id ?? 0;
    await c.env.DB.prepare(
      'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(adminId, action, targetType, targetId, details).run();
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ──────────────────────────────────────
// PBKDF2 helpers (using Web Crypto API)
// ──────────────────────────────────────

async function pbkdf2Hash(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  );
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function pbkdf2Compare(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1]);
  const salt = new Uint8Array(parts[2].match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const storedHash = parts[3];

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
  );
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(hashHex, storedHash);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export default app;
