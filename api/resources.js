// api/resources.js — the Resources page: a shared, arbitrarily-nested tree
// of folders and links (SharePoint folders, tools, guides, etc.) so nobody
// has to remember which shared drive something lives on. One shared tree
// for the whole team — anyone can add a folder, sub-folder, or link at any
// depth. Persisted in Redis so it isn't lost on refresh or per-browser.

import { getRedisClient } from '../lib/redis';

const KEY = 'resource_center';

// Seed structure — matches what James described. Every leaf link starts
// with an empty url until filled in from the dashboard itself.
const DEFAULT_TREE = [
  {
    id: 'sales', title: 'Sales', type: 'folder', children: [
      { id: 'quoting', title: 'Quoting Tools', type: 'link', url: '' },
    ],
  },
  {
    id: 'marketing', title: 'Marketing', type: 'folder', children: [
      { id: 'presentations', title: 'Company Presentations', type: 'link', url: '' },
      { id: 'brochures', title: 'Product Brochures', type: 'link', url: '' },
    ],
  },
  {
    id: 'proserv', title: 'Professional Services', type: 'folder', children: [
      {
        id: 'sla', title: 'SLA', type: 'folder', children: [
          { id: 'sla_optitex', title: 'Optitex SLA', type: 'link', url: '' },
          { id: 'sla_ned', title: 'NedGraphics SLA', type: 'link', url: '' },
        ],
      },
      { id: 'training_hours', title: 'Training Hours per Module', type: 'link', url: '' },
      { id: 'spec_req', title: 'Spec Requirements', type: 'link', url: '' },
    ],
  },
  {
    id: 'legal', title: 'Legal', type: 'folder', children: [
      {
        id: 'eula', title: 'EULA', type: 'folder', children: [
          { id: 'eula_optitex', title: 'Optitex EULA', type: 'link', url: '' },
          { id: 'eula_ned', title: 'NedGraphics EULA', type: 'link', url: '' },
        ],
      },
    ],
  },
  {
    id: 'hubspot', title: 'HubSpot', type: 'folder', children: [
      { id: 'deal_guide', title: 'Deal Input Guide', type: 'link', url: '' },
    ],
  },
  {
    id: 'partners', title: 'Partners', type: 'folder', children: [
      { id: 'partner_agreements', title: 'Partner Agreements', type: 'folder', children: [] },
    ],
  },
];

// ---- Recursive tree helpers ----
function findAndAdd(nodes, parentId, newNode) {
  if (parentId === null) { nodes.push(newNode); return true; }
  for (const n of nodes) {
    if (n.id === parentId) {
      if (!n.children) n.children = [];
      n.children.push(newNode);
      return true;
    }
    if (n.children && findAndAdd(n.children, parentId, newNode)) return true;
  }
  return false;
}

function findAndUpdate(nodes, id, patch) {
  for (const n of nodes) {
    if (n.id === id) { Object.assign(n, patch); return true; }
    if (n.children && findAndUpdate(n.children, id, patch)) return true;
  }
  return false;
}

function findAndDelete(nodes, id) {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) {
    if (n.children && findAndDelete(n.children, id)) return true;
  }
  return false;
}

export default async function handler(req, res) {
  try {
    const redis = await getRedisClient();

    if (req.method === 'GET') {
      const raw = await redis.get(KEY);
      const tree = raw ? JSON.parse(raw) : DEFAULT_TREE;
      return res.status(200).json({ tree });
    }

    if (req.method === 'POST') {
      const { action, id, parentId, title, url, type } = req.body || {};
      const raw = await redis.get(KEY);
      const tree = raw ? JSON.parse(raw) : DEFAULT_TREE;

      if (action === 'add') {
        if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
        if (type !== 'folder' && type !== 'link') return res.status(400).json({ error: 'type must be "folder" or "link"' });
        const newNode = { id: 'res_' + Date.now(), title: String(title).trim().slice(0, 80), type };
        if (type === 'folder') newNode.children = [];
        else newNode.url = '';
        const ok = findAndAdd(tree, parentId ?? null, newNode);
        if (!ok) return res.status(404).json({ error: 'parent not found' });
      } else if (action === 'update') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        const patch = {};
        if (title !== undefined) patch.title = String(title).slice(0, 80);
        if (url !== undefined) patch.url = String(url).slice(0, 500);
        const ok = findAndUpdate(tree, id, patch);
        if (!ok) return res.status(404).json({ error: 'node not found' });
      } else if (action === 'delete') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        const ok = findAndDelete(tree, id);
        if (!ok) return res.status(404).json({ error: 'node not found' });
      } else {
        return res.status(400).json({ error: 'action must be "add", "update", or "delete"' });
      }

      await redis.set(KEY, JSON.stringify(tree));
      return res.status(200).json({ tree });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('resources.js error:', err);
    return res.status(500).json({ error: err.message, hint: 'Is a Redis database connected to this project (Storage tab -> Redis)?' });
  }
}
