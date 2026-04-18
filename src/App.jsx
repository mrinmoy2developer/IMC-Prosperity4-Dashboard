import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { parseP4Json } from "./parser.js";
import { PRICE_SERIES, DEFAULT_HIDDEN_G, DEFAULT_HIDDEN_L } from "./seriesConfig.js";
import { lsSave, lsLoadRaw, lsLoadMeta, lsClear } from "./persistence.js";
import { useResizable } from "./hooks/useResizable.js";
import { PriceChart }   from "./components/PriceChart.jsx";
import { CustomLegend } from "./components/CustomLegend.jsx";
import { DataTable }    from "./components/DataTable.jsx";
import { RangeBar }     from "./components/RangeBar.jsx";
import { StatsPanel }   from "./components/StatsPanel.jsx";

const API  = "http://localhost:3001";
const EMPTY = { symbols:[], touch:{}, placedBids:{}, placedAsks:{}, fills:{}, marketTrades:{}, position:{} };

function Label({ text }) {
  return <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3, paddingLeft:2 }}>{text}</div>;
}

function initState() {
  const raw  = lsLoadRaw();
  const meta = lsLoadMeta();
  if (!raw || !meta) return null;
  try {
    const p = parseP4Json(raw);
    return { parsed:p, sym:meta.sym||p.symbols[0]||"", brush:meta.brush||[0,50],
             fileName:meta.fileName||"restored", hiddenG:meta.hiddenG||DEFAULT_HIDDEN_G, hiddenL:meta.hiddenL||DEFAULT_HIDDEN_L };
  } catch { return null; }
}

