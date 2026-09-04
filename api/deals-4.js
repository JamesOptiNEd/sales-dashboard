// api/deals.js — Vercel serverless function
// Fetches all European deals from HubSpot and returns structured data

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// ---- Stage name normalisation (applied to the REAL stage label, not the ID) ----
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

// ---- European SM name matching ----
const SM_MAP = {
  sabine: 'Sabine',
  marco: 'Marco',
  giulia: 'Giulia',
  canan: 'Canan',
  henk: 'Henk',
  susanna: 'Susanna',
  susana: 'Susanna',
  mcdermott: 'James', // Director of Europe — retains personal key accounts in both brands
};

function getSM(ownerName) {
  if (!ownerName) return null;
  const l = ownerName.toLowerCase();
  for (const [key, val] of Object.entries(SM_MAP)) {
    if (l.includes(key)) return val;
  }
  return null;
}

// ---- Brand is determined directly by hs_all_assigned_business_unit_ids.
// CONFIRMED directly from HubSpot's property definition (not guessed):
//   0        = NedGraphics
//   2626361  = Optitex
// This replaced an earlier, unreliable approach that tried to infer brand
// from the pipeline name or a live business-units API lookup — both were
// wrong or unavailable. This is now the single source of truth for brand,
// and it resolves correctly per-deal for EVERY SM, including Giulia and
// Susanna who sell both brands (no more per-SM brand guessing needed).
const BUSINESS_UNIT_BRAND = {
  '0': 'NedGraphics',
  '2626361': 'Optitex',
};

function getBrand(rawBusinessUnitIds) {
  if (!rawBusinessUnitIds && rawBusinessUnitIds !== 0) return null;
  const ids = String(rawBusinessUnitIds).split(';').map(s => s.trim());
  for (const id of ids) {
    if (BUSINESS_UNIT_BRAND[id]) return BUSINESS_UNIT_BRAND[id];
  }
  return `unmapped:${rawBusinessUnitIds}`;
}

function parseNum(v) {
  if (!v && v !== 0) return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

// ---- Build stageId -> label map by reading the actual pipeline definitions.
// (pipelineMap is also captured in case it's useful for future debugging,
// though brand no longer depends on it.)
async function fetchPipelineData() {
  const stageMap = {};
  const pipelineMap = {};
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    });
    const data = await res.json();
    for (const pipeline of (data.results || [])) {
      pipelineMap[pipeline.id] = pipeline.label;
      for (const stage of (pipeline.stages || [])) {
        stageMap[stage.id] = stage.label;
      }
    }
  } catch (err) {
    console.error('Failed to fetch pipeline stages:', err);
  }
  return { stageMap, pipelineMap };
}

// (Business-units API lookup removed — brand is now resolved directly and
// reliably from hs_all_assigned_business_unit_ids via the confirmed ID map
// above, with no extra API call needed.)

async function fetchAllDeals() {
  const deals = [];
  let after = undefined;
  const properties = [
    'dealname', 'dealstage', 'pipeline', 'closedate',
    'hubspot_owner_id',
    'hs_all_assigned_business_unit_ids', // confirmed internal name for "Brands"
    'optitex_subscription', 'optitex_license', // confirmed Optitex sub/lic fields
    'nedgraphics_subscription', 'nedgraphics_license', // confirmed NedGraphics sub/lic fields
  ];

  const [ownersRes, pipelineData] = await Promise.all([
    fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    }),
    fetchPipelineData(),
  ]);
  const { stageMap } = pipelineData;

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
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    });
    const data = await res.json();

    for (const deal of (data.results || [])) {
      const p = deal.properties;
      const ownerName = ownerMap[p.hubspot_owner_id] || '';
      const sm = getSM(ownerName);

      // Only include European SMs
      if (!sm) continue;

      // Resolve the real stage label from the ID, THEN normalise it
      const stageLabel = stageMap[p.dealstage] || p.dealstage;
      const stage = normaliseStage(stageLabel);
      if (!stage) continue;

      // Brand resolved directly and reliably — no more SM guessing or
      // pipeline-name matching needed.
      const brand = getBrand(p.hs_all_assigned_business_unit_ids);

      const closedate = p.closedate ? p.closedate.split('T')[0] : null;
      const closemonth = closedate ? new Date(closedate).getMonth() : null;
      const closeyear = closedate ? new Date(closedate).getFullYear() : null;

      // Sub/Lic come from different properties depending on brand, since
      // Optitex and NedGraphics deals store these values in separate fields.
      const sub = brand === 'NedGraphics' ? parseNum(p.nedgraphics_subscription) : parseNum(p.optitex_subscription);
      const lic = brand === 'NedGraphics' ? parseNum(p.nedgraphics_license) : parseNum(p.optitex_license);

      deals.push({
        id: deal.id,
        name: p.dealname || '',
        stage,
        sm,
        brand,
        closedate,
        closemonth,
        closeyear,
        sub,
        lic,
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

  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && cache && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
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
