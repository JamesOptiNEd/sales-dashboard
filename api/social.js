// pages/api/social.js — shared reactions & comments for the Closed tab's
// social feed (deal posts + the weekly champion post).
//
// Uses Vercel's native Redis integration (Storage tab -> Redis -> Connect),
// NOT the old "Vercel KV" product, which Vercel discontinued in Dec 2024.
// The standard `redis` package stores strings only (no auto-serialization
// like the old @vercel/kv client had), so values are JSON.stringify'd going
// in and JSON.parse'd coming out.
//
// NOTE: name is taken directly from the client ("Posting as" field) — the
// login/session-verified version was rolled back for now. This means the
// name shown next to a reaction/comment is self-declared, not verified.

import { getRedisClient } from '../lib/redis';

const VALID_EMOJIS = new Set(['thumbsup', 'muscle', 'hundred', 'heart']);

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
      const { postId, action, emoji, name, text } = req.body || {};
      if (!postId || typeof postId !== 'string') {
        return res.status(400).json({ error: 'postId is required' });
      }

      const key = `social:${postId}`;
      const raw = await redis.get(key);
      const current = raw ? JSON.parse(raw) : { reactions: {}, comments: [] };

      if (action === 'react') {
        if (!VALID_EMOJIS.has(emoji)) return res.status(400).json({ error: 'invalid emoji' });
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required to react' });
        const cleanName = String(name).trim().slice(0, 40);
        const list = Array.isArray(current.reactions[emoji]) ? current.reactions[emoji] : [];
        current.reactions[emoji] = list.includes(cleanName)
          ? list.filter(n => n !== cleanName)
          : [...list, cleanName];
      } else if (action === 'comment') {
        if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });
        current.comments.push({
          name: String(name || 'Someone').slice(0, 40),
          text: String(text).slice(0, 500),
          ts: Date.now(),
        });
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
