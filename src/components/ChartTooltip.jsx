export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  const seen = new Set();
  const rows = [];
  for (const e of payload) {
    const k = e.name || e.dataKey;
    if (!k || seen.has(k) || e.value == null) continue;
    seen.add(k);
    rows.push({
      k,
      v: typeof e.value === "number" ? e.value.toFixed(1) : e.value,
      size: e.payload?.size,
    });
  }
  if (!rows.length) return null;

  const vols = [];
  if (pt) {
    for (const [k, v] of [["bv1",pt.bv1],["bv2",pt.bv2],["bv3",pt.bv3],["av1",pt.av1],["av2",pt.av2],["av3",pt.av3]])
      if (v != null && v !== 0) vols.push({ k, v });
  }

  return (
    <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:4, padding:"4px 8px", fontSize:10, maxWidth:180 }}>
      <div style={{ color:"#475569", marginBottom:2, fontSize:9 }}>ts: {label}</div>
      {rows.map(r => (
        <div key={r.k} style={{ display:"flex", justifyContent:"space-between", gap:8, color:"#cbd5e1" }}>
          <span style={{ color:"#64748b" }}>{r.k}</span>
          <span>{r.v}{r.size ? <span style={{ color:"#475569" }}> ×{r.size}</span> : null}</span>
        </div>
      ))}
      {vols.length > 0 && (
        <div style={{ borderTop:"1px solid #1e293b", marginTop:3, paddingTop:3 }}>
          <div style={{ color:"#334155", fontSize:8, marginBottom:2 }}>volumes</div>
          {vols.map(({ k, v }) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
              <span style={{ color:"#475569", fontSize:9 }}>{k}</span>
              <span style={{ color:"#94a3b8", fontSize:9 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}