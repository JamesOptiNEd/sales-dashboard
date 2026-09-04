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
};

function getSM(ownerName) {
  if (!ownerName) return null;
  const l = ownerName.toLowerCase();
  for (const [key, val] of Object.entries(SM_MAP)) {
    if (l.includes(key)) return val;
  }
  return null;
}

// ---- Brand name matching (applied to the REAL business unit name, not the ID) ----
function normaliseBrand(name) {
  if (!name) return null;
  const l = name.toLowerCase();
  if (l.includes('ned') || l.includes('graphic')) return 'NedGraphics';
  if (l.includes('opti')) return 'Optitex';
  return name;
}

function parseNum(v) {
  if (!v && v !== 0) return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

// ---- Build stageId -> label map, AND pipelineId -> pipeline label, by reading
// the actual pipeline definitions. (Brand may be determined by which pipeline
// a deal belongs to, rather than a per-deal property — we're testing that.)
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

// ---- Build businessUnitId -> name map ----
async function fetchBusinessUnitMap() {
  const map = {};
  try {
    const res = await fetch('https://api.hubapi.com/settings/v3/business-units/business-unit', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    });
    const data = await res.json();
    for (const unit of (data.results || [])) {
      map[String(unit.id)] = unit.name;
    }
  } catch (err) {
    console.error('Failed to fetch business units:', err);
  }
  return map;
}

async function fetchAllDeals() {
  const deals = [];
  let after = undefined;
  const properties = [
    'dealname', 'dealstage', 'pipeline', 'closedate',
    'hubspot_owner_id',
    'hs_all_assigned_business_unit_ids', // confirmed internal name for "Brands"
    'optitex_subscription', 'optitex_license', // confirmed internal names
    // TODO: NedGraphics-side subscription/licence properties are named
    // differently in HubSpot and haven't been confirmed yet. Once NedGraphics
    // moves to the same property structure as Optitex, add the confirmed
    // internal names here and in the sub/lic assignment logic below.
  ];

  const [ownersRes, pipelineData, businessUnitMap] = await Promise.all([
    fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    }),
    fetchPipelineData(),
    fetchBusinessUnitMap(),
  ]);
  const { stageMap, pipelineMap } = pipelineData;

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

      // Try to determine brand from the PIPELINE the deal sits in first —
      // business units all resolved to a single default unit (0) for every
      // deal, so that property isn't actually distinguishing brands here.
      const pipelineLabel = pipelineMap[p.pipeline] || p.pipeline || null;
      let brand = normaliseBrand(pipelineLabel);

      // Fallback: business unit lookup, in case some pipelines are shared
      // across both brands and business units DO matter for those deals.
      if (!brand && p.hs_all_assigned_business_unit_ids) {
        const ids = String(p.hs_all_assigned_business_unit_ids).split(';').map(s => s.trim());
        for (const id of ids) {
          if (businessUnitMap[id]) {
            brand = normaliseBrand(businessUnitMap[id]);
            break;
          }
        }
      }
      if (!brand) brand = `unmapped:pipeline=${pipelineLabel}`;

      const closedate = p.closedate ? p.closedate.split('T')[0] : null;
      const closemonth = closedate ? new Date(closedate).getMonth() : null;
      const closeyear = closedate ? new Date(closedate).getFullYear() : null;

      deals.push({
        id: deal.id,
        name: p.dealname || '',
        stage,
        sm,
        brand,
        pipelineLabel, // TEMP debug field — remove once brand mapping is confirmed correct
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
