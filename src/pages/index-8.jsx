import { useState, useMemo, useEffect, useCallback, useRef } from 'react';

const STAGE_ORDER = ['Pipeline','Qualification','Upside','Selected','Commit','Processing','Closed Won'];
const ACHIEVED = new Set(['Processing','Closed Won']);
const SM_LIST = ['Sabine','Marco','Giulia','Canan','Henk','Susanna','James'];
const OPTITEX_SMS = ['Sabine','Marco','Giulia','Susanna','James'];
const NED_SMS = ['Canan','Henk','Susanna','James'];
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
    Sabine:  { sub: 40000,  lic: 76000 },
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

const STORAGE_KEY='opti_dashboard_targets_v6';

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

  const pipeData = useMemo(()=>{
    const res={};
    for(const s of STAGE_ORDER){
      const sd=fd.filter(d=>d.stage===s);
      const op=sd.filter(d=>d.brand==='Optitex');
      const nd=sd.filter(d=>d.brand==='NedGraphics');
      const sum=(arr,f)=>arr.reduce((a,d)=>a+(d[f]||0),0);
      res[s]={count:sd.length,opSub:sum(op,'sub'),opLic:sum(op,'lic'),ndSub:sum(nd,'sub'),ndLic:sum(nd,'lic'),total:sum(sd,'sub')+sum(sd,'lic')};
    }
    return res;
  },[fd]);

  const fcastData = useMemo(()=>{
    const bm={};
    for(const d of fd.filter(d=>d.stage==='Commit')){
      const m=d.closemonth; if(m===null||m===undefined) continue;
      if(!bm[m]) bm[m]={sub:0,lic:0,n:0};
      bm[m].sub+=d.sub||0; bm[m].lic+=d.lic||0; bm[m].n++;
    }
    return bm;
  },[fd]);

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
          <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto',marginBottom:10}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:540}}>
              <thead>
                <tr style={{borderBottom:'1px solid #E0E4EC'}}>
                  {['Stage','Opti sub','Opti lic','Ned sub','Ned lic','Total','#'].map((h,i)=>(
                    <th key={i} style={{padding:'6px 10px',fontWeight:500,color:i>=1&&i<=2?NAV:i>=3&&i<=4?TEAL:'#8A9BB0',textAlign:i===0?'left':'right'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGE_ORDER.map(s=>{
                  const d=pipeData[s]||{};
                  const isA=ACHIEVED.has(s),isC=s==='Commit',isP=s==='Processing';
                  return (
                    <tr key={s} style={{borderBottom:'1px solid #F0F2F6',background:isA?'#F0FAF4':isC?'#EAF0F8':undefined,opacity:d.total?1:0.4}}>
                      <td style={{padding:'8px 10px',fontWeight:isA||isC?500:400,color:isA?GREEN:isC?NAV:'#0A1628'}}>
                        {s}
                        {isP&&<span style={{fontSize:10,marginLeft:6,color:AMBER}}>pending close</span>}
                        {s==='Closed Won'&&<span style={{fontSize:10,marginLeft:6,color:GREEN}}>= achieved</span>}
                      </td>
                      {[d.opSub,d.opLic,d.ndSub,d.ndLic].map((v,i)=><td key={i} style={{padding:'8px 10px',textAlign:'right',color:'#3A4A5C'}}>{v?fmtK(v):'—'}</td>)}
                      <td style={{padding:'8px 10px',textAlign:'right',fontWeight:500,color:'#0A1628'}}>{d.total?fmtK(d.total):'—'}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'#8A9BB0'}}>{d.count||0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forecast */}
      {tab==='forecast'&&(
        <div style={{background:'#fff',border:'1px solid #E0E4EC',borderRadius:12,padding:'1rem',overflowX:'auto'}}>
          <p style={{fontSize:13,fontWeight:500,color:'#0A1628',margin:'0 0 10px'}}>Monthly commit forecast — subscription and licence by close date</p>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid #E0E4EC'}}>
                {['Month','Subscription','Licence','Total','Deals'].map(h=>
                  <th key={h} style={{padding:'5px 10px',color:'#8A9BB0',fontWeight:500,textAlign:h==='Month'?'left':'right'}}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(fcastData).sort((a,b)=>a[0]-b[0]).map(([m,d])=>(
                <tr key={m} style={{borderBottom:'1px solid #F0F2F6'}}>
                  <td style={{padding:'7px 10px',fontWeight:500,color:'#0A1628'}}>{MONTHS[parseInt(m)]}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{fmtK(d.sub)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',color:'#3A4A5C'}}>{fmtK(d.lic)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500,color:'#0A1628'}}>{fmtK(d.sub+d.lic)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',color:'#8A9BB0'}}>{d.n}</td>
                </tr>
              ))}
              {Object.keys(fcastData).length===0&&<tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#8A9BB0',fontSize:12}}>No commit deals in current filter</td></tr>}
              {Object.keys(fcastData).length>0&&(()=>{
                const tS=Object.values(fcastData).reduce((a,d)=>a+d.sub,0);
                const tL=Object.values(fcastData).reduce((a,d)=>a+d.lic,0);
                const tN=Object.values(fcastData).reduce((a,d)=>a+d.n,0);
                return <tr style={{borderTop:'1px solid #E0E4EC',background:'#F4F6F9'}}>
                  <td style={{padding:'7px 10px',fontWeight:600,color:'#0A1628'}}>Total</td>
                  <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(tS)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500}}>{fmtK(tL)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:NAV}}>{fmtK(tS+tL)}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',color:'#8A9BB0'}}>{tN}</td>
                </tr>;
              })()}
            </tbody>
          </table>
        </div>
      )}

      <p style={{fontSize:11,color:'#C0C8D8',marginTop:'1.5rem',textAlign:'center'}}>
        Optitex & NedGraphics · European Sales Dashboard · Auto-refreshes on load · Data from HubSpot
      </p>
    </div>
  );
}
