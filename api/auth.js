// api/auth.js — email + password login for the dashboard.
//
// - Only known company emails can log in (see KNOWN_EMAILS below).
// - First-ever login for a given email sets that person's password (no
//   separate signup step); every login after checks against it.
// - Passwords are hashed with bcrypt (slow-by-design, resistant to brute
//   force even if the database were ever leaked) — not the faster SHA-256
//   used in an earlier draft of this.
// - Basic rate limiting: 5 failed attempts locks that email out for 15
//   minutes, so repeated password guessing isn't free.
// - Sessions last 3 hours of INACTIVITY (sliding idle timeout) — every
//   successful "whoami" check (called periodically while the dashboard is
//   open) refreshes the clock, so someone actively working never gets
//   logged out; someone who walks away does, after 3 idle hours.
// - One admin (ADMIN_EMAIL) can list accounts and reset anyone's password
//   without needing email — see the "listAccounts" / "resetPassword" actions.
//
// Uses Vercel's native Redis integration (Storage tab -> Redis -> Connect),
// NOT the old "Vercel KV" product, which Vercel discontinued in Dec 2024.

import { getRedisClient } from '../lib/redis';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Pulled from real HubSpot owner records (smEmail on each SM's deals).
// Worth double-checking these are still current before relying on them.
const KNOWN_EMAILS = {
  'james.mcdermott@optitex.com':   'James',
  'henk.bolmeijer@nedgraphics.com':'Henk',
  'susana.goncalves@nedgraphics.com':'Susanna',
  'scrumbie@nedgraphics.com':      'Sabine',
  'giulia.sarno@optitex.com':      'Giulia',
  'marco.barbieri@optitex.com':    'Marco',
  'cirdel@nedgraphics.com':        'Canan',
};
const ADMIN_EMAIL = 'james.mcdermott@optitex.com';

const SESSION_TTL_SECONDS = 60 * 60 * 3; // 3 hours, refreshed on activity
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 minutes

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { action, email, password, token, targetEmail } = req.body || {};
    const redis = await getRedisClient();

    if (action === 'login') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const name = KNOWN_EMAILS[cleanEmail];
      if (!name) return res.status(400).json({ error: 'That email isn\'t recognized. Contact James if this seems wrong.' });
      if (!password || String(password).length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }

      const attemptsKey = `loginattempts:${cleanEmail}`;
      const attemptsRaw = await redis.get(attemptsKey);
      const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;
      if (attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes, or ask James to reset your password.' });
      }

      const pwKey = `authpw:${cleanEmail}`;
      const stored = await redis.get(pwKey);
      const isNewAccount = !stored;

      if (isNewAccount) {
        const hashed = await bcrypt.hash(String(password), 10);
        await redis.set(pwKey, hashed);
      } else {
        const match = await bcrypt.compare(String(password), stored);
        if (!match) {
          await redis.set(attemptsKey, String(attempts + 1), { EX: LOCKOUT_WINDOW_SECONDS });
          return res.status(401).json({ error: 'Incorrect password' });
        }
      }

      await redis.del(attemptsKey); // reset on success

      const sessionToken = crypto.randomBytes(24).toString('hex');
      await redis.set(`session:${sessionToken}`, JSON.stringify({ name, email: cleanEmail }), { EX: SESSION_TTL_SECONDS });
      return res.status(200).json({ token: sessionToken, name, email: cleanEmail, isAdmin: cleanEmail === ADMIN_EMAIL, isNewAccount });
    }

    if (action === 'logout') {
      if (token) await redis.del(`session:${token}`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'whoami') {
      if (!token) return res.status(200).json({ name: null });
      const raw = await redis.get(`session:${token}`);
      if (!raw) return res.status(200).json({ name: null });
      const sess = JSON.parse(raw);
      await redis.expire(`session:${token}`, SESSION_TTL_SECONDS); // sliding idle timeout
      return res.status(200).json({ name: sess.name, email: sess.email, isAdmin: sess.email === ADMIN_EMAIL });
    }

    // ---- Admin-only actions ----
    if (action === 'listAccounts' || action === 'resetPassword') {
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const raw = await redis.get(`session:${token}`);
      if (!raw) return res.status(401).json({ error: 'Not logged in' });
      const sess = JSON.parse(raw);
      if (sess.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only' });

      if (action === 'listAccounts') {
        const accounts = [];
        for (const [em, nm] of Object.entries(KNOWN_EMAILS)) {
          const has = await redis.get(`authpw:${em}`);
          accounts.push({ email: em, name: nm, hasPassword: !!has });
        }
        return res.status(200).json({ accounts });
      }

      if (action === 'resetPassword') {
        if (!targetEmail || !KNOWN_EMAILS[targetEmail]) return res.status(400).json({ error: 'Unknown email' });
        await redis.del(`authpw:${targetEmail}`);
        await redis.del(`loginattempts:${targetEmail}`);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'invalid action' });
  } catch (err) {
    console.error('auth.js error:', err);
    return res.status(500).json({ error: err.message, hint: 'Is a Redis database connected to this project (Storage tab -> Redis)?' });
  }
}
