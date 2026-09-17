// api/activities.js — the Growth Hub's activity board: a shared set of
// categories (Pipeline, Leads, AMC Customers, etc.), but each category's
// LINK is unique per sales manager — James's HubSpot pipeline view isn't
// Henk's, so the url lives per-SM inside each item, not as one shared url.
// Persisted in Redis so it isn't lost on refresh or per-browser.

import { getRedisClient } from '../lib/redis';

const KEY = 'growth_activities';

// Seed list — matches what James described as the starting set. `urls` is
// keyed by SM name; empty until each person's specific link is added.
const DEFAULT_ITEMS = [
  { id: 'pipeline',     title: 'Pipeline',              urls: {} },
  { id: 'leads',        title: 'Leads',                 urls: {} },
  { id: 'amc',          title: 'AMC Customers',         urls: {} },
  { id: 'offamc',       title: 'Off-AMC Customers',     urls: {} },
  { id: 'competitors',  title: 'Competitor User List',  urls: {} },
  { id: 'cold',         title: 'Cold Prospecting',      urls: {} },
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
      const { action, id, title, url, sm } = req.body || {};
      const raw = await redis.get(KEY);
      let items = raw ? JSON.parse(raw) : DEFAULT_ITEMS;

      if (action === 'add') {
        if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
        items.push({ id: 'act_' + Date.now(), title: String(title).trim().slice(0, 60), urls: {} });
      } else if (action === 'update') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        // title is shared across everyone; url is specific to one SM (requires `sm`).
        if (url !== undefined && !sm) return res.status(400).json({ error: 'sm is required when updating a url' });
        items = items.map(it => {
          if (it.id !== id) return it;
          const next = { ...it };
          if (title !== undefined) next.title = String(title).slice(0, 60);
          if (url !== undefined) next.urls = { ...(it.urls||{}), [sm]: String(url).slice(0, 500) };
          return next;
        });
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
