import { useState, useRef } from "react";

export function RangeBar({ tsData, brush, setBrush }) {
  const trackRef = useRef(null);
  const n = tsData.length - 1;

  function pct(i) { return n > 0 ? (i / n) * 100 : 0; }

  function idxFromX(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(((clientX - rect.left) / rect.width) * n)));
  }

  function makeDown(handle) {
    return function (e) {
      e.preventDefault();
      function mv(ev) {
        const idx = idxFromX(ev.clientX);
        setBrush(prev => handle === "lo" ? [Math.min(idx, prev[1]-1), prev[1]] : [prev[0], Math.max(idx, prev[0]+1)]);
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv);
      window.addEventListener("mouseup", up);
    };
  }

  function tsAt(i) { const d = tsData[Math.max(0, Math.min(i, n))]; return d ? String(d.ts) : ""; }

  const [loT, setLoT] = useState(() => tsAt(brush[0]));
  const [hiT, setHiT] = useState(() => tsAt(brush[1]));
  const prev = useRef(brush);
  if (prev.current !== brush) { prev.current = brush; setLoT(tsAt(brush[0])); setHiT(tsAt(brush[1])); }

  function commit(side, val) {
    const ts = Number(val);
    if (isNaN(ts) || !tsData.length) return;
    let best = 0, bd = Infinity;
    for (let i = 0; i < tsData.length; i++) {
      const d = Math.abs(tsData[i].ts - ts);
      if (d < bd) { bd = d; best = i; }
    }
    setBrush(prev => side === "lo" ? [Math.min(best, prev[1]-1), prev[1]] : [prev[0], Math.max(best, prev[0]+1)]);
  }

  const inp = { background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"3px 6px", fontSize:10, width:72, fontFamily:"inherit", outline:"none", textAlign:"center" };
  const hdl = p => ({ position:"absolute", top:"50%", left:p+"%", transform:"translate(-50%,-50%)", width:12, height:12, borderRadius:"50%", background:"#f43f5e", border:"2px solid #0f172a", cursor:"ew-resize", zIndex:2, boxSizing:"border-box", boxShadow:"0 0 0 3px rgba(244,63,94,0.25)" });

  return (
    <div style={{ marginBottom:10, paddingLeft:2 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input value={loT} onChange={e => setLoT(e.target.value)}
          onBlur={e => commit("lo", e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit("lo", loT); }}
          style={inp} />
        <div ref={trackRef} style={{ flex:1, position:"relative", height:18, cursor:"crosshair" }}>
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:0, right:0, height:3, background:"#1e293b", borderRadius:2 }} />
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:pct(brush[0])+"%", width:(pct(brush[1])-pct(brush[0]))+"%", height:3, background:"#f43f5e", borderRadius:2 }} />
          <div onMouseDown={makeDown("lo")} style={hdl(pct(brush[0]))} />
          <div onMouseDown={makeDown("hi")} style={hdl(pct(brush[1]))} />
        </div>
        <input value={hiT} onChange={e => setHiT(e.target.value)}
          onBlur={e => commit("hi", e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit("hi", hiT); }}
          style={inp} />
      </div>
    </div>
  );
}