// api/deals.js — Vercel serverless function
// Fetches all European deals from HubSpot and returns structured data

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PORTAL_ID = '4379609';

// Stage name normalisation
function normaliseStage(s) {
  if (!s) return null;
  const l = s.toLowerCase();
  if (l.includes('closed won') || l.includes('closedwon')) return 'Closed Won';
  if (l.includes('processing')) return 'Processing';
  if (l.includes('commit')) return 'Commit';
  if (l.includes('selected')) return 'Selected';
  if (l.includes('upside')) return 'Upside';
  if (l.includes('qualif')) return 'Qualification';
  if (l.includes('pipeline') || /^1\s*-/.test(l)) return 'Pipeline';
  return s;
}

// European SM name matching
const SM_MAP = {
  sabine: 'Sabine',
  marco: 'Marco',
  giulia: 'Giulia',
  canan: 'Canan',
  henk: 'Henk',
  susanna: 'Susanna',
  susana: 'Susanna',
};

function getSM(ownerName) {
  if (!ownerName) return null;
  const l = ownerName.toLowerCase();
  for (const [key, val] of Object.entries(SM_MAP)) {
    if (l.includes(key)) return val;
  }
  return null;
}

function getBrand(brandVal) {
  if (!brandVal) return null;
  const l = brandVal.toLowerCase();
  if (l.includes('ned') || l.includes('graphic')) return 'NedGraphics';
  if (l.includes('opti')) return 'Optitex';
  return brandVal;
}

function parseNum(v) {
  if (!v && v !== 0) return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

async function fetchAllDeals() {
  const deals = [];
  let after = undefined;
  const properties = [
    'dealname', 'dealstage', 'pipeline', 'closedate',
    'hubspot_owner_id', 'brands',
    'optitex_subscription', 'optitex_license',
  ];

  // Get all owners first for name lookup
  const ownersRes = await fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` }
  });
  const ownersData = await ownersRes.json();
  const ownerMap = {};
  for (const o of (ownersData.results || [])) {
    ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim();
  }

  // Paginate through all deals
  do {
    const params = new URLSearchParams({
      limit: '100',
      properties: properties.join(','),
    });
    if (after) params.set('after', after);

    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals?${params}`, {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` }
    });
    const data = await res.json();

    for (const deal of (data.results || [])) {
      const p = deal.properties;
      const ownerName = ownerMap[p.hubspot_owner_id] || '';
      const sm = getSM(ownerName);

      // Only include European SMs
      if (!sm) continue;

      const stage = normaliseStage(p.dealstage);
      if (!stage) continue;

      const closedate = p.closedate ? p.closedate.split('T')[0] : null;
      const closemonth = closedate ? new Date(closedate).getMonth() : null;
      const closeyear = closedate ? new Date(closedate).getFullYear() : null;

      deals.push({
        id: deal.id,
        name: p.dealname || '',
        stage,
        sm,
        brand: getBrand(p.brands),
        closedate,
        closemonth,
        closeyear,
        sub: parseNum(p.optitex_subscription),
        lic: parseNum(p.optitex_license),
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  return deals;
}

// Simple in-memory cache (resets each cold start — fine for Vercel)
let cache = null;
let cacheTime = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  if (!HUBSPOT_TOKEN) {
    return res.status(500).json({ error: 'HUBSPOT_TOKEN not configured' });
  }

  // Serve cache if fresh
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
    return res.status(200).json({ deals: cache, cached: true, cacheTime });
  }

  try {
    const deals = await fetchAllDeals();
    cache = deals;
    cacheTime = Date.now();
    res.status(200).json({ deals, cached: false, cacheTime });
  } catch (err) {
    console.error('HubSpot fetch error:', err);
    res.status(500).json({ error: err.message });
  }
}
