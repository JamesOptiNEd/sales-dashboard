// pages/api/auth.js — lightweight per-person login for the dashboard.
//
// Design, deliberately simple for a 7-person internal tool (not a public
// product): each of the known names sets their own password the FIRST time
// they log in (no separate admin setup step needed); every login after that
// checks against it. A session token is then used everywhere else (Closed
// tab reactions/comments) to resolve who's actually doing what SERVER-SIDE —
// this is what actually fixes attribution, since the name is no longer
// taken from free-text client input at all.
//
// Uses Vercel's native Redis integration (Storage tab -> Redis -> Connect),
// NOT the old "Vercel KV" product, which Vercel discontinued in Dec 2024.

import { getRedisClient } from '../lib/redis';
import crypto from 'crypto';

const KNOWN_NAMES = ['Sabine', 'Marco', 'Giulia', 'Canan', 'Henk', 'Susanna', 'James'];
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { action, name, password, token } = req.body || {};
    const redis = await getRedisClient();

    if (action === 'login') {
      if (!KNOWN_NAMES.includes(name)) return res.status(400).json({ error: 'Unknown name' });
      if (!password || String(password).length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }

      const pwKey = `authpw:${name}`;
      const stored = await redis.get(pwKey);
      const hashed = hashPassword(password);
      const isNewAccount = !stored;

      if (isNewAccount) {
        // First-ever login for this name — this sets their password going forward.
        await redis.set(pwKey, hashed);
      } else if (stored !== hashed) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      const sessionToken = crypto.randomBytes(24).toString('hex');
      await redis.set(`session:${sessionToken}`, name, { EX: SESSION_TTL_SECONDS });
      return res.status(200).json({ token: sessionToken, name, isNewAccount });
    }

    if (action === 'logout') {
      if (token) await redis.del(`session:${token}`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'whoami') {
      if (!token) return res.status(200).json({ name: null });
      const name = await redis.get(`session:${token}`);
      return res.status(200).json({ name: name || null });
    }

    return res.status(400).json({ error: 'action must be "login", "logout", or "whoami"' });
  } catch (err) {
    console.error('auth.js error:', err);
    return res.status(500).json({ error: err.message, hint: 'Is a Redis database connected to this project (Storage tab -> Redis)?' });
  }
}
