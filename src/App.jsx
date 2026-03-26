import { useState, useMemo, useRef, useCallback } from "react";
import { parseP4Json } from "./parser.js";
import { PRICE_SERIES, DEFAULT_HIDDEN_G, DEFAULT_HIDDEN_L } from "./seriesConfig.js";
import { lsSave, lsLoadRaw, lsLoadMeta, lsClear } from "./persistence.js";
import { useResizable } from "./hooks/useResizable.js";
import { PriceChart }   from "./components/PriceChart.jsx";
import { CustomLegend } from "./components/CustomLegend.jsx";
import { DataTable }    from "./components/DataTable.jsx";
import { RangeBar }     from "./components/RangeBar.jsx";
import { StatsPanel }   from "./components/StatsPanel.jsx";

const EMPTY = { symbols:[], touch:{}, placedBids:{}, placedAsks:{}, fills:{}, position:{} };

function Label({ text }) {
  return <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3, paddingLeft:2 }}>{text}</div>;
}

function initState() {
  const raw  = lsLoadRaw();
  const meta = lsLoadMeta();
  if (!raw || !meta) return null;
  try {
    const p = parseP4Json(raw);
    return {
      parsed:   p,
      sym:      meta.sym      || p.symbols[0] || "",
      brush:    meta.brush    || [0, 50],
      fileName: meta.fileName || "restored",
      hiddenG:  meta.hiddenG  || DEFAULT_HIDDEN_G,
      hiddenL:  meta.hiddenL  || DEFAULT_HIDDEN_L,
    };
  } catch (e) { return null; }
}

