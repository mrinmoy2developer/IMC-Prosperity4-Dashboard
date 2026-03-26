import { useMemo } from "react";

export function DataTable({ sym, parsedData, tsRange }) {
  const [lo, hi] = tsRange || [0, Infinity];
  const touch      = useMemo(() => (parsedData.touch[sym]      || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const placedBids = useMemo(() => (parsedData.placedBids[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const placedAsks = useMemo(() => (parsedData.placedAsks[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const fills      = useMemo(() => (parsedData.fills[sym]      || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const position   = useMemo(() => (parsedData.position[sym]   || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);

  const rows = useMemo(function () {
    const posMap = {}, pbMap = {}, paMap = {}, fillsMap = {};
    for (const p of position)   { posMap[p.ts] = p.pos; }
    for (const b of placedBids) { if (!pbMap[b.ts]) pbMap[b.ts] = []; pbMap[b.ts].push(b.price+"x"+b.size); }
    for (const a of placedAsks) { if (!paMap[a.ts]) paMap[a.ts] = []; paMap[a.ts].push(a.price+"x"+a.size); }
    for (const f of fills)      { if (!fillsMap[f.ts]) fillsMap[f.ts] = []; fillsMap[f.ts].push(f); }
    return touch.map(d => ({
      ts:    d.ts,
      mid:   d.mid,   bid1: d.bid1, bv1: d.bv1, bid2: d.bid2, bv2: d.bv2,
      ask1:  d.ask1,  av1:  d.av1,  ask2: d.ask2, av2: d.av2,
      movAvg: d.movAvg,
      pos:   posMap[d.ts] != null ? posMap[d.ts] : "",
      pBid:  (pbMap[d.ts]    || []).join(" "),
      pAsk:  (paMap[d.ts]    || []).join(" "),
      fills: (fillsMap[d.ts] || []).map(f => (f.side==="buy"?"B":"S")+f.price+"×"+f.size).join(" "),
    }));
  }, [touch, placedBids, placedAsks, fills, position]);

  const th = { padding:"3px 6px", textAlign:"right", fontSize:9, color:"#475569", letterSpacing:"0.08em", borderBottom:"1px solid #1e293b", whiteSpace:"nowrap", position:"sticky", top:0, background:"#0a1628" };
  const td = color => ({ padding:"2px 6px", fontSize:9, textAlign:"right", whiteSpace:"nowrap", borderBottom:"1px solid #0f172a", color: color || "#94a3b8", fontVariantNumeric:"tabular-nums" });

  const cols = [
    { h:"ts",        get: r => r.ts,                                      color:"#475569" },
    { h:"mid",       get: r => r.mid   != null ? r.mid.toFixed(1)  : "", color:"#60a5fa" },
    { h:"bid1",      get: r => r.bid1  != null ? r.bid1.toFixed(1) : "", color:"#34d399" },
    { h:"bvol1",     get: r => r.bv1   != null ? r.bv1             : "", color:"#34d39988" },
    { h:"bid2",      get: r => r.bid2  != null ? r.bid2.toFixed(1) : "", color:"#34d39966" },
    { h:"bvol2",     get: r => r.bv2   != null ? r.bv2             : "", color:"#34d39955" },
    { h:"ask1",      get: r => r.ask1  != null ? r.ask1.toFixed(1) : "", color:"#fb7185" },
    { h:"avol1",     get: r => r.av1   != null ? r.av1             : "", color:"#fb718588" },
    { h:"ask2",      get: r => r.ask2  != null ? r.ask2.toFixed(1) : "", color:"#fb718566" },
    { h:"avol2",     get: r => r.av2   != null ? r.av2             : "", color:"#fb718555" },
    { h:"mavg",      get: r => r.movAvg != null ? r.movAvg.toFixed(1) : "", color:"#f97316" },
    { h:"pos",       get: r => r.pos,  color:"#a78bfa" },
    { h:"my bids",   get: r => r.pBid, color:"#4ade80", title:"My placed buy orders (price×qty)" },
    { h:"my asks",   get: r => r.pAsk, color:"#f87171", title:"My placed sell orders (price×qty)" },
    { h:"my trades", get: r => r.fills, color:"#e2e8f0", title:"My fills (B/S price×qty)" },
  ];

  return (
    <div style={{ height:"100%", overflowY:"auto", overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", tableLayout:"auto", minWidth:"100%" }}>
        <thead>
          <tr>{cols.map(c => <th key={c.h} style={th} title={c.title || ""}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: r.fills.length ? "rgba(163,230,53,0.06)" : "transparent" }}>
              {cols.map(c => <td key={c.h} style={td(c.color)}>{c.get(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}