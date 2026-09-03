import { useState, useMemo, useEffect, useCallback } from 'react';

const STAGE_ORDER = ['Pipeline','Qualification','Upside','Selected','Commit','Processing','Closed Won'];
const ACHIEVED = new Set(['Processing','Closed Won']);
const SM_LIST = ['Sabine','Marco','Giulia','Canan','Henk','Susanna'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const NAV = '#1E4D8C';
const GREEN = '#1A7A4A';
const AMBER = '#B87320';
const RED = '#C0392B';
const TEAL = '#0F7173';

function fmtK(n) {
  if (!n && n !== 0) return '€0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000) return sign + '€' + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return sign + '€' + Math.round(abs / 1000) + 'K';
  return sign + '€' + Math.round(abs);
}

function pNum(v) {
  return parseFloat(String(v || 0).replace(/[^0-9.-]/g, '')) || 0;
}

function balColor(b, total) {
  if (b <= 0) return GREEN;
  if (total > 0 && b < total * 0.3) return AMBER;
  return RED;
}

function MetricCard({ label, value, color, note }) {
  return (
    <div style={{ background: '#F4F6F9', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 12, color: '#8A9BB0', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 500, margin: 0, color: color || '#0A1628' }}>{fmtK(value)}</p>
      {note && <p style={{ fontSize: 11, color: AMBER, margin: '3px 0 0' }}>{note}</p>}
    </div>
  );
}

function defTargets() {
  const t = { Europe: { sub: 0, lic: 0 } };
  for (const sm of SM_LIST) t[sm] = { sub: 0, lic: 0 };
  return t;
}

const STORAGE_KEY = 'opti_dashboard_targets';

export default function Dashboard() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [targets, setTargets] = useState(defTargets);
  const [filter, setFilter] = useState({ sm: 'All', brand: 'All', year: new Date().getFullYear() });
  const [tab, setTab] = useState('tab');
  const [showTargets, setShowTargets] = useState(false);

  // Persist targets in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTargets(JSON.parse(saved));
    } catch {}
  }, []);

  const saveTargets = useCallback((t) => {
    setTargets(t);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
  }, []);

  const setTarget = useCallback((sm, field, val) => {
    saveTargets(prev => ({ ...prev, [sm]: { ...prev[sm], [field]: pNum(val) } }));
  }, [saveTargets]);

  // Fetch deals from API
  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/deals');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDeals(data.deals || []);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Auto-fetch on load
  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  // Filter deals
  const fd = useMemo(() => deals.filter(d => {
    if (filter.sm !== 'All' && d.sm !== filter.sm) return false;
    if (filter.brand !== 'All' && d.brand !== filter.brand) return false;
    if (filter.year && d.closeyear && d.closeyear !== parseInt(filter.year)) return false;
    return true;
  }), [deals, filter]);

  // TAB calculations
  const tabData = useMemo(() => {
    const ach = fd.filter(d => ACHIEVED.has(d.stage));
    const proc = fd.filter(d => d.stage === 'Processing');
    const sum = (arr, f) => arr.reduce((a, d) => a + (d[f] || 0), 0);

    const tSub = filter.sm === 'All' ? (targets.Europe?.sub || 0) : (targets[filter.sm]?.sub || 0);
    const tLic = filter.sm === 'All' ? (targets.Europe?.lic || 0) : (targets[filter.sm]?.lic || 0);
    const aSub = sum(ach, 'sub'), aLic = sum(ach, 'lic');

    return {
      sub: { t: tSub, a: aSub, b: tSub - aSub },
      lic: { t: tLic, a: aLic, b: tLic - aLic },
      tot: { t: tSub + tLic, a: aSub + aLic, b: (tSub + tLic) - (aSub + aLic) },
      proc: { sub: sum(proc, 'sub'), lic: sum(proc, 'lic') },
    };
  }, [fd, targets, filter]);

  // Pipeline calculations
  const pipeData = useMemo(() => {
    const res = {};
    for (const s of STAGE_ORDER) {
      const sd = fd.filter(d => d.stage === s);
      const op = sd.filter(d => d.brand === 'Optitex');
      const nd = sd.filter(d => d.brand === 'NedGraphics');
      const sum = (arr, f) => arr.reduce((a, d) => a + (d[f] || 0), 0);
      res[s] = {
        count: sd.length,
        opSub: sum(op, 'sub'), opLic: sum(op, 'lic'),
        ndSub: sum(nd, 'sub'), ndLic: sum(nd, 'lic'),
        total: sum(sd, 'sub') + sum(sd, 'lic'),
      };
    }
    return res;
  }, [fd]);

  // Forecast calculations
  const fcastData = useMemo(() => {
    const bm = {};
    for (const d of fd.filter(d => d.stage === 'Commit')) {
      const m = d.closemonth;
      if (m === null || m === undefined) continue;
      if (!bm[m]) bm[m] = { sub: 0, lic: 0, n: 0 };
      bm[m].sub += d.sub || 0;
      bm[m].lic += d.lic || 0;
      bm[m].n++;
    }
    return bm;
  }, [fd]);

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      padding: '8px 18px', fontSize: 13, border: 'none', background: 'transparent',
      borderBottom: tab === key ? `2px solid ${NAV}` : '2px solid transparent',
      color: tab === key ? NAV : '#8A9BB0', fontWeight: tab === key ? 500 : 400,
      cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap',
    }}>{label}</button>
  );

  const years = [...new Set(deals.map(d => d.closeyear).filter(Boolean))].sort().reverse();

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A1628', margin: 0 }}>European Sales Dashboard</h1>
          <p style={{ fontSize: 12, color: '#8A9BB0', margin: '3px 0 0' }}>
            {loading ? 'Loading...' : error ? `Error: ${error}` :
              `${deals.length} deals · ${fd.length} shown · refreshed ${lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filters */}
          <select value={filter.sm} onChange={e => setFilter(f => ({ ...f, sm: e.target.value }))}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE1E8', background: '#fff' }}>
            <option value="All">All SMs</option>
            {SM_LIST.map(sm => <option key={sm} value={sm}>{sm}</option>)}
          </select>
          <select value={filter.brand} onChange={e => setFilter(f => ({ ...f, brand: e.target.value }))}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE1E8', background: '#fff' }}>
            <option value="All">All brands</option>
            <option value="Optitex">Optitex</option>
            <option value="NedGraphics">NedGraphics</option>
          </select>
          <select value={filter.year} onChange={e => setFilter(f => ({ ...f, year: e.target.value }))}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE1E8', background: '#fff' }}>
            <option value="">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowTargets(s => !s)}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 8,
              border: `1px solid ${showTargets ? NAV : '#DDE1E8'}`,
              background: showTargets ? '#EAF0F8' : '#fff',
              color: showTargets ? NAV : '#3A4A5C', cursor: 'pointer' }}>
            ◎ Targets
          </button>
          <button onClick={fetchDeals} disabled={loading}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 8, border: 'none',
              background: NAV, color: '#fff', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Targets panel */}
      {showTargets && (
        <div style={{ background: '#F4F6F9', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.25rem', border: '1px solid #E0E4EC' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0A1628', margin: '0 0 12px' }}>Annual booking targets (€) — enter totals, not monthly</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 420 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #DDE1E8' }}>
                  {['SM','Sub target','Licence target','Total'].map(h =>
                    <th key={h} style={{ padding: '5px 10px', color: '#8A9BB0', fontWeight: 500, textAlign: h === 'SM' ? 'left' : 'right' }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...SM_LIST, 'Europe'].map((sm, i) => {
                  const t = targets[sm] || { sub: 0, lic: 0 };
                  const isEurope = sm === 'Europe';
                  return (
                    <tr key={sm} style={{ borderBottom: '1px solid #EEF0F4', background: isEurope ? '#EAF0F8' : undefined }}>
                      <td style={{ padding: '5px 10px', fontWeight: isEurope ? 600 : 500, color: isEurope ? NAV : '#0A1628' }}>{sm} {isEurope ? '(manual)' : ''}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" value={t.sub || ''} placeholder="0"
                          onChange={e => setTarget(sm, 'sub', e.target.value)}
                          style={{ width: '100%', fontSize: 12, textAlign: 'right', padding: '3px 6px', border: '1px solid #DDE1E8', borderRadius: 6 }} />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" value={t.lic || ''} placeholder="0"
                          onChange={e => setTarget(sm, 'lic', e.target.value)}
                          style={{ width: '100%', fontSize: 12, textAlign: 'right', padding: '3px 6px', border: '1px solid #DDE1E8', borderRadius: 6 }} />
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#8A9BB0', fontWeight: isEurope ? 600 : 400 }}>
                        {fmtK((t.sub || 0) + (t.lic || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: '#8A9BB0', margin: '10px 0 0' }}>Targets are saved in your browser automatically.</p>
        </div>
      )}

      {/* Nav tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E0E4EC', marginBottom: '1.25rem', overflowX: 'auto' }}>
        {tabBtn('tab', 'Target / Achieved / Balance')}
        {tabBtn('pipeline', 'Pipeline coverage')}
        {tabBtn('forecast', 'Monthly forecast')}
      </div>

      {/* Error state */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FDECEA', border: '1px solid #F5C6C2', borderRadius: 10, color: RED, fontSize: 13, marginBottom: '1rem' }}>
          ⚠ {error} — check your HUBSPOT_TOKEN environment variable.
        </div>
      )}

      {/* ── TAB ───────────────────────────────────────────────────────────── */}
      {tab === 'tab' && (
        <div>
          {/* 6 metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
            <MetricCard label="Sub target" value={tabData.sub.t} />
            <MetricCard label="Sub achieved" value={tabData.sub.a} color={GREEN} />
            <MetricCard label="Sub balance" value={tabData.sub.b} color={balColor(tabData.sub.b, tabData.sub.t)} />
            <MetricCard label="Licence target" value={tabData.lic.t} />
            <MetricCard label="Licence achieved" value={tabData.lic.a} color={GREEN} />
            <MetricCard label="Licence balance" value={tabData.lic.b} color={balColor(tabData.lic.b, tabData.lic.t)} />
          </div>

          {/* Total booking row */}
          <div style={{ background: '#0A1628', borderRadius: 12, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: 10 }}>
            {[
              { l: 'Total target', v: tabData.tot.t, c: '#fff' },
              { l: 'Total achieved', v: tabData.tot.a, c: '#4AE89A',
                note: tabData.proc.sub + tabData.proc.lic > 0 ? `incl. ${fmtK(tabData.proc.sub + tabData.proc.lic)} in processing` : null },
              { l: 'Balance to go', v: tabData.tot.b, c: balColor(tabData.tot.b, tabData.tot.t) },
            ].map(({ l, v, c, note }) => (
              <div key={l}>
                <p style={{ fontSize: 11, color: '#4A6A8A', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l}</p>
                <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: c }}>{fmtK(v)}</p>
                {note && <p style={{ fontSize: 11, color: AMBER, margin: '3px 0 0' }}>{note}</p>}
              </div>
            ))}
          </div>

          {/* Processing alert */}
          {(tabData.proc.sub + tabData.proc.lic > 0) && (
            <div style={{ padding: '10px 14px', background: '#FFF8EE', border: '1px solid #F5DFA0', borderRadius: 10, fontSize: 12, color: '#7A5010', marginBottom: 10 }}>
              ⏳ <strong>Processing (ops pending close):</strong> Sub {fmtK(tabData.proc.sub)} · Licence {fmtK(tabData.proc.lic)} · Total {fmtK(tabData.proc.sub + tabData.proc.lic)}
            </div>
          )}

          {/* Per-SM table */}
          {filter.sm === 'All' && (
            <div style={{ background: '#fff', border: '1px solid #E0E4EC', borderRadius: 12, padding: '1rem', overflowX: 'auto' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#0A1628', margin: '0 0 10px' }}>By sales manager</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 580 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E0E4EC' }}>
                    {['SM','Sub T','Sub A','Lic T','Lic A','Total T','Total A','Balance'].map(h =>
                      <th key={h} style={{ padding: '5px 8px', color: '#8A9BB0', fontWeight: 500, textAlign: h === 'SM' ? 'left' : 'right' }}>{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {SM_LIST.map(sm => {
                    const t = targets[sm] || { sub: 0, lic: 0 };
                    const ach = fd.filter(d => d.sm === sm && ACHIEVED.has(d.stage));
                    const aS = ach.reduce((a, d) => a + (d.sub || 0), 0);
                    const aL = ach.reduce((a, d) => a + (d.lic || 0), 0);
                    const tT = (t.sub || 0) + (t.lic || 0);
                    const aT = aS + aL;
                    const bal = tT - aT;
                    return (
                      <tr key={sm} style={{ borderBottom: '1px solid #F0F2F6' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 500, color: '#0A1628' }}>{sm}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8A9BB0' }}>{fmtK(t.sub || 0)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: GREEN, fontWeight: 500 }}>{fmtK(aS)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8A9BB0' }}>{fmtK(t.lic || 0)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: GREEN, fontWeight: 500 }}>{fmtK(aL)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0A1628', fontWeight: 500 }}>{fmtK(tT)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: GREEN, fontWeight: 500 }}>{fmtK(aT)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: balColor(bal, tT) }}>{fmtK(bal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE ──────────────────────────────────────────────────────── */}
      {tab === 'pipeline' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #E0E4EC', borderRadius: 12, padding: '1rem', overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 540 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E0E4EC' }}>
                  {['Stage', 'Opti sub', 'Opti lic', 'Ned sub', 'Ned lic', 'Total', '#'].map((h, i) => (
                    <th key={i} style={{ padding: '6px 10px', fontWeight: 500,
                      color: i >= 1 && i <= 2 ? NAV : i >= 3 && i <= 4 ? TEAL : '#8A9BB0',
                      textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGE_ORDER.map(s => {
                  const d = pipeData[s] || {};
                  const isA = ACHIEVED.has(s), isC = s === 'Commit', isP = s === 'Processing';
                  return (
                    <tr key={s} style={{
                      borderBottom: '1px solid #F0F2F6',
                      background: isA ? '#F0FAF4' : isC ? '#EAF0F8' : undefined,
                      opacity: d.total ? 1 : 0.4,
                    }}>
                      <td style={{ padding: '8px 10px', fontWeight: isA || isC ? 500 : 400,
                        color: isA ? GREEN : isC ? NAV : '#0A1628' }}>
                        {s}
                        {isP && <span style={{ fontSize: 10, marginLeft: 6, color: AMBER }}>pending close</span>}
                        {s === 'Closed Won' && <span style={{ fontSize: 10, marginLeft: 6, color: GREEN }}>= achieved</span>}
                      </td>
                      {[d.opSub, d.opLic, d.ndSub, d.ndLic].map((v, i) =>
                        <td key={i} style={{ padding: '8px 10px', textAlign: 'right', color: '#3A4A5C' }}>{v ? fmtK(v) : '—'}</td>
                      )}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 500, color: '#0A1628' }}>{d.total ? fmtK(d.total) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#8A9BB0' }}>{d.count || 0}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '1px solid #E0E4EC', background: '#F4F6F9' }}>
                  <td colSpan={5} style={{ padding: '7px 10px', fontSize: 11, color: '#8A9BB0', fontWeight: 500 }}>
                    Commit + Processing — pipeline coverage of balance
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: NAV }}>
                    {fmtK((pipeData['Commit']?.total || 0) + (pipeData['Processing']?.total || 0))}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Coverage summary */}
          <div style={{ padding: '14px 20px', background: '#fff', borderRadius: 12, border: '1px solid #E0E4EC', display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
            {[
              { l: 'Balance to go', v: tabData.tot.b, c: RED },
              { l: 'Commit pipeline', v: pipeData['Commit']?.total || 0, c: NAV },
              { l: 'Pipeline coverage',
                v: tabData.tot.b > 0 ? Math.round(((pipeData['Commit']?.total || 0) / tabData.tot.b) * 100) : 100,
                pct: true,
                c: tabData.tot.b <= 0 ? GREEN : (pipeData['Commit']?.total || 0) >= tabData.tot.b ? GREEN : (pipeData['Commit']?.total || 0) >= tabData.tot.b * 0.5 ? AMBER : RED },
            ].map(({ l, v, c, pct }) => (
              <div key={l}>
                <p style={{ fontSize: 12, color: '#8A9BB0', margin: '0 0 3px' }}>{l}</p>
                <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: c }}>{pct ? v + '%' : fmtK(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FORECAST ──────────────────────────────────────────────────────── */}
      {tab === 'forecast' && (
        <div style={{ background: '#fff', border: '1px solid #E0E4EC', borderRadius: 12, padding: '1rem', overflowX: 'auto' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0A1628', margin: '0 0 10px' }}>
            Monthly commit forecast — subscription and licence by close date
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E0E4EC' }}>
                {['Month','Subscription','Licence','Total','Deals'].map(h =>
                  <th key={h} style={{ padding: '5px 10px', color: '#8A9BB0', fontWeight: 500, textAlign: h === 'Month' ? 'left' : 'right' }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(fcastData).sort((a, b) => a[0] - b[0]).map(([m, d]) => (
                <tr key={m} style={{ borderBottom: '1px solid #F0F2F6' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 500, color: '#0A1628' }}>{MONTHS[parseInt(m)]}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#3A4A5C' }}>{fmtK(d.sub)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#3A4A5C' }}>{fmtK(d.lic)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, color: '#0A1628' }}>{fmtK(d.sub + d.lic)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8A9BB0' }}>{d.n}</td>
                </tr>
              ))}
              {Object.keys(fcastData).length === 0 && (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#8A9BB0', fontSize: 12 }}>No commit deals in current filter</td></tr>
              )}
              {Object.keys(fcastData).length > 0 && (() => {
                const tS = Object.values(fcastData).reduce((a, d) => a + d.sub, 0);
                const tL = Object.values(fcastData).reduce((a, d) => a + d.lic, 0);
                const tN = Object.values(fcastData).reduce((a, d) => a + d.n, 0);
                return (
                  <tr style={{ borderTop: '1px solid #E0E4EC', background: '#F4F6F9' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0A1628' }}>Total</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtK(tS)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtK(tL)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: NAV }}>{fmtK(tS + tL)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8A9BB0' }}>{tN}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <p style={{ fontSize: 11, color: '#C0C8D8', marginTop: '1.5rem', textAlign: 'center' }}>
        Optitex & NedGraphics · European Sales Dashboard · Auto-refreshes on load · Data from HubSpot
      </p>
    </div>
  );
}