export default function App() {
  const init = useMemo(initState, []);

  const [parsed,     setParsed]     = useState(init ? init.parsed   : EMPTY);
  const [sym,        setSym]        = useState(init ? init.sym      : "");
  const [brush,      setBrush]      = useState(init ? init.brush    : [0, 50]);
  const [fileName,   setFileName]   = useState(init ? init.fileName : "no file loaded");
  const [hiddenG,    setHiddenG]    = useState(init ? init.hiddenG  : DEFAULT_HIDDEN_G);
  const [hiddenL,    setHiddenL]    = useState(init ? init.hiddenL  : DEFAULT_HIDDEN_L);
  const [serverPath, setServerPath] = useState("");
  const [fetching,   setFetching]   = useState(false);

  const fileRef        = useRef(null);
  const rawRef         = useRef(init ? lsLoadRaw() : null);
  const globalChartRef = useRef(null);
  const dragRef        = useRef(null);

  const vert  = useResizable(36, 15, 65);
  const horiz = useResizable(62, 25, 85);

  const persistMeta = useCallback(function (overrides) {
    const meta = Object.assign({ sym, brush, fileName, hiddenG, hiddenL }, overrides);
    lsSave(rawRef.current || "", meta);
  }, [sym, brush, fileName, hiddenG, hiddenL]);

  function applyRaw(rawText, name) {
    const p = parseP4Json(rawText);
    rawRef.current = rawText;
    const first = p.symbols[0] || "";
    const tLen  = first ? (p.touch[first] || []).length : 0;
    const b = [0, Math.min(50, tLen - 1)];
    setParsed(p); setSym(first); setBrush(b); setFileName(name);
    setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
    lsSave(rawText, { sym: first, brush: b, fileName: name, hiddenG: DEFAULT_HIDDEN_G, hiddenL: DEFAULT_HIDDEN_L });
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try { applyRaw(ev.target.result, file.name); }
      catch (err) { alert("Failed to parse: " + err.message); }
    };
    reader.readAsText(file);
  }

  function loadFromServer() {
    const path = serverPath.trim();
    if (!path) return;
    setFetching(true);
    fetch(path, { mode:"cors" })
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
        return r.text();
      })
      .then(txt => {
        const t = txt.trimStart();
        if (!t.startsWith("{") && !t.startsWith("["))
          throw new Error(
            "Server returned HTML instead of JSON.\n\n" +
            "1. Wrong path — check it exists\n" +
            "2. CORS blocked — add Access-Control-Allow-Origin: *\n\n" +
            "Tip: python -m http.server 8000 works with no extra config.\n\n" +
            "Got: " + t.slice(0, 60) + "…"
          );
        applyRaw(txt, path.split("/").pop() || path);
      })
      .catch(err => alert("Fetch failed:\n\n" + err.message))
      .finally(() => setFetching(false));
  }

  function reset() {
    lsClear(); rawRef.current = null;
    setParsed(EMPTY); setSym(""); setBrush([0, 50]);
    setFileName("no file loaded"); setServerPath("");
    setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
  }

  function toggleG(key) { const next = Object.assign({}, hiddenG, { [key]: !hiddenG[key] }); setHiddenG(next); persistMeta({ hiddenG: next }); }
  function toggleL(key) { const next = Object.assign({}, hiddenL, { [key]: !hiddenL[key] }); setHiddenL(next); persistMeta({ hiddenL: next }); }

  function changeSym(s) {
    const tLen = (parsed.touch[s] || []).length;
    const b = [0, Math.min(50, tLen - 1)];
    setSym(s); setBrush(b); persistMeta({ sym: s, brush: b });
  }

  const setBrushP = useCallback(function (valOrFn) {
    setBrush(function (prev) {
      const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      persistMeta({ brush: next });
      return next;
    });
  }, [persistMeta]);

  // drag-to-select on global chart
  function globalMouseDown(e) {
    if (!tsData.length || !globalChartRef.current) return;
    const rect = globalChartRef.current.getBoundingClientRect();
    const leftOff = 66, rightOff = 58;
    const usable = rect.width - leftOff - rightOff;
    const x = e.clientX - rect.left - leftOff;
    if (x < 0 || x > usable) return;
    const idx = Math.max(0, Math.min(tsData.length-1, Math.round((x / usable) * (tsData.length-1))));
    dragRef.current = { startIdx: idx };
    function onMove(ev) {
      if (!dragRef.current) return;
      const x2   = ev.clientX - rect.left - leftOff;
      const idx2 = Math.max(0, Math.min(tsData.length-1, Math.round((x2 / usable) * (tsData.length-1))));
      const lo = Math.min(dragRef.current.startIdx, idx2);
      const hi = Math.max(dragRef.current.startIdx, idx2);
      if (hi > lo) setBrushP([lo, hi]);
    }
    function onUp() { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const tsData  = parsed.touch[sym] || [];
  const safeEnd = Math.min(brush[1], tsData.length - 1);
  const refArea = tsData.length && tsData[brush[0]] && tsData[safeEnd]
    ? [tsData[brush[0]].ts, tsData[safeEnd].ts] : null;
  const tsRange = refArea || [0, Infinity];

  const localParsed = useMemo(function () {
    const [lo, hi] = tsRange;
    const localPos = {};
    for (const s of parsed.symbols)
      localPos[s] = (parsed.position[s] || []).filter(d => d.ts >= lo && d.ts <= hi);
    return {
      symbols:    parsed.symbols,
      touch:      { [sym]: tsData.slice(brush[0], brush[1] + 1) },
      placedBids: { [sym]: (parsed.placedBids[sym] || []).filter(d => d.ts >= lo && d.ts <= hi) },
      placedAsks: { [sym]: (parsed.placedAsks[sym] || []).filter(d => d.ts >= lo && d.ts <= hi) },
      fills:      { [sym]: (parsed.fills[sym]      || []).filter(d => d.ts >= lo && d.ts <= hi) },
      position:   localPos,
    };
  }, [parsed, sym, brush[0], brush[1]]); // eslint-disable-line

  const totalFills   = (parsed.fills[sym]     || []).length;
  const totalOrders  = (parsed.placedBids[sym] || []).length + (parsed.placedAsks[sym] || []).length;
  const localTouchLen = (localParsed.touch[sym] || []).length;

  const btn = { border:"none", borderRadius:3, padding:"5px 12px", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"inherit" };

  return (
    <div style={{ background:"#020817", color:"#e2e8f0", height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'JetBrains Mono','Fira Code',monospace", overflow:"hidden" }}>

      {/* ── top bar ── */}
      <div style={{ padding:"6px 16px", borderBottom:"1px solid #0f172a", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#38bdf8", letterSpacing:"0.08em" }}>IMC PROSPERITY 4</span>
        <span style={{ fontSize:10, color:"#1e3a5f", letterSpacing:"0.15em" }}>visualizer</span>
        <div style={{ flex:1 }} />

        <input ref={fileRef} type="file" accept=".json,.log,.txt"
          onChange={e => loadFile(e.target.files?.[0])} style={{ display:"none" }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...btn, background:"#0ea5e9", color:"#020817" }}>Load File</button>

        <input value={serverPath} onChange={e => setServerPath(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") loadFromServer(); }}
          placeholder="or paste server path / URL…"
          style={{ background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"4px 8px", fontSize:10, fontFamily:"inherit", outline:"none", width:200 }} />
        <button onClick={loadFromServer} disabled={fetching || !serverPath.trim()}
          style={{ ...btn, background: fetching ? "#164e63" : "#0284c7", color:"#e0f2fe", opacity: (!serverPath.trim() || fetching) ? 0.5 : 1 }}>
          {fetching ? "Fetching…" : "Fetch"}
        </button>

        <div style={{ width:1, height:16, background:"#1e293b" }} />
        <span style={{ fontSize:9, color:"#334155", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fileName}</span>

        {parsed.symbols.length > 0 && (
          <select value={sym} onChange={e => changeSym(e.target.value)}
            style={{ background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"4px 8px", fontSize:10, fontFamily:"inherit", outline:"none" }}>
            {parsed.symbols.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        <span style={{ fontSize:9, color:"#1e3a5f" }}>{tsData.length} ticks &middot; {totalOrders} orders &middot; {totalFills} fills</span>
        <button onClick={reset} style={{ ...btn, background:"#be123c", color:"#fff" }}>Reset</button>
      </div>

      {/* ── body ── */}
      <div ref={vert.ref} style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* global */}
        <div style={{ height:vert.pct+"%", minHeight:0, display:"flex", flexDirection:"column", padding:"8px 16px 0" }}>
          <Label text={"GLOBAL — " + tsData.length + " ticks — position on right axis"} />
          <CustomLegend priceSeries={PRICE_SERIES} symbols={parsed.symbols} hidden={hiddenG} onToggle={toggleG} />
          <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"row" }}>
            <div ref={globalChartRef} onMouseDown={globalMouseDown}
              style={{ flex:1, minWidth:0, cursor: tsData.length ? "crosshair" : "default", userSelect:"none" }}>
              {sym
                ? <PriceChart sym={sym} parsedData={parsed} hidden={hiddenG} refArea={refArea} showPosSeries={true} />
                : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#1e3a5f", fontSize:11 }}>load a P4 JSON log to begin</div>
              }
            </div>
            <StatsPanel parsed={parsed} />
          </div>
          <RangeBar tsData={tsData} brush={brush} setBrush={setBrushP} />
        </div>

        {/* vert resize handle */}
        <div onMouseDown={vert.onMouseDown}
          style={{ height:5, cursor:"ns-resize", background:"#0a1628", borderTop:"1px solid #1e293b", borderBottom:"1px solid #1e293b", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:32, height:2, background:"#334155", borderRadius:1 }} />
        </div>

        {/* local row */}
        <div ref={horiz.ref} style={{ flex:1, minHeight:0, display:"flex", flexDirection:"row", overflow:"hidden" }}>

          {/* local chart */}
          <div style={{ width:horiz.pct+"%", minWidth:0, display:"flex", flexDirection:"column", padding:"8px 0 8px 16px" }}>
            <Label text={"LOCAL — ticks " + brush[0] + "–" + brush[1] + " (" + localTouchLen + " pts)"} />
            <CustomLegend priceSeries={PRICE_SERIES} symbols={parsed.symbols} hidden={hiddenL} onToggle={toggleL} />
            <div style={{ flex:1, minHeight:0 }}>
              {sym && <PriceChart sym={sym} parsedData={localParsed} hidden={hiddenL} refArea={null} showPosSeries={true} isLocal={true} />}
            </div>
          </div>

          {/* horiz resize handle */}
          <div onMouseDown={horiz.onMouseDown}
            style={{ width:5, cursor:"ew-resize", background:"#0a1628", borderLeft:"1px solid #1e293b", borderRight:"1px solid #1e293b", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:2, height:32, background:"#334155", borderRadius:1 }} />
          </div>

          {/* table */}
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", padding:"8px 16px 8px 0" }}>
            <Label text={"DATA TABLE — " + sym + " — ts " + tsRange[0] + " to " + tsRange[1]} />
            <div style={{ flex:1, minHeight:0, border:"1px solid #0f172a", borderRadius:3, overflow:"hidden" }}>
              {sym
                ? <DataTable sym={sym} parsedData={parsed} tsRange={tsRange} />
                : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#1e3a5f", fontSize:11 }}>no data</div>
              }
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}