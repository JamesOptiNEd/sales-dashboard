// pages/api/social.js — shared reactions & comments for the Closed tab's
// social feed (deal posts + the weekly champion post).
//
// Uses Vercel's native Redis integration (Storage tab -> Redis -> Connect),
// NOT the old "Vercel KV" product, which Vercel discontinued in Dec 2024.
// The standard `redis` package stores strings only (no auto-serialization
// like the old @vercel/kv client had), so values are JSON.stringify'd going
// in and JSON.parse'd coming out.

import { getRedisClient } from '../lib/redis';

const VALID_EMOJIS = new Set(['thumbsup', 'muscle', 'hundred', 'heart']);

async function resolveName(redis, token) {
  if (!token) return null;
  return await redis.get(`session:${token}`);
}

export default async function handler(req, res) {
  try {
    const redis = await getRedisClient();

    if (req.method === 'GET') {
      const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return res.status(200).json({ posts: {} });

      const keys = ids.map(id => `social:${id}`);
      const values = await redis.mGet(keys);
      const posts = {};
      ids.forEach((id, i) => {
        posts[id] = values[i] ? JSON.parse(values[i]) : { reactions: {}, comments: [] };
      });
      return res.status(200).json({ posts });
    }

    if (req.method === 'POST') {
      const { postId, action, emoji, token, text } = req.body || {};
      if (!postId || typeof postId !== 'string') {
        return res.status(400).json({ error: 'postId is required' });
      }

      // Name is resolved from the verified session, never taken from the
      // client directly — this is what makes reactions/comments trustworthy.
      const name = await resolveName(redis, token);
      if (!name) return res.status(401).json({ error: 'Not logged in' });

      const key = `social:${postId}`;
      const raw = await redis.get(key);
      const current = raw ? JSON.parse(raw) : { reactions: {}, comments: [] };

      if (action === 'react') {
        if (!VALID_EMOJIS.has(emoji)) return res.status(400).json({ error: 'invalid emoji' });
        const list = Array.isArray(current.reactions[emoji]) ? current.reactions[emoji] : [];
        current.reactions[emoji] = list.includes(name)
          ? list.filter(n => n !== name)
          : [...list, name];
      } else if (action === 'comment') {
        if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });
        current.comments.push({ name, text: String(text).slice(0, 500), ts: Date.now() });
      } else {
        return res.status(400).json({ error: 'action must be "react" or "comment"' });
      }

      await redis.set(key, JSON.stringify(current));
      return res.status(200).json({ post: current });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('social.js error:', err);
    return res.status(500).json({ error: err.message, hint: 'Is a Redis database connected to this project (Storage tab -> Redis)?' });
  }
}
