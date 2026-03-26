import { useMemo } from "react";
import { posColor } from "../seriesConfig.js";

function V({ v }) {
  const n = +v;
  const color = n > 0 ? "#22c55e" : n < 0 ? "#f43f5e" : "#64748b";
  return <span style={{ color, fontVariantNumeric:"tabular-nums" }}>{Math.abs(n).toFixed(1)}</span>;
}

export function StatsPanel({ parsed }) {
  const stats = useMemo(function () {
    return parsed.symbols.map(function (sym, i) {
      const pts   = parsed.touch[sym] || [];
      const fills = parsed.fills[sym]  || [];
      const pnlArr = pts.map(p => p.pnl != null ? p.pnl : 0);
      const finalPnl = pnlArr.length ? pnlArr[pnlArr.length - 1] : 0;

      let maxDD = 0, peak = -Infinity;
      for (const v of pnlArr) {
        if (v > peak) peak = v;
        const dd = peak - v;
        if (dd > maxDD) maxDD = dd;
      }

      const changes = [];
      for (let j = 1; j < pnlArr.length; j++) changes.push(pnlArr[j] - pnlArr[j-1]);
      const mean = changes.length ? changes.reduce((a,b) => a+b, 0) / changes.length : 0;
      const variance = changes.length ? changes.reduce((a,b) => a+(b-mean)**2, 0) / changes.length : 0;
      const stdDev = Math.sqrt(variance);
      const fillRatio = pts.length ? (fills.length / pts.length * 100) : 0;
      const buyF  = fills.filter(f => f.side === "buy").length;
      const sellF = fills.filter(f => f.side === "sell").length;

      return { sym, finalPnl, maxDD, stdDev, fillRatio, buyF, sellF, color: posColor(i) };
    });
  }, [parsed]);

  const totalPnl = stats.reduce((a, b) => a + b.finalPnl, 0);
  const totalDD  = stats.reduce((a, b) => a + b.maxDD, 0);

  const row = { display:"flex", justifyContent:"space-between", padding:"2px 0", borderBottom:"1px solid #0f172a" };
  const k   = { color:"#475569", fontSize:9 };
  const v   = { fontSize:9, fontVariantNumeric:"tabular-nums" };

  return (
    <div style={{ width:168, flexShrink:0, borderLeft:"1px solid #0f172a", padding:"6px 8px", overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
      <div>
        <div style={{ fontSize:8, color:"#334155", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4 }}>portfolio</div>
        <div style={row}><span style={k}>total pnl</span>      <span style={v}><V v={totalPnl} /></span></div>
        <div style={row}><span style={k}>total drawdown</span> <span style={v}><V v={-totalDD} /></span></div>
      </div>

      {stats.map(s => (
        <div key={s.sym}>
          <div style={{ fontSize:8, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3, color: s.color }}>{s.sym}</div>
          <div style={row}><span style={k}>pnl</span>          <span style={v}><V v={s.finalPnl} /></span></div>
          <div style={row}><span style={k}>drawdown</span>     <span style={v}><V v={-s.maxDD} /></span></div>
          <div style={row}><span style={k}>pnl σ / tick</span> <span style={v}>{s.stdDev.toFixed(2)}</span></div>
          <div style={row}><span style={k}>fill rate</span>    <span style={{ fontSize:9, color:"#94a3b8" }}>{s.fillRatio.toFixed(1)}%</span></div>
          <div style={row}><span style={k}>B / S fills</span>
            <span style={{ fontSize:9 }}>
              <span style={{ color:"#22c55e" }}>{s.buyF}</span>
              <span style={{ color:"#475569" }}>/</span>
              <span style={{ color:"#fb923c" }}>{s.sellF}</span>
            </span>
          </div>
        </div>
      ))}

      {!stats.length && <div style={{ color:"#1e3a5f", fontSize:10, textAlign:"center", marginTop:20 }}>no data</div>}
    </div>
  );
}