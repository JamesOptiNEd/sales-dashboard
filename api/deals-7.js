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

// Optitex/NedGraphics subscription & license fields in HubSpot are
// denominated in USD ($) despite every target being tracked in EUR.
// Rate is fetched live on each refresh from a free, no-key exchange rate API
// (frankfurter.app, backed by the European Central Bank's daily reference
// rates). Falls back to a fixed rate if that call fails for any reason.
const FALLBACK_USD_TO_EUR_RATE = 0.86;

async function fetchUsdToEurRate() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    const data = await res.json();
    const rate = data?.rates?.EUR;
    if (typeof rate === 'number' && rate > 0) return rate;
  } catch (err) {
    console.error('Failed to fetch live USD/EUR rate, using fallback:', err);
  }
  return FALLBACK_USD_TO_EUR_RATE;
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
    'renewal', // "Is This Deal A Renewal (Subscription or AMC)?" — true/false
    'amount', 'amount_in_home_currency', // TOTAL deal value — includes PS/AMC line items, unlike sub/lic above
  ];

  const [ownersRes, pipelineData, usdToEurRate] = await Promise.all([
    fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    }),
    fetchPipelineData(),
    fetchUsdToEurRate(),
  ]);
  const { stageMap } = pipelineData;

  const ownersData = await ownersRes.json();
  const ownerMap = {};      // id -> full name (used for SM matching, unchanged)
  const ownerEmailMap = {}; // id -> email (used for the nudge button)
  for (const o of (ownersData.results || [])) {
    ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim();
    ownerEmailMap[o.id] = o.email || null;
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

      // Renewals are excluded entirely — this dashboard tracks new business only.
      const isRenewal = String(p.renewal).toLowerCase() === 'true';
      if (isRenewal) continue;

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
      // Both are in USD in HubSpot, so convert to EUR here.
      const sub = (brand === 'NedGraphics' ? parseNum(p.nedgraphics_subscription) : parseNum(p.optitex_subscription)) * usdToEurRate;
      const lic = (brand === 'NedGraphics' ? parseNum(p.nedgraphics_license) : parseNum(p.optitex_license)) * usdToEurRate;

      // TOTAL deal value — used on the Closed tab, where the full booking
      // (including PS/AMC line items the sub/lic split above doesn't capture)
      // is what matters, not the license/subscription breakdown.
      // Prefers amount_in_home_currency (HubSpot's own normalization across
      // deals created in different original currencies); falls back to amount.
      // Confirmed by James: also USD, same as sub/lic — same conversion applied.
      const rawTotal = (p.amount_in_home_currency !== undefined && p.amount_in_home_currency !== null && p.amount_in_home_currency !== '')
        ? parseNum(p.amount_in_home_currency)
        : parseNum(p.amount);
      const totalValue = rawTotal * usdToEurRate;

      deals.push({
        id: deal.id,
        name: p.dealname || '',
        stage,
        sm,
        smEmail: ownerEmailMap[p.hubspot_owner_id] || null,
        brand,
        closedate,
        closemonth,
        closeyear,
        sub,
        lic,
        totalValue,
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  return { deals, usdToEurRate };
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
    return res.status(200).json({ deals: cache.deals, usdToEurRate: cache.usdToEurRate, cached: true, cacheTime });
  }

  try {
    const result = await fetchAllDeals();
    cache = result;
    cacheTime = Date.now();
    res.status(200).json({ deals: result.deals, usdToEurRate: result.usdToEurRate, cached: false, cacheTime });
  } catch (err) {
    console.error('HubSpot fetch error:', err);
    res.status(500).json({ error: err.message });
  }
}
