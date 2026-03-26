import { isHidden, posColor, pnlColor } from "../seriesConfig.js";

function LegendItem({ itemKey, color, label, shape, off, onToggle }) {
  return (
    <div onClick={() => onToggle(itemKey)}
      style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", opacity: off ? 0.3 : 1, userSelect:"none" }}>
      {shape === "circle"
        ? <svg width={16} height={16}><circle cx={8} cy={8} r={4} fill={color} /><circle cx={8} cy={8} r={7} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.5} /></svg>
        : shape === "tri-up"
          ? <svg width={16} height={16}><polygon points="8,2 2,14 14,14" fill={color} /></svg>
          : shape === "tri-down"
            ? <svg width={16} height={16}><polygon points="8,14 2,2 14,2" fill={color} /></svg>
            : <svg width={18} height={8}><line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={2} strokeDasharray={shape || undefined} /></svg>
      }
      <span style={{ fontSize:9, color:"#64748b" }}>{label}</span>
    </div>
  );
}

export function CustomLegend({ priceSeries, symbols, hidden, onToggle }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 10px", padding:"2px 0 4px 4px" }}>
      {priceSeries.map(s => (
        <LegendItem key={s.key} itemKey={s.key} color={s.color} label={s.label}
          shape={s.type === "scatter" ? (s.shape || "circle") : (s.dash || "line")}
          off={isHidden(hidden, s.key)} onToggle={onToggle} />
      ))}
      {symbols.map((sym, i) => (
        <LegendItem key={"pos_"+sym} itemKey={"pos_"+sym} color={posColor(i)} label={"pos "+sym}
          shape="line" off={isHidden(hidden, "pos_"+sym)} onToggle={onToggle} />
      ))}
      {symbols.map((sym, i) => (
        <LegendItem key={"pnl_"+sym} itemKey={"pnl_"+sym} color={pnlColor(i)} label={"pnl "+sym}
          shape="line" off={isHidden(hidden, "pnl_"+sym, true)} onToggle={onToggle} />
      ))}
    </div>
  );
}