// api/activities.js — the Growth Hub's activity board: a shared, editable
// list of links (Pipeline, Leads, AMC Customers, etc.) that sales managers
// use to plan proactive growth work. One shared list for everyone — James
// sets up/edits the links, every SM sees the same board when they open
// Growth Hub. Persisted in Redis so it isn't lost on refresh or per-browser.

import { getRedisClient } from '../lib/redis';

const KEY = 'growth_activities';

// Seed list — matches what James described as the starting set. All start
// with an empty url until he fills them in from the dashboard itself.
const DEFAULT_ITEMS = [
  { id: 'pipeline',     title: 'Pipeline',              url: '' },
  { id: 'leads',        title: 'Leads',                 url: '' },
  { id: 'amc',          title: 'AMC Customers',         url: '' },
  { id: 'offamc',       title: 'Off-AMC Customers',     url: '' },
  { id: 'competitors',  title: 'Competitor User List',  url: '' },
  { id: 'cold',         title: 'Cold Prospecting',      url: '' },
];

export default async function handler(req, res) {
  try {
    const redis = await getRedisClient();

    if (req.method === 'GET') {
      const raw = await redis.get(KEY);
      const items = raw ? JSON.parse(raw) : DEFAULT_ITEMS;
      return res.status(200).json({ items });
    }

    if (req.method === 'POST') {
      const { action, id, title, url } = req.body || {};
      const raw = await redis.get(KEY);
      let items = raw ? JSON.parse(raw) : DEFAULT_ITEMS;

      if (action === 'add') {
        if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
        items.push({ id: 'act_' + Date.now(), title: String(title).trim().slice(0, 60), url: '' });
      } else if (action === 'update') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        items = items.map(it => it.id === id
          ? { ...it, ...(title !== undefined ? { title: String(title).slice(0, 60) } : {}), ...(url !== undefined ? { url: String(url).slice(0, 500) } : {}) }
          : it);
      } else if (action === 'delete') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        items = items.filter(it => it.id !== id);
      } else {
        return res.status(400).json({ error: 'action must be "add", "update", or "delete"' });
      }

      await redis.set(KEY, JSON.stringify(items));
      return res.status(200).json({ items });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('activities.js error:', err);
    return res.status(500).json({ error: err.message, hint: 'Is a Redis database connected to this project (Storage tab -> Redis)?' });
  }
}
