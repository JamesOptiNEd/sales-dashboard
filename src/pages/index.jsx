import { useState, useMemo, useEffect, useCallback, useRef } from 'react';

const STAGE_ORDER = ['Pipeline','Qualification','Upside','Selected','Commit','Processing','Closed Won'];
const ACHIEVED = new Set(['Processing','Closed Won']);
const SM_LIST = ['Sabine','Marco','Giulia','Canan','Henk','Susanna','James'];
const OPTITEX_SMS = ['Sabine','Marco','Giulia','Susanna','James'];
const NED_SMS = ['Canan','Henk','Susanna','James','Sabine'];
const EUROPE_TARGETS = ['Europe - Optitex','Europe - NedGraphics'];
// SMs who sell BOTH brands need separate targets per brand (a single shared
// number can't represent two different quotas). Single-brand SMs just use
// their name directly as the key.
const DUAL_BRAND_SMS = new Set(OPTITEX_SMS.filter(sm => NED_SMS.includes(sm)));
function targetKeyFor(sm, brand) {
  return DUAL_BRAND_SMS.has(sm) ? `${sm}-${brand}` : sm;
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEFAULT_PIPE_STAGES = new Set(['Pipeline','Qualification','Upside','Selected','Commit']);
const CLOSING_SOON_WINDOW_DAYS = 5; // "Deal Hygiene" tab: flag deals closing within this many days

const NAVY = '#0A1628';
const NAVY_SM = '#1A3A5C';
const GREEN = '#1A7A4A';
const AMBER = '#B87320';
const RED = '#C0392B';
const TEAL = '#0F7173';
const NAV = '#1E4D8C';

function fmtK(n) {
  if (!n && n !== 0) return '€0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000) return sign + '€' + (abs/1000000).toFixed(1) + 'M';
  if (abs >= 1000) return sign + '€' + Math.round(abs/1000) + 'K';
  return sign + '€' + Math.round(abs);
}

function pNum(v) { return parseFloat(String(v||0).replace(/[^0-9.-]/g,''))||0; }

function balColor(b, t) {
  if (b <= 0) return GREEN;
  if (t > 0 && b < t * 0.3) return AMBER;
  return RED;
}

function StageDropdown({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = s => { const n = new Set(selected); n.has(s)?n.delete(s):n.add(s); onChange(n); };
  const label = selected.size===0?'No stages':selected.size===STAGE_ORDER.length?'All stages':selected.size<=2?[...selected].join(', '):`${selected.size} stages`;
  return (
    <div ref={ref} style={{position:'relative',marginTop:4}}>
      <button onClick={()=>setOpen(o=>!o)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'#CBD8E8',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
        {label} <span style={{fontSize:9}}>▼</span>
      </button>
      {open && (
        <div style={{position:'absolute',top:'100%',left:0,zIndex:200,marginTop:4,background:'#fff',border:'1px solid #DDE1E8',borderRadius:10,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',padding:'6px 0',minWidth:180}}>
          {STAGE_ORDER.map(s=>(
            <label key={s} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#3A4A5C',background:selected.has(s)?'#F0F4FF':undefined}}>
              <input type="checkbox" checked={selected.has(s)} onChange={()=>toggle(s)} style={{accentColor:NAV}}/>{s}
            </label>
          ))}
          <div style={{borderTop:'1px solid #EEF0F4',margin:'4px 0',padding:'4px 12px',display:'flex',gap:8}}>
            <button onClick={()=>onChange(new Set(STAGE_ORDER))} style={{fontSize:11,color:NAV,background:'none',border:'none',cursor:'pointer',padding:0}}>All</button>
            <button onClick={()=>onChange(new Set())} style={{fontSize:11,color:'#8A9BB0',background:'none',border:'none',cursor:'pointer',padding:0}}>None</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Attainment % helpers — used next to every Achieved value across the dashboard
function attainmentPct(achieved, target) {
  if (!target) return null; // avoid divide-by-zero / meaningless % for SMs with no target (e.g. Susanna)
  return (achieved / target) * 100;
}
function fmtPct(pct) {
  if (pct == null) return '—';
  return `${Math.round(pct)}%`;
}
// Small filled pill showing attainment %. Plain colored text was hard to read
// (especially on the dark navy background), so this uses a tinted background
// + bold, higher-contrast text instead — a more standard, legible pattern.
function AttainmentBadge({ achieved, target, dark }) {
  const pct = attainmentPct(achieved, target);
  if (pct == null) {
    return <span style={{display:'inline-block',marginTop:4,fontSize:12,fontWeight:600,color:dark?'#6E8CB0':'#8A9BB0'}}>—</span>;
  }
  const tier = pct >= 100 ? 'good' : pct >= 75 ? 'warn' : 'bad';
  const palette = dark
    ? { good:{bg:'rgba(74,232,154,0.18)', text:'#5FEFA8'}, warn:{bg:'rgba(255,176,32,0.18)', text:'#FFC24D'}, bad:{bg:'rgba(255,107,107,0.18)', text:'#FF8A80'} }
    : { good:{bg:'rgba(26,122,74,0.10)',  text:GREEN},     warn:{bg:'rgba(184,115,32,0.12)', text:AMBER},   bad:{bg:'rgba(192,57,43,0.10)',  text:RED} };
  const c = palette[tier];
  return (
    <span style={{display:'inline-block',marginTop:5,padding:'2px 9px',borderRadius:999,fontSize:12,fontWeight:700,background:c.bg,color:c.text}}>
      {fmtPct(pct)}
    </span>
  );
}

// Navy metric bar (used for both Europe totals and SM totals)
function NavyBar({ label, target, achieved, balance, pipeline, pipeStages, setPipeStages, small, color, onExpandSplit, splitOpen, onExpandSM, smOpen }) {
  const bg = small ? NAVY_SM : NAVY;
  const fontSize = small ? 20 : 28;
  return (
    <div style={{background:bg,borderRadius:12,padding:small?'12px 16px':'16px 20px',marginBottom:4}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <p style={{fontSize:small?11:12,color:'#8AAFD4',margin:0,textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500}}>{label}</p>
        <div style={{display:'flex',gap:8}}>
          {onExpandSplit && (
            <button onClick={onExpandSplit} style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',color:'#CBD8E8',cursor:'pointer'}}>
              Sub / Lic {splitOpen?'▲':'▼'}
            </button>
          )}
          {onExpandSM && (
            <button onClick={onExpandSM} style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',color:'#CBD8E8',cursor:'pointer'}}>
              By SM {smOpen?'▲':'▼'}
            </button>
          )}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem'}}>
        <div>
          <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Target</p>
          <p style={{fontSize,fontWeight:600,margin:0,color:'#fff'}}>{fmtK(target)}</p>
        </div>
        <div>
          <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Achieved</p>
          <p style={{fontSize,fontWeight:600,margin:0,color:'#4AE89A'}}>{fmtK(achieved)}</p>
          <AttainmentBadge achieved={achieved} target={target} dark/>
        </div>
        <div>
          <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Balance to go</p>
          <p style={{fontSize,fontWeight:600,margin:0,color:balColor(balance,target)}}>{fmtK(balance)}</p>
        </div>
        <div>
          <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Pipeline total</p>
          <p style={{fontSize,fontWeight:600,margin:0,color:'#7ABFFF'}}>{fmtK(pipeline)}</p>
          {setPipeStages && <StageDropdown selected={pipeStages} onChange={setPipeStages}/>}
        </div>
      </div>
    </div>
  );
}

// Gray split row for Sub or Lic
function SplitRow({ label, target, achieved, balance, pipeline }) {
  return (
    <div style={{background:'#F4F6F9',borderRadius:10,padding:'12px 16px',marginBottom:3}}>
      <p style={{fontSize:10,color:'#8A9BB0',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500}}>{label}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem'}}>
        {[['Target',target,'#0A1628'],['Achieved',achieved,GREEN],['Balance to go',balance,balColor(balance,target)],['Pipeline',pipeline,'#1E4D8C']].map(([l,v,c])=>(
          <div key={l}>
            <p style={{fontSize:10,color:'#8A9BB0',margin:'0 0 2px'}}>{l}</p>
            <p style={{fontSize:18,fontWeight:500,margin:0,color:c}}>{fmtK(v)}</p>
            {l==='Achieved' && <AttainmentBadge achieved={achieved} target={target}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

function calcMetrics(deals, targetSub, targetLic, pipeStages) {
  const ach = deals.filter(d=>ACHIEVED.has(d.stage));
  const aSub = ach.reduce((a,d)=>a+(d.sub||0),0);
  const aLic = ach.reduce((a,d)=>a+(d.lic||0),0);
  const pSub = deals.filter(d=>pipeStages.has(d.stage)).reduce((a,d)=>a+(d.sub||0),0);
  const pLic = deals.filter(d=>pipeStages.has(d.stage)).reduce((a,d)=>a+(d.lic||0),0);
  return {
    sub:{ t:targetSub, a:aSub, b:targetSub-aSub, p:pSub },
    lic:{ t:targetLic, a:aLic, b:targetLic-aLic, p:pLic },
    tot:{ t:targetSub+targetLic, a:aSub+aLic, b:(targetSub+targetLic)-(aSub+aLic), p:pSub+pLic },
  };
}

// 2026 booking targets, hardcoded from signed comp plans (July/Jan 2026).
// Licence = category A (new licence) only. Subscription = category D (new lease/subscription, 1st invoice) only.
// Categories B (services) and C (AMC/maintenance attach) are not tracked as Sub/Lic targets on this dashboard.
// Canan: no comp plan received yet — target left at 0 until provided.
// Susanna: consultant, not a full-time employee — no target set; dashboard will only ever show her Achieved.
// Giulia: Optitex target only — she no longer carries a NedGraphics target.
function defTargets() {
  return {
    // Sabine is primarily Optitex, but occasionally closes NedGraphics deals
    // too (e.g. handover-era accounts) — no formal NedGraphics target, but her
    // achieved value there should still show on her own row, not just roll
    // into the Europe total anonymously.
    'Sabine-Optitex':     { sub: 40000,  lic: 76000 },
    'Sabine-NedGraphics': { sub: 0,      lic: 0 },
    Marco:   { sub: 30000,  lic: 52000 },
    Giulia:  { sub: 0,      lic: 387931 },
    Canan:   { sub: 0,      lic: 0 },
    Henk:    { sub: 113065, lic: 163949 },
    // Susanna: consultant, achieved-only, no target in either brand.
    'Susanna-Optitex':     { sub: 0, lic: 0 },
    'Susanna-NedGraphics': { sub: 0, lic: 0 },
    // James: individual targets from his Jan 2026 comp plan (pre-promotion),
    // Direct column only (Global Accounts excluded per instruction).
    // Source doc was denominated in GBP; converted to EUR at ~1 GBP = 1.1633 EUR
    // (mid-market rate, 4 Sep 2026) to match every other SM's EUR figures.
    // Original GBP figures: Optitex lic £335,821 / sub £11,194;
    // NedGraphics sub £58,912 / lic £0.
    'James-Optitex':     { sub: 13022, lic: 390674 },
    'James-NedGraphics': { sub: 68535, lic: 0 },
    'Europe - Optitex':    { sub: 12931,  lic: 775862 },
    'Europe - NedGraphics':{ sub: 249172, lic: 240494 },
  };
}

const STORAGE_KEY='opti_dashboard_targets_v7';

// Brand section with expandable sub/lic and SM rows
function BrandSection({ brand, color, deals, targets, pipeStages, setPipeStages }) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [smOpen, setSmOpen] = useState(false);
  const europeKey = brand === 'Optitex' ? 'Europe - Optitex' : 'Europe - NedGraphics';
  const smList = brand === 'Optitex' ? OPTITEX_SMS : NED_SMS;
  const brandDeals = deals.filter(d=>d.brand===brand);
  const t = targets[europeKey]||{sub:0,lic:0};
  const metrics = calcMetrics(brandDeals, t.sub||0, t.lic||0, pipeStages);

  return (
    <div style={{marginBottom:16}}>
      <NavyBar
        label={brand === 'Optitex' ? 'Optitex — Europe Total' : 'NedGraphics — Europe Total'}
        target={metrics.tot.t} achieved={metrics.tot.a} balance={metrics.tot.b} pipeline={metrics.tot.p}
        pipeStages={pipeStages} setPipeStages={setPipeStages}
        onExpandSplit={()=>setSplitOpen(o=>!o)} splitOpen={splitOpen}
        onExpandSM={()=>setSmOpen(o=>!o)} smOpen={smOpen}
      />
      {splitOpen && (
        <div style={{paddingLeft:0,marginBottom:4}}>
          <SplitRow label="Subscription" target={metrics.sub.t} achieved={metrics.sub.a} balance={metrics.sub.b} pipeline={metrics.sub.p}/>
          <SplitRow label="Licence" target={metrics.lic.t} achieved={metrics.lic.a} balance={metrics.lic.b} pipeline={metrics.lic.p}/>
        </div>
      )}
      {smOpen && smList.map(sm=>(
        <SMRow key={sm} sm={sm} brand={brand} deals={brandDeals} targets={targets} pipeStages={pipeStages}/>
      ))}
    </div>
  );
}

function SMRow({ sm, brand, deals, targets, pipeStages }) {
  const [splitOpen, setSplitOpen] = useState(false);
  const smDeals = deals.filter(d=>d.sm===sm);
  const t = targets[targetKeyFor(sm, brand)]||{sub:0,lic:0};
  const metrics = calcMetrics(smDeals, t.sub||0, t.lic||0, pipeStages);
  return (
    <div style={{marginLeft:0,marginBottom:3}}>
      <NavyBar
        label={sm}
        target={metrics.tot.t} achieved={metrics.tot.a} balance={metrics.tot.b} pipeline={metrics.tot.p}
        small
        onExpandSplit={()=>setSplitOpen(o=>!o)} splitOpen={splitOpen}
      />
      {splitOpen && (
        <div style={{paddingLeft:16,marginBottom:4}}>
          <SplitRow label="Subscription" target={metrics.sub.t} achieved={metrics.sub.a} balance={metrics.sub.b} pipeline={metrics.sub.p}/>
          <SplitRow label="Licence" target={metrics.lic.t} achieved={metrics.lic.a} balance={metrics.lic.b} pipeline={metrics.lic.p}/>
        </div>
      )}
    </div>
  );
}

// ---- Pipeline Coverage: time-period filtering (Rest of Year, then Quarter/Month dropdowns), per brand ----
const PIPE_QUARTERS = {
  Q1: { label:'Q1 · Jan–Mar', months:[0,1,2] },
  Q2: { label:'Q2 · Apr–Jun', months:[3,4,5] },
  Q3: { label:'Q3 · Jul–Sep', months:[6,7,8] },
  Q4: { label:'Q4 · Oct–Dec', months:[9,10,11] },
};

function periodSum(deals) {
  const sub = deals.reduce((a,d)=>a+(d.sub||0),0);
  const lic = deals.reduce((a,d)=>a+(d.lic||0),0);
  return { sub, lic, total: sub+lic, count: deals.length };
}

// Stage-by-stage breakdown for whatever set of deals is currently in view —
// same columns as before, just scoped to one brand + one time period now.
function StageBreakdownTable({ deals, color }) {
  return (
    <div style={{margin:'4px 0 8px',overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:420}}>
        <thead>
          <tr style={{borderBottom:'1px solid #E0E4EC'}}>
            {['Stage','Sub','Lic','Total','#'].map((h,i)=>
              <th key={h} style={{padding:'4px 8px',fontWeight:500,color:'#8A9BB0',textAlign:i===0?'left':'right'}}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {STAGE_ORDER.map(s=>{
            const sd = deals.filter(d=>d.stage===s);
            const { sub, lic, total, count } = periodSum(sd);
            const isA = ACHIEVED.has(s), isC = s==='Commit';
            return (
              <tr key={s} style={{borderBottom:'1px solid #F0F2F6',background:isA?'#F0FAF4':isC?'#EAF0F8':undefined,opacity:total?1:0.4}}>
                <td style={{padding:'5px 8px',fontWeight:isA||isC?500:400,color:isA?GREEN:isC?color:'#0A1628'}}>{s}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:'#3A4A5C'}}>{sub?fmtK(sub):'—'}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:'#3A4A5C'}}>{lic?fmtK(lic):'—'}</td>
                <td style={{padding:'5px 8px',textAlign:'right',fontWeight:500,color:'#0A1628'}}>{total?fmtK(total):'—'}</td>
                <td style={{padding:'5px 8px',textAlign:'right',color:'#8A9BB0'}}>{count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const dropdownStyle = { fontSize:11,padding:'4px 8px',borderRadius:6,background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',cursor:'pointer'};

// Per-brand pipeline section: always shows the Stage breakdown table, scoped
// to whichever time period is picked via the Quarter / Month dropdowns.
// Default is "Rest of [current year]", anchored to today's real date — not
// the page-level Year filter, since "rest of year" always means the actual
// current calendar year regardless of what report year is selected elsewhere.
function PipelineBrandSection({ brand, color, allDeals }) {
  const [selQuarter, setSelQuarter] = useState('ROY'); // 'ROY' or 'Q1'..'Q4'
  const [selMonth, setSelMonth] = useState('ALL');       // 'ALL' or a month index

  const { year, periodDeals, periodLabel } = useMemo(()=>{
    const now = new Date(); now.setHours(0,0,0,0);
    const y = now.getFullYear();
    let pdeals, label;
    if (selQuarter === 'ROY') {
      pdeals = allDeals.filter(d=>{
        if (d.brand!==brand || !d.closedate || d.closeyear!==y) return false;
        const cd = new Date(d.closedate+'T00:00:00');
        return cd >= now;
      });
      label = `Rest of ${y}`;
    } else {
      const q = PIPE_QUARTERS[selQuarter];
      const months = selMonth==='ALL' ? q.months : [parseInt(selMonth)];
      pdeals = allDeals.filter(d=>d.brand===brand && d.closeyear===y && months.includes(d.closemonth));
      label = selMonth==='ALL' ? `${q.label} · ${y}` : `${MONTHS[parseInt(selMonth)]} ${y}`;
    }
    return { year: y, periodDeals: pdeals, periodLabel: label };
  }, [allDeals, brand, selQuarter, selMonth]);

  const m = periodSum(periodDeals);
  const bg = brand === 'Optitex' ? NAVY : NAVY_SM;
  const q = selQuarter !== 'ROY' ? PIPE_QUARTERS[selQuarter] : null;

  return (
    <div style={{marginBottom:20}}>
      <div style={{background:bg,borderRadius:12,padding:'16px 20px',marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:10}}>
          <p style={{fontSize:12,color:'#8AAFD4',margin:0,textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500}}>{brand} — {periodLabel}</p>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select value={selQuarter} onChange={e=>{setSelQuarter(e.target.value); setSelMonth('ALL');}} style={dropdownStyle}>
              <option value="ROY">Rest of Year</option>
              {Object.keys(PIPE_QUARTERS).map(qk=><option key={qk} value={qk}>{PIPE_QUARTERS[qk].label}</option>)}
            </select>
            {q && (
              <select value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={dropdownStyle}>
                <option value="ALL">All months</option>
                {q.months.map(mo=><option key={mo} value={mo}>{MONTHS[mo]}</option>)}
              </select>
            )}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem'}}>
          <div>
            <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Subscription</p>
            <p style={{fontSize:22,fontWeight:600,margin:0,color:'#fff'}}>{fmtK(m.sub)}</p>
          </div>
          <div>
            <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Licence</p>
            <p style={{fontSize:22,fontWeight:600,margin:0,color:'#fff'}}>{fmtK(m.lic)}</p>
          </div>
          <div>
            <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Total</p>
            <p style={{fontSize:22,fontWeight:600,margin:0,color:'#4AE89A'}}>{fmtK(m.total)}</p>
          </div>
          <div>
            <p style={{fontSize:10,color:'#8AAFD4',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'0.4px'}}>Deals</p>
            <p style={{fontSize:22,fontWeight:600,margin:0,color:'#7ABFFF'}}>{m.count}</p>
          </div>
        </div>
      </div>
      <StageBreakdownTable deals={periodDeals} color={color}/>
    </div>
  );
}

function ForecastTable({ brand, color, data, currentQuarterKey, currentQuarterAchieved }) {
  const monthsPresent = Object.keys(data).map(Number).sort((a,b)=>a-b);
  const rows = [];
  const grand = { sub:0, lic:0, n:0 };

  ['Q1','Q2','Q3','Q4'].forEach(qk=>{
    const q = PIPE_QUARTERS[qk];
    const monthsInQ = q.months.filter(m=>monthsPresent.includes(m));
    if (!monthsInQ.length) return;

    monthsInQ.forEach(m=>{
      rows.push({ type:'month', month:m, ...data[m] });
      grand.sub += data[m].sub; grand.lic += data[m].lic; grand.n += data[m].n;
    });

    let qSub = monthsInQ.reduce((a,m)=>a+data[m].sub,0);
    let qLic = monthsInQ.reduce((a,m)=>a+data[m].lic,0);
    let qN   = monthsInQ.reduce((a,m)=>a+data[m].n,0);
    const isCurrentQ = qk === currentQuarterKey;
    if (isCurrentQ) {
      qSub += currentQuarterAchieved.sub; qLic += currentQuarterAchieved.lic; qN += currentQuarterAchieved.count;
      grand.sub += currentQuarterAchieved.sub; grand.lic += currentQuarterAchieved.lic; grand.n += currentQuarterAchieved.count;
    }
    rows.push({ type:'subtotal', label:q.label, isCurrentQ, sub:qSub, lic:qLic, n:qN });
  });

  return (
    <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto',marginBottom:12}}>
      <p style={{fontSize:13,fontWeight:600,color,margin:'0 0 10px'}}>{brand} — monthly commit forecast (remaining months)</p>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{borderBottom:'1px solid #E0E4EC'}}>
            {['Month','Subscription','Licence','Total','Deals'].map(h=>
              <th key={h} style={{padding:'5px 10px',color:'#8A9BB0',fontWeight:500,textAlign:h==='Month'?'left':'right'}}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=> r.type==='month' ? (
            <tr key={'m'+r.month} style={{borderBottom:'1px solid #F0F2F6'}}>
              <td style={{padding:'7px 10px',fontWeight:500,color:'#0A1628'}}>{MONTHS[r.month]}</td>
              <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{fmtK(r.sub)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{fmtK(r.lic)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500,color:'#0A1628'}}>{fmtK(r.sub+r.lic)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',color:'#8A9BB0'}}>{r.n}</td>
            </tr>
          ) : (
            <tr key={'q'+r.label} style={{borderBottom:'2px solid #E0E4EC',background:'#F4F6F9'}}>
              <td style={{padding:'7px 10px',fontWeight:600,color:'#0A1628'}}>
                {r.label} subtotal
                {r.isCurrentQ && <span style={{fontSize:9,marginLeft:6,color:GREEN,fontWeight:600}}>incl. Closed Won + Processing</span>}
              </td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(r.sub)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(r.lic)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color}}>{fmtK(r.sub+r.lic)}</td>
              <td style={{padding:'7px 10px',textAlign:'right',color:'#8A9BB0'}}>{r.n}</td>
            </tr>
          ))}
          <tr style={{borderTop:'1px solid #E0E4EC',background:'#EAF0F8'}}>
            <td style={{padding:'7px 10px',fontWeight:600,color:'#0A1628'}}>Total</td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(grand.sub)}</td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(grand.lic)}</td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:NAV}}>{fmtK(grand.sub+grand.lic)}</td>
            <td style={{padding:'7px 10px',textAlign:'right',color:'#8A9BB0'}}>{grand.n}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Collapsed-by-default YTD closed summary — quarter-grouped monthly totals,
// only through the current month (unlike the Forecast tab, showing future
// months here wouldn't make sense — they haven't closed yet).
function YtdClosedSummary({ monthly, year }) {
  const [open, setOpen] = useState(false);
  const currentMonth = new Date().getMonth();

  const rows = [];
  const grand = { total: 0, count: 0 };
  ['Q1','Q2','Q3','Q4'].forEach(qk=>{
    const q = PIPE_QUARTERS[qk];
    const monthsInQ = q.months.filter(m=>m<=currentMonth);
    if (!monthsInQ.length) return;
    monthsInQ.forEach(m=>{ rows.push({ type:'month', month:m, total:monthly[m] }); grand.total += monthly[m]; });
    const qTotal = monthsInQ.reduce((a,m)=>a+monthly[m],0);
    rows.push({ type:'subtotal', label:q.label, total:qTotal });
  });

  return (
    <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',background:'none',border:'none',cursor:'pointer',padding:0}}>
        <span style={{fontSize:13,fontWeight:600,color:'#0A1628'}}>Closed deals YTD ({year}) — monthly &amp; quarterly</span>
        <span style={{fontSize:12,color:'#8A9BB0'}}>{open?'▲ hide':'▼ show'}</span>
      </button>
      {open && (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginTop:12}}>
          <thead>
            <tr style={{borderBottom:'1px solid #E0E4EC'}}>
              <th style={{padding:'5px 8px',fontWeight:500,color:'#8A9BB0',textAlign:'left'}}>Period</th>
              <th style={{padding:'5px 8px',fontWeight:500,color:'#8A9BB0',textAlign:'right'}}>Total closed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=> r.type==='month' ? (
              <tr key={'m'+r.month} style={{borderBottom:'1px solid #F0F2F6'}}>
                <td style={{padding:'6px 8px',color:'#0A1628'}}>{MONTHS[r.month]}</td>
                <td style={{padding:'6px 8px',textAlign:'right',color:'#3A4A5C'}}>{fmtK(r.total)}</td>
              </tr>
            ) : (
              <tr key={'q'+r.label} style={{borderBottom:'2px solid #E0E4EC',background:'#F4F6F9'}}>
                <td style={{padding:'6px 8px',fontWeight:600,color:'#0A1628'}}>{r.label} subtotal</td>
                <td style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:NAV}}>{fmtK(r.total)}</td>
              </tr>
            ))}
            <tr style={{borderTop:'1px solid #E0E4EC',background:'#EAF0F8'}}>
              <td style={{padding:'6px 8px',fontWeight:700,color:'#0A1628'}}>{year} YTD total</td>
              <td style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:GREEN}}>{fmtK(grand.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [targets, setTargets] = useState(defTargets);
  const [filter, setFilter] = useState({ year: String(new Date().getFullYear()) });
  const [tab, setTab] = useState('tab');
  const [showTargets, setShowTargets] = useState(false);
  const [pipeStages, setPipeStages] = useState(DEFAULT_PIPE_STAGES);

  useEffect(()=>{
    try{ const s=localStorage.getItem(STORAGE_KEY); if(s) setTargets(JSON.parse(s)); }catch{}
  },[]);

  const saveTargets = useCallback((updater)=>{
    setTargets(prev=>{
      const next=typeof updater==='function'?updater(prev):updater;
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{}
      return next;
    });
  },[]);

  const setTarget = useCallback((key,field,val)=>{
    saveTargets(prev=>({...prev,[key]:{...prev[key],[field]:pNum(val)}}));
  },[saveTargets]);

  const fetchDeals = useCallback(async()=>{
    setLoading(true); setError(null);
    try{
      const res=await fetch('/api/deals');
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      setDeals(data.deals||[]); setLastRefresh(new Date());
    }catch(e){ setError(e.message); }
    setLoading(false);
  },[]);

  useEffect(()=>{ fetchDeals(); },[fetchDeals]);

  const fd = useMemo(()=>deals.filter(d=>{
    if(filter.year && d.closeyear && d.closeyear!==parseInt(filter.year)) return false;
    return true;
  }),[deals,filter]);

  const fcastData = useMemo(()=>{
    const currentMonth = new Date().getMonth(); // real "today", not the year filter
    const build = brand => {
      const bm={};
      for(let m=currentMonth;m<12;m++) bm[m]={sub:0,lic:0,n:0}; // only remaining months of the year
      for(const d of fd.filter(d=>d.stage==='Commit' && d.brand===brand)){
        const m=d.closemonth; if(m===null||m===undefined||m<currentMonth) continue;
        bm[m].sub+=d.sub||0; bm[m].lic+=d.lic||0; bm[m].n++;
      }
      return bm;
    };
    return { Optitex: build('Optitex'), NedGraphics: build('NedGraphics') };
  },[fd]);

  // Which quarter is "now", and what's already Closed Won / Processing within it —
  // blended into that quarter's subtotal so it reflects the realistic full total
  // (already-landed + still-open Commit), not just what's still in Commit.
  const currentQuarterKey = useMemo(()=>{
    const currentMonth = new Date().getMonth();
    return Object.keys(PIPE_QUARTERS).find(qk=>PIPE_QUARTERS[qk].months.includes(currentMonth));
  },[]);
  const currentQuarterAchieved = useMemo(()=>{
    const months = PIPE_QUARTERS[currentQuarterKey].months;
    const build = brand => periodSum(fd.filter(d=>d.brand===brand && ACHIEVED.has(d.stage) && months.includes(d.closemonth)));
    return { Optitex: build('Optitex'), NedGraphics: build('NedGraphics') };
  },[fd, currentQuarterKey]);

  // Deal Hygiene: open deals only (DEFAULT_PIPE_STAGES = genuinely still in play,
  // excludes Closed Won/Lost/Processing/test stages). Uses the raw `deals` list,
  // not the year-filtered `fd`, since a slipped close date matters regardless
  // of which reporting year the person happens to have selected.
  const hygieneData = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const soonCutoff = new Date(today); soonCutoff.setDate(soonCutoff.getDate() + CLOSING_SOON_WINDOW_DAYS);
    const overdue = [], closingSoon = [];
    for (const d of deals) {
      if (!d.closedate || !DEFAULT_PIPE_STAGES.has(d.stage)) continue;
      const cd = new Date(d.closedate + 'T00:00:00');
      if (cd < today) {
        overdue.push({ ...d, daysOverdue: Math.round((today - cd) / 86400000) });
      } else if (cd <= soonCutoff) {
        closingSoon.push({ ...d, daysUntil: Math.round((cd - today) / 86400000) });
      }
    }
    overdue.sort((a,b)=>b.daysOverdue-a.daysOverdue);
    closingSoon.sort((a,b)=>a.daysUntil-b.daysUntil);
    return { overdue, closingSoon };
  }, [deals]);

  // One-click nudge: opens Outlook Web's compose window, pre-filled with the
  // deal owner's email (pulled from HubSpot), subject, and message.
  const nudgeHref = (d, kind) => {
    const subject = encodeURIComponent(`Close date check: ${d.name}`);
    const body = kind === 'overdue'
      ? `Hi ${d.sm},\n\n"${d.name}" (${d.brand}) shows a close date of ${d.closedate} — that's ${d.daysOverdue} day${d.daysOverdue===1?'':'s'} overdue. Could you update it in HubSpot to reflect where things actually stand?\n\nThanks!`
      : `Hi ${d.sm},\n\nJust a heads up — "${d.name}" (${d.brand}) is due to close on ${d.closedate}, ${d.daysUntil} day${d.daysUntil===1?'':'s'} away. Let me know if that's still on track or needs updating.\n\nThanks!`;
    const to = encodeURIComponent(d.smEmail || '');
    return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  // ---- Closed tab: weekly closes, leaderboard, reigning champion, YTD summary ----
  // Monday-Sunday week containing the given date. Both "this week" and "last
  // week" are always computed live from actual close dates — there's no
  // separate snapshot/lock-in step, so the "reigning champion" the following
  // week is simply whoever tops last week's Mon-Sun window on any given visit.
  const weekBounds = (refDate) => {
    const d = new Date(refDate); d.setHours(0,0,0,0);
    const day = d.getDay(); // 0=Sun..6=Sat
    const diffToMonday = day===0 ? -6 : 1-day;
    const monday = new Date(d); monday.setDate(d.getDate()+diffToMonday);
    const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    return { start: monday, end: sunday };
  };

  const closedData = useMemo(()=>{
    const today = new Date(); today.setHours(0,0,0,0);
    const thisWeek = weekBounds(today);
    const lastWeekRef = new Date(thisWeek.start); lastWeekRef.setDate(lastWeekRef.getDate()-1);
    const lastWeek = weekBounds(lastWeekRef);

    const inWindow = (d, win) => {
      if (!d.closedate || d.stage !== 'Closed Won') return false;
      const cd = new Date(d.closedate + 'T00:00:00');
      return cd >= win.start && cd <= win.end;
    };

    const thisWeekDeals = deals.filter(d=>inWindow(d, thisWeek)).sort((a,b)=>new Date(b.closedate)-new Date(a.closedate));
    const lastWeekDeals = deals.filter(d=>inWindow(d, lastWeek));

    const bySM = (list) => {
      const m = {};
      for (const d of list) {
        if (!m[d.sm]) m[d.sm] = 0;
        m[d.sm] += d.totalValue || 0;
      }
      return Object.entries(m).map(([sm,total])=>({sm,total})).sort((a,b)=>b.total-a.total);
    };

    const leaderboard = bySM(thisWeekDeals).slice(0,3);
    const lastWeekBoard = bySM(lastWeekDeals);
    const reigningChampion = lastWeekBoard.length ? lastWeekBoard[0] : null;

    // YTD monthly/quarterly totals (Closed Won, current year, total deal value)
    const year = today.getFullYear();
    const monthly = {};
    for (let m=0;m<12;m++) monthly[m] = 0;
    for (const d of deals) {
      if (d.stage!=='Closed Won' || d.closeyear!==year || d.closemonth==null) continue;
      monthly[d.closemonth] += d.totalValue || 0;
    }

    return { thisWeek, lastWeek, thisWeekDeals, leaderboard, reigningChampion, monthly, year };
  }, [deals]);

  const tabBtn=(key,label)=>(
    <button key={key} onClick={()=>setTab(key)} style={{padding:'8px 18px',fontSize:13,border:'none',background:'transparent',borderBottom:tab===key?`2px solid ${NAV}`:'2px solid transparent',color:tab===key?NAV:'#8A9BB0',fontWeight:tab===key?500:400,cursor:'pointer',borderRadius:0,whiteSpace:'nowrap'}}>{label}</button>
  );

  const years=[...new Set(deals.map(d=>d.closeyear).filter(Boolean))].sort().reverse();

  return (
    <div style={{fontFamily:"'Inter',-apple-system,sans-serif",padding:'1.5rem',maxWidth:1200,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:600,color:'#0A1628',margin:0}}>European Sales Dashboard</h1>
          <p style={{fontSize:12,color:'#8A9BB0',margin:'3px 0 0'}}>
            {loading?'Loading...':error?`Error: ${error}`:`${deals.length} deals · ${fd.length} shown · refreshed ${lastRefresh?lastRefresh.toLocaleTimeString():'—'}`}
          </p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <select value={filter.year} onChange={e=>setFilter(f=>({...f,year:e.target.value}))}
            style={{fontSize:13,padding:'6px 10px',borderRadius:8,border:'1px solid #DDE1E8',background:'#fff'}}>
            <option value="">All years</option>
            {years.map(y=><option key={y} value={String(y)}>{y}</option>)}
          </select>
          <button onClick={()=>setShowTargets(s=>!s)}
            style={{padding:'6px 14px',fontSize:13,borderRadius:8,border:`1px solid ${showTargets?NAV:'#DDE1E8'}`,background:showTargets?'#EAF0F8':'#fff',color:showTargets?NAV:'#3A4A5C',cursor:'pointer'}}>
            ◎ Targets
          </button>
          <button onClick={fetchDeals} disabled={loading}
            style={{padding:'6px 14px',fontSize:13,borderRadius:8,border:'none',background:NAV,color:'#fff',cursor:loading?'default':'pointer',opacity:loading?0.7:1}}>
            {loading?'↻ Loading…':'↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Targets */}
      {showTargets && (
        <div style={{background:'#F4F6F9',borderRadius:12,padding:'1rem 1.25rem',marginBottom:'1.25rem',border:'1px solid #E0E4EC'}}>
          <p style={{fontSize:13,fontWeight:500,color:'#0A1628',margin:'0 0 12px'}}>Annual booking targets (€)</p>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',fontSize:12,width:'100%',minWidth:420}}>
              <thead>
                <tr style={{borderBottom:'1px solid #DDE1E8'}}>
                  {['','Sub target','Licence target','Total'].map(h=>
                    <th key={h} style={{padding:'5px 10px',color:'#8A9BB0',fontWeight:500,textAlign:h===''?'left':'right'}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {SM_LIST.flatMap(sm=>
                  DUAL_BRAND_SMS.has(sm)
                    ? [{label:`${sm} (Optitex)`, key:`${sm}-Optitex`}, {label:`${sm} (NedGraphics)`, key:`${sm}-NedGraphics`}]
                    : [{label:sm, key:sm}]
                ).map(({label,key})=>{
                  const t=targets[key]||{sub:0,lic:0};
                  return (
                    <tr key={key} style={{borderBottom:'1px solid #EEF0F4'}}>
                      <td style={{padding:'5px 10px',fontWeight:500,color:'#0A1628'}}>{label}</td>
                      <td style={{padding:'5px 8px'}}>
                        <input type="number" value={t.sub||''} placeholder="0" onChange={e=>setTarget(key,'sub',e.target.value)}
                          style={{width:'100%',fontSize:12,textAlign:'right',padding:'3px 6px',border:'1px solid #DDE1E8',borderRadius:6}}/>
                      </td>
                      <td style={{padding:'5px 8px'}}>
                        <input type="number" value={t.lic||''} placeholder="0" onChange={e=>setTarget(key,'lic',e.target.value)}
                          style={{width:'100%',fontSize:12,textAlign:'right',padding:'3px 6px',border:'1px solid #DDE1E8',borderRadius:6}}/>
                      </td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#8A9BB0'}}>{fmtK((t.sub||0)+(t.lic||0))}</td>
                    </tr>
                  );
                })}
                <tr><td colSpan={4} style={{padding:'6px 0'}}><div style={{borderTop:'2px solid #DDE1E8'}}/></td></tr>
                {EUROPE_TARGETS.map((key,i)=>{
                  const t=targets[key]||{sub:0,lic:0};
                  const color=i===0?NAV:TEAL;
                  return (
                    <tr key={key} style={{borderBottom:'1px solid #EEF0F4',background:'#EEF3FA'}}>
                      <td style={{padding:'5px 10px',fontWeight:600,color}}>{key}</td>
                      <td style={{padding:'5px 8px'}}>
                        <input type="number" value={t.sub||''} placeholder="0" onChange={e=>setTarget(key,'sub',e.target.value)}
                          style={{width:'100%',fontSize:12,textAlign:'right',padding:'3px 6px',border:`1px solid ${color}`,borderRadius:6}}/>
                      </td>
                      <td style={{padding:'5px 8px'}}>
                        <input type="number" value={t.lic||''} placeholder="0" onChange={e=>setTarget(key,'lic',e.target.value)}
                          style={{width:'100%',fontSize:12,textAlign:'right',padding:'3px 6px',border:`1px solid ${color}`,borderRadius:6}}/>
                      </td>
                      <td style={{padding:'5px 10px',textAlign:'right',fontWeight:600,color}}>{fmtK((t.sub||0)+(t.lic||0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{fontSize:11,color:'#8A9BB0',margin:'10px 0 0'}}>Targets saved in your browser automatically.</p>
        </div>
      )}

      {/* Nav */}
      <div style={{display:'flex',borderBottom:'1px solid #E0E4EC',marginBottom:'1.25rem',overflowX:'auto'}}>
        {tabBtn('tab','Target / Achieved / Balance')}
        {tabBtn('pipeline','Pipeline coverage')}
        {tabBtn('forecast','Monthly forecast')}
        {tabBtn('closed','Closed 🏆')}
        <button onClick={()=>setTab('hygiene')} style={{padding:'8px 18px',fontSize:13,border:'none',background:'transparent',borderBottom:tab==='hygiene'?`2px solid ${NAV}`:'2px solid transparent',color:tab==='hygiene'?NAV:'#8A9BB0',fontWeight:tab==='hygiene'?500:400,cursor:'pointer',borderRadius:0,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
          Deal Hygiene
          {hygieneData.overdue.length>0 && (
            <span style={{background:RED,color:'#fff',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:999}}>{hygieneData.overdue.length}</span>
          )}
        </button>
      </div>

      {error&&<div style={{padding:'12px 16px',background:'#FDECEA',border:'1px solid #F5C6C2',borderRadius:10,color:RED,fontSize:13,marginBottom:'1rem'}}>⚠ {error}</div>}

      {/* TAB */}
      {tab==='tab'&&(
        <div>
          <BrandSection brand="Optitex" deals={fd} targets={targets} pipeStages={pipeStages} setPipeStages={setPipeStages}/>
          <BrandSection brand="NedGraphics" deals={fd} targets={targets} pipeStages={pipeStages} setPipeStages={setPipeStages}/>
        </div>
      )}

      {/* Pipeline */}
      {tab==='pipeline'&&(
        <div>
          <PipelineBrandSection brand="Optitex" color={NAV} allDeals={deals}/>
          <PipelineBrandSection brand="NedGraphics" color={TEAL} allDeals={deals}/>
        </div>
      )}

      {/* Forecast */}
      {tab==='forecast'&&(
        <div>
          <ForecastTable brand="Optitex" color={NAV} data={fcastData.Optitex} currentQuarterKey={currentQuarterKey} currentQuarterAchieved={currentQuarterAchieved.Optitex}/>
          <ForecastTable brand="NedGraphics" color={TEAL} data={fcastData.NedGraphics} currentQuarterKey={currentQuarterKey} currentQuarterAchieved={currentQuarterAchieved.NedGraphics}/>
        </div>
      )}

      {/* Closed */}
      {tab==='closed'&&(
        <div>
          {closedData.reigningChampion && (
            <div style={{background:'linear-gradient(135deg,#1A1F3A,#2A1F4A)',borderRadius:12,padding:'14px 20px',marginBottom:14,display:'flex',alignItems:'center',gap:14}}>
              <span style={{fontSize:28}}>🏆</span>
              <div>
                <p style={{fontSize:10,color:'#C4A6FF',margin:'0 0 2px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Reigning Champion — last week</p>
                <p style={{fontSize:16,fontWeight:600,margin:0,color:'#fff'}}>{closedData.reigningChampion.sm} <span style={{color:'#4AE89A',fontWeight:600}}>· {fmtK(closedData.reigningChampion.total)}</span></p>
              </div>
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,marginBottom:14,alignItems:'start'}}>
            {/* This week's closed deals */}
            <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto'}}>
              <p style={{fontSize:13,fontWeight:600,color:'#0A1628',margin:'0 0 10px'}}>
                Closed this week ({closedData.thisWeek.start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – {closedData.thisWeek.end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})})
              </p>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:460}}>
                <thead>
                  <tr style={{borderBottom:'1px solid #E0E4EC'}}>
                    {['Close date','Deal','Brand','SM','Total'].map((h,i)=>
                      <th key={h} style={{padding:'5px 8px',fontWeight:500,color:'#8A9BB0',textAlign:i===4?'right':'left'}}>{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {closedData.thisWeekDeals.map(d=>(
                    <tr key={d.id} style={{borderBottom:'1px solid #F0F2F6'}}>
                      <td style={{padding:'6px 8px',color:'#3A4A5C'}}>{d.closedate}</td>
                      <td style={{padding:'6px 8px',color:'#0A1628',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</td>
                      <td style={{padding:'6px 8px',color:'#3A4A5C'}}>{d.brand}</td>
                      <td style={{padding:'6px 8px',color:'#3A4A5C'}}>{d.sm}</td>
                      <td style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:GREEN}}>{fmtK(d.totalValue)}</td>
                    </tr>
                  ))}
                  {closedData.thisWeekDeals.length===0 && <tr><td colSpan={5} style={{padding:'1.5rem',textAlign:'center',color:'#8A9BB0',fontSize:12}}>Nothing closed yet this week</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Leaderboard */}
            <div style={{background:NAVY,borderRadius:12,padding:'1rem'}}>
              <p style={{fontSize:12,color:'#8AAFD4',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500}}>This Week's Leaderboard</p>
              {closedData.leaderboard.map((row,i)=>(
                <div key={row.sm} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<closedData.leaderboard.length-1?'1px solid rgba(255,255,255,0.08)':'none'}}>
                  <span style={{fontSize:18}}>{['🥇','🥈','🥉'][i]}</span>
                  <span style={{fontSize:13,fontWeight:500,color:'#fff',flex:1}}>{row.sm}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#4AE89A'}}>{fmtK(row.total)}</span>
                </div>
              ))}
              {closedData.leaderboard.length===0 && <p style={{fontSize:12,color:'#8AAFD4',margin:0}}>No closes yet this week</p>}
            </div>
          </div>

          {/* YTD summary — collapsed by default to keep the weekly view uncluttered */}
          <YtdClosedSummary monthly={closedData.monthly} year={closedData.year}/>
        </div>
      )}

      {/* Deal Hygiene */}
      {tab==='hygiene'&&(
        <div>
          <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto',marginBottom:12}}>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 10px',color:RED}}>
              🔴 Overdue ({hygieneData.overdue.length})
            </p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:560}}>
              <thead>
                <tr style={{borderBottom:'1px solid #E0E4EC'}}>
                  {['Deal','SM','Brand','Close date','Days overdue',''].map((h,i)=>
                    <th key={h} style={{padding:'6px 10px',fontWeight:500,color:'#8A9BB0',textAlign:i>=3?'right':'left'}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {hygieneData.overdue.map(d=>(
                  <tr key={d.id} style={{borderBottom:'1px solid #F0F2F6',background:'#FDF2F1'}}>
                    <td style={{padding:'7px 10px',color:'#0A1628',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</td>
                    <td style={{padding:'7px 10px',color:'#3A4A5C'}}>{d.sm}</td>
                    <td style={{padding:'7px 10px',color:'#3A4A5C'}}>{d.brand}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{d.closedate}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:RED}}>{d.daysOverdue}d</td>
                    <td style={{padding:'7px 10px',textAlign:'right'}}>
                      <a href={nudgeHref(d,'overdue')} target="_blank" rel="noopener noreferrer" style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:RED,color:'#fff',textDecoration:'none',whiteSpace:'nowrap'}}>Nudge</a>
                    </td>
                  </tr>
                ))}
                {hygieneData.overdue.length===0&&<tr><td colSpan={6} style={{padding:'1.5rem',textAlign:'center',color:'#8A9BB0',fontSize:12}}>Nothing overdue 🎉</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto'}}>
            <p style={{fontSize:13,fontWeight:600,margin:'0 0 10px',color:AMBER}}>
              🟡 Closing soon — next {CLOSING_SOON_WINDOW_DAYS} days ({hygieneData.closingSoon.length})
            </p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:560}}>
              <thead>
                <tr style={{borderBottom:'1px solid #E0E4EC'}}>
                  {['Deal','SM','Brand','Close date','Days away',''].map((h,i)=>
                    <th key={h} style={{padding:'6px 10px',fontWeight:500,color:'#8A9BB0',textAlign:i>=3?'right':'left'}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {hygieneData.closingSoon.map(d=>(
                  <tr key={d.id} style={{borderBottom:'1px solid #F0F2F6',background:'#FBF6EC'}}>
                    <td style={{padding:'7px 10px',color:'#0A1628',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</td>
                    <td style={{padding:'7px 10px',color:'#3A4A5C'}}>{d.sm}</td>
                    <td style={{padding:'7px 10px',color:'#3A4A5C'}}>{d.brand}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{d.closedate}</td>
                    <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:AMBER}}>{d.daysUntil}d</td>
                    <td style={{padding:'7px 10px',textAlign:'right'}}>
                      <a href={nudgeHref(d,'closingSoon')} target="_blank" rel="noopener noreferrer" style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:AMBER,color:'#fff',textDecoration:'none',whiteSpace:'nowrap'}}>Nudge</a>
                    </td>
                  </tr>
                ))}
                {hygieneData.closingSoon.length===0&&<tr><td colSpan={6} style={{padding:'1.5rem',textAlign:'center',color:'#8A9BB0',fontSize:12}}>Nothing closing in the next {CLOSING_SOON_WINDOW_DAYS} days</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{fontSize:11,color:'#C0C8D8',marginTop:'1.5rem',textAlign:'center'}}>
        Optitex & NedGraphics · European Sales Dashboard · Auto-refreshes on load · Data from HubSpot
      </p>
    </div>
  );
}