export default function App() {
  const init = useMemo(initState, []);
  const [parsed,     setParsed]     = useState(init?.parsed   ?? EMPTY);
  const [sym,        setSym]        = useState(init?.sym      ?? "");
  const [brush,      setBrush]      = useState(init?.brush    ?? [0,50]);
  const [fileName,   setFileName]   = useState(init?.fileName ?? "no file loaded");
  const [hiddenG,    setHiddenG]    = useState(init?.hiddenG  ?? DEFAULT_HIDDEN_G);
  const [hiddenL,    setHiddenL]    = useState(init?.hiddenL  ?? DEFAULT_HIDDEN_L);
  const [fetching,   setFetching]   = useState(false);
  const [serverPath, setServerPath] = useState("");
  const [apiOnline,  setApiOnline]  = useState(false);
  const [apiFiles,   setApiFiles]   = useState([]);
  const [apiFile,    setApiFile]    = useState("");
  const [apiLoading, setApiLoading] = useState(false);

  const [settings,     setSettings]     = useState({ markerScale: 1, lineWidthScale: 1 });
  const [showSettings, setShowSettings] = useState(false);
  const [pinTs,        setPinTs]        = useState(null);

  const fileRef        = useRef(null);
  const rawRef         = useRef(init ? lsLoadRaw() : null);
  const globalChartRef = useRef(null);
  const dragRef        = useRef(null);
  const wasDragRef     = useRef(false);
  const vert  = useResizable(36, 15, 65, "v");
  const horiz = useResizable(62, 25, 85, "h");

  useEffect(function () {
    fetch(API + "/health", { signal: AbortSignal.timeout(1500) })
      .then(r => { if (r.ok) { setApiOnline(true); refreshApiFiles(); } })
      .catch(() => setApiOnline(false));
  }, []);

  function refreshApiFiles() {
    fetch(API + "/api/files").then(r => r.json()).then(files => {
      setApiFiles(files);
      if (files.length > 0) setApiFile(f => f || files[0].name);
    }).catch(() => {});
  }

  const persistMeta = useCallback(function (overrides) {
    lsSave(rawRef.current || "", Object.assign({ sym, brush, fileName, hiddenG, hiddenL }, overrides));
  }, [sym, brush, fileName, hiddenG, hiddenL]);

  function applyParsed(p, name, raw) {
    const first = p.symbols[0] || "";
    const b = [0, Math.min(50, (p.touch[first] || []).length - 1)];
    setParsed(p); setSym(first); setBrush(b); setFileName(name); setPinTs(null);
    setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
    rawRef.current = raw || null;
    lsSave(raw || "", { sym:first, brush:b, fileName:name, hiddenG:DEFAULT_HIDDEN_G, hiddenL:DEFAULT_HIDDEN_L });
  }

  function loadFromApi() {
    if (!apiFile) return;
    setApiLoading(true);
    fetch(`${API}/api/parse?file=${encodeURIComponent(apiFile)}`)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(p  => applyParsed(p, apiFile, null))
      .catch(err => alert("API error: " + err.message))
      .finally(() => setApiLoading(false));
  }

  function parseViaApi(rawText, name) {
    return fetch(`${API}/api/parse-raw`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: rawText,
    })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(p  => applyParsed(p, name, rawText));
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const txt = ev.target.result;
      const name = file.name;
      if (apiOnline) {
        parseViaApi(txt, name).catch(() => {
          try { applyParsed(parseP4Json(txt), name, txt); }
          catch (err) { alert("Parse failed: " + err.message); }
        });
      } else {
        try { applyParsed(parseP4Json(txt), name, txt); }
        catch (err) { alert("Parse failed: " + err.message); }
      }
    };
    reader.readAsText(file);
  }

  function loadFromServer() {
    const path = serverPath.trim(); if (!path) return;
    setFetching(true);
    fetch(path, { mode:"cors" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(txt => {
        if (!txt.trimStart().startsWith("{") && !txt.trimStart().startsWith("["))
          throw new Error("Got HTML instead of JSON. Check CORS.\n" + txt.slice(0, 60));
        const name = path.split("/").pop() || path;
        return apiOnline
          ? parseViaApi(txt, name).catch(() => applyParsed(parseP4Json(txt), name, txt))
          : applyParsed(parseP4Json(txt), name, txt);
      })
      .catch(err => alert("Fetch failed:\n" + err.message))
      .finally(() => setFetching(false));
  }

  function reset() {
    lsClear(); rawRef.current = null;
    setParsed(EMPTY); setSym(""); setBrush([0,50]);
    setFileName("no file loaded"); setServerPath("");
    setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
  }

  function toggleG(key) { const n = Object.assign({}, hiddenG, {[key]:!hiddenG[key]}); setHiddenG(n); persistMeta({hiddenG:n}); }
  function toggleL(key) { const n = Object.assign({}, hiddenL, {[key]:!hiddenL[key]}); setHiddenL(n); persistMeta({hiddenL:n}); }
  function changeSym(s) {
    const b = [0, Math.min(50, (parsed.touch[s]||[]).length-1)];
    setSym(s); setBrush(b); setPinTs(null); persistMeta({sym:s,brush:b});
  }
  const setBrushP = useCallback(valOrFn => setBrush(prev => {
    const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
    persistMeta({brush:next}); return next;
  }), [persistMeta]);

  function globalMouseDown(e) {
    if (!tsData.length || !globalChartRef.current) return;
    const rect = globalChartRef.current.getBoundingClientRect();
    // lo_off = chart margin.left(2) + yAxis width(50); hi_off = margin.right(48) + right yAxis width(38)
    const lo_off = 52, hi_off = 86, usable = rect.width - lo_off - hi_off;
    const toIdx = x => Math.max(0, Math.min(tsData.length-1, Math.round((x/usable)*(tsData.length-1))));
    const x0 = e.clientX - rect.left - lo_off;
    if (x0 < 0 || x0 > usable) return;
    dragRef.current = { startIdx: toIdx(x0) };
    wasDragRef.current = false;
    function onMove(ev) {
      if (!dragRef.current) return;
      const i2 = toIdx(ev.clientX - rect.left - lo_off);
      const lo = Math.min(dragRef.current.startIdx, i2), hi = Math.max(dragRef.current.startIdx, i2);
      if (hi > lo) { setBrushP([lo, hi]); wasDragRef.current = true; }
    }
    function onUp() { dragRef.current = null; window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  const onPinGlobal = useCallback(ts => { if (!wasDragRef.current) setPinTs(ts); }, []);
  const onPinLocal  = useCallback(ts => setPinTs(ts), []);

  const tsData  = parsed.touch[sym] || [];
  const safeEnd = Math.min(brush[1], tsData.length-1);
  const refArea = tsData.length && tsData[brush[0]] && tsData[safeEnd]
    ? [tsData[brush[0]].ts, tsData[safeEnd].ts] : null;
  const tsRange = refArea || [0, Infinity];

  const localParsed = useMemo(function () {
    const [lo, hi] = tsRange;
    const lp = {};
    for (const s of parsed.symbols) lp[s] = (parsed.position[s]||[]).filter(d=>d.ts>=lo&&d.ts<=hi);
    return {
      symbols: parsed.symbols,
      touch:      { [sym]: tsData.slice(brush[0], brush[1]+1) },
      placedBids: { [sym]: (parsed.placedBids[sym]||[]).filter(d=>d.ts>=lo&&d.ts<=hi) },
      placedAsks: { [sym]: (parsed.placedAsks[sym]||[]).filter(d=>d.ts>=lo&&d.ts<=hi) },
      fills:        { [sym]: (parsed.fills[sym]        ||[]).filter(d=>d.ts>=lo&&d.ts<=hi) },
      marketTrades: { [sym]: (parsed.marketTrades[sym] ||[]).filter(d=>d.ts>=lo&&d.ts<=hi) },
      position:     lp,
    };
  }, [parsed, sym, brush[0], brush[1]]); // eslint-disable-line

  const totalFills  = (parsed.fills[sym]     ||[]).length;
  const totalOrders = (parsed.placedBids[sym]||[]).length + (parsed.placedAsks[sym]||[]).length;
  const localLen    = (localParsed.touch[sym]||[]).length;
  const btn = { border:"none", borderRadius:3, padding:"5px 12px", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"inherit" };
  const inp = { background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"4px 8px", fontSize:10, fontFamily:"inherit", outline:"none" };

  function SettingsPanel() {
    return (
      <div style={{ position:"absolute", top:36, right:0, zIndex:300, background:"#0a1628", border:"1px solid #1e293b", borderRadius:6, padding:"14px 16px", minWidth:230, boxShadow:"0 8px 28px rgba(0,0,0,0.7)" }}>
        <div style={{ fontSize:9, color:"#475569", marginBottom:12, letterSpacing:"0.12em", textTransform:"uppercase" }}>Display Settings</div>
        {[
          { key:"markerScale",    label:"Marker size",   min:0.3, max:3 },
          { key:"lineWidthScale", label:"Line width",    min:0.3, max:3 },
        ].map(({ key, label, min, max }) => (
          <div key={key} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#64748b", marginBottom:4 }}>
              <span>{label}</span><span style={{ color:"#94a3b8" }}>{settings[key].toFixed(1)}×</span>
            </div>
            <input type="range" min={min} max={max} step="0.1" value={settings[key]}
              onChange={e => setSettings(s => ({ ...s, [key]: +e.target.value }))}
              style={{ width:"100%", accentColor:"#38bdf8", cursor:"pointer" }} />
          </div>
        ))}
        <button onClick={() => setSettings({ markerScale:1, lineWidthScale:1 })}
          style={{ ...btn, background:"#1e293b", color:"#64748b", fontSize:9, padding:"3px 10px", marginTop:2, width:"100%" }}>
          reset defaults
        </button>
      </div>
    );
  }

  return (
    <div style={{ background:"#020817", color:"#e2e8f0", height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'JetBrains Mono','Fira Code',monospace", overflow:"hidden" }}>

      <div style={{ padding:"6px 16px", borderBottom:"1px solid #0f172a", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#38bdf8", letterSpacing:"0.08em" }}>IMC PROSPERITY 4</span>
        <span style={{ fontSize:10, color:"#1e3a5f", letterSpacing:"0.15em" }}>visualizer</span>
        <div style={{ flex:1 }} />

        {/* Rust API */}
        {apiOnline ? (
          <>
            <span style={{ fontSize:8, color:"#22c55e", letterSpacing:"0.1em" }}>⬤ RUST</span>
            <select value={apiFile} onChange={e => setApiFile(e.target.value)} style={{ ...inp, width:200 }}>
              {apiFiles.map(f => <option key={f.name} value={f.name}>{f.name} ({f.size_kb} KB)</option>)}
            </select>
            <button onClick={loadFromApi} disabled={apiLoading||!apiFile}
              style={{ ...btn, background:"#22c55e", color:"#020817", opacity:apiLoading?0.5:1 }}>
              {apiLoading ? "Parsing…" : "Load (Rust)"}
            </button>
            <button onClick={refreshApiFiles} style={{ ...btn, background:"#134e4a", color:"#6ee7b7", padding:"5px 8px" }} title="Refresh">↺</button>
          </>
        ) : (
          <span style={{ fontSize:8, color:"#334155" }}>⬤ p4server offline — cargo run -- --log-dir ./submissions</span>
        )}

        <div style={{ width:1, height:16, background:"#1e293b" }} />

        {/* File picker */}
        <input ref={fileRef} type="file" accept=".json,.log,.txt" onChange={e=>loadFile(e.target.files?.[0])} style={{ display:"none" }} />
        <button onClick={()=>fileRef.current?.click()} style={{ ...btn, background:"#0ea5e9", color:"#020817" }}>Load File</button>

        {/* URL fetch */}
        <input value={serverPath} onChange={e=>setServerPath(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")loadFromServer();}}
          placeholder="or paste URL…" style={{ ...inp, width:160 }} />
        <button onClick={loadFromServer} disabled={fetching||!serverPath.trim()}
          style={{ ...btn, background:fetching?"#164e63":"#0284c7", color:"#e0f2fe", opacity:(!serverPath.trim()||fetching)?0.5:1 }}>
          {fetching?"Fetching…":"Fetch"}
        </button>

        <div style={{ width:1, height:16, background:"#1e293b" }} />
        <span style={{ fontSize:9, color:"#334155", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fileName}</span>

        {parsed.symbols.length > 0 && (
          <select value={sym} onChange={e=>changeSym(e.target.value)} style={inp}>
            {parsed.symbols.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        )}

        <span style={{ fontSize:9, color:"#1e3a5f" }}>{tsData.length}t &middot; {totalOrders}o &middot; {totalFills}f</span>
        <div style={{ position:"relative" }}>
          <button onClick={() => setShowSettings(s => !s)} title="Display settings"
            style={{ ...btn, background: showSettings ? "#1e3a5f" : "#0f172a", color: showSettings ? "#38bdf8" : "#475569", border:"1px solid #1e293b", fontSize:15, padding:"3px 9px", lineHeight:1 }}>⚙</button>
          {showSettings && <SettingsPanel />}
        </div>
        <button onClick={reset} style={{ ...btn, background:"#be123c", color:"#fff" }}>Reset</button>
      </div>

      <div ref={vert.ref} style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        <div style={{ height:vert.pct+"%", minHeight:0, display:"flex", flexDirection:"column", padding:"8px 16px 0" }}>
          <Label text={"GLOBAL — "+tsData.length+" ticks — position on right axis"} />
          <CustomLegend priceSeries={PRICE_SERIES} symbols={parsed.symbols} hidden={hiddenG} onToggle={toggleG} />
          <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"row" }}>
            <div ref={globalChartRef} onMouseDown={globalMouseDown}
              style={{ flex:1, minWidth:0, cursor:tsData.length?"crosshair":"default", userSelect:"none" }}>
              {sym
                ? <PriceChart sym={sym} parsedData={parsed} hidden={hiddenG} refArea={refArea} showPosSeries={true}
                    markerScale={settings.markerScale} lineWidthScale={settings.lineWidthScale}
                    pinTs={pinTs} onPin={onPinGlobal} />
                : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#1e3a5f", fontSize:11 }}>load a P4 JSON log to begin</div>
              }
            </div>
            <StatsPanel parsed={parsed} />
          </div>
          <RangeBar tsData={tsData} brush={brush} setBrush={setBrushP} />
        </div>

        <div onMouseDown={vert.onMouseDown}
          style={{ height:5, cursor:"ns-resize", background:"#0a1628", borderTop:"1px solid #1e293b", borderBottom:"1px solid #1e293b", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:32, height:2, background:"#334155", borderRadius:1 }} />
        </div>

        <div ref={horiz.ref} style={{ flex:1, minHeight:0, display:"flex", flexDirection:"row", overflow:"hidden" }}>

          <div style={{ width:horiz.pct+"%", minWidth:0, display:"flex", flexDirection:"column", padding:"8px 0 8px 16px" }}>
            <Label text={"LOCAL — ticks "+brush[0]+"–"+brush[1]+" ("+localLen+" pts)"} />
            <CustomLegend priceSeries={PRICE_SERIES} symbols={parsed.symbols} hidden={hiddenL} onToggle={toggleL} />
            <div style={{ flex:1, minHeight:0 }}>
              {sym && <PriceChart sym={sym} parsedData={localParsed} hidden={hiddenL} refArea={null} showPosSeries={true} isLocal={true}
                markerScale={settings.markerScale} lineWidthScale={settings.lineWidthScale}
                pinTs={pinTs} onPin={onPinLocal} />}
            </div>
          </div>

          <div onMouseDown={horiz.onMouseDown}
            style={{ width:5, cursor:"ew-resize", background:"#0a1628", borderLeft:"1px solid #1e293b", borderRight:"1px solid #1e293b", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:2, height:32, background:"#334155", borderRadius:1 }} />
          </div>

          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", padding:"8px 16px 8px 0" }}>
            <Label text={"DATA TABLE — "+sym+" — ts "+tsRange[0]+" to "+tsRange[1]} />
            <div style={{ flex:1, minHeight:0, border:"1px solid #0f172a", borderRadius:3, overflow:"hidden" }}>
              {sym ? <DataTable sym={sym} parsedData={parsed} tsRange={tsRange} pinTs={pinTs} />
                   : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#1e3a5f", fontSize:11 }}>no data</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}