import { useState, useMemo, useRef, useCallback, memo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceArea, ResponsiveContainer
} from "recharts";

// =============================================================================
// P4 JSON PARSER
// Mirrors load_states() from the Python notebook.
// =============================================================================
function parseP4Json(text) {
  const raw = JSON.parse(text);
  const out = {
    symbols: [],
    touch:       {},
    placedBids:  {},
    placedAsks:  {},
    fills:       {},
    position:    {},
  };
  const symSet = new Set();
  const obMap  = {};  // ts -> sym -> { bid2,bid3,ask2,ask3 }

  // ---- activitiesLog CSV -------------------------------------------------------
  if (raw.activitiesLog) {
    const lines = raw.activitiesLog.trim().split("\n");
    const hdr = lines[0].split(";").map(h => h.trim().toLowerCase());
    const col = k => hdr.indexOf(k);
    const iTs=col("timestamp"), iProd=col("product"), iMid=col("mid_price"), iPnl=col("profit_and_loss");
    const iBid1=col("bid_price_1"), iBid2=col("bid_price_2"), iBid3=col("bid_price_3");
    const iAsk1=col("ask_price_1"), iAsk2=col("ask_price_2"), iAsk3=col("ask_price_3");
    const iBv1=col("bid_volume_1"), iBv2=col("bid_volume_2"), iBv3=col("bid_volume_3");
    const iAv1=col("ask_volume_1"), iAv2=col("ask_volume_2"), iAv3=col("ask_volume_3");
    function num(p, i) { if (i < 0 || i >= p.length) return null; const v = p[i].trim(); return v === "" || v === "nan" ? null : (+v || null); }
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(";");
      if (p.length < 4) continue;
      const ts = +p[iTs], sym = p[iProd] && p[iProd].trim();
      if (isNaN(ts) || !sym) continue;
      symSet.add(sym);
      if (!out.touch[sym]) out.touch[sym] = [];
      out.touch[sym].push({
        ts,
        mid:  num(p, iMid),
        pnl:  iPnl >= 0 ? (parseFloat(p[iPnl]) || 0) : 0,
        bid1: num(p, iBid1), bid2: num(p, iBid2), bid3: num(p, iBid3),
        ask1: num(p, iAsk1), ask2: num(p, iAsk2), ask3: num(p, iAsk3),
        bv1:  num(p, iBv1),  bv2:  num(p, iBv2),  bv3:  num(p, iBv3),
        av1:  num(p, iAv1),  av2:  num(p, iAv2),  av3:  num(p, iAv3),
      });
    }
  }

  // ---- lambdaLog: placed orders, position, orderbook depth --------------------
  if (raw.logs) {
    for (const log of raw.logs) {
      if (!log.lambdaLog) continue;
      let d;
      try { d = JSON.parse(log.lambdaLog); } catch (e) { continue; }
      const state = d[0];
      if (!Array.isArray(state)) continue;
      const time   = state[0];
      const orders = d[1] || [];
      const posMap = (typeof state[6] === "object" && !Array.isArray(state[6])) ? state[6] : {};
      const obBook = (typeof state[3] === "object" && !Array.isArray(state[3])) ? state[3] : {};

      // placed orders
      for (const o of orders) {
        const sym = o[0]; symSet.add(sym);
        if (o[2] < 0) { if (!out.placedAsks[sym]) out.placedAsks[sym]=[]; out.placedAsks[sym].push({ ts:time, price:o[1], size:Math.abs(o[2]) }); }
        else           { if (!out.placedBids[sym]) out.placedBids[sym]=[]; out.placedBids[sym].push({ ts:time, price:o[1], size:o[2] }); }
      }

      // position
      for (const [sym, pos] of Object.entries(posMap)) {
        symSet.add(sym);
        if (!out.position[sym]) out.position[sym] = [];
        out.position[sym].push({ ts: time, pos: +pos });
      }

      // orderbook depth L2/L3 from state[3]
      for (const [sym, sides] of Object.entries(obBook)) {
        symSet.add(sym);
        if (!Array.isArray(sides) || sides.length < 2) continue;
        const bidObj = sides[0] || {}, askObj = sides[1] || {};
        const bidPrices = Object.keys(bidObj).map(Number).sort((a,b) => b-a); // desc
        const askPrices = Object.keys(askObj).map(Number).sort((a,b) => a-b); // asc
        if (!obMap[time]) obMap[time] = {};
        obMap[time][sym] = {
          bid2: bidPrices[1] ?? null, bid3: bidPrices[2] ?? null,
          ask2: askPrices[1] ?? null, ask3: askPrices[2] ?? null,
        };
      }
    }
  }

  // ---- tradeHistory -----------------------------------------------------------
  if (raw.tradeHistory) {
    for (const t of raw.tradeHistory) {
      const sym = t.symbol; symSet.add(sym);
      if (!out.fills[sym]) out.fills[sym] = [];
      out.fills[sym].push({ ts: t.timestamp, price: +t.price, size: +t.quantity, side: t.buyer === "SUBMISSION" ? "buy" : "sell" });
    }
  }

  // ---- merge obMap depth into touch, fill nulls from activitiesLog ------------
  for (const sym of symSet) {
    const pts = out.touch[sym] || [];
    for (const pt of pts) {
      const ob = obMap[pt.ts] && obMap[pt.ts][sym];
      if (ob) {
        if (pt.bid2 == null) pt.bid2 = ob.bid2;
        if (pt.bid3 == null) pt.bid3 = ob.bid3;
        if (pt.ask2 == null) pt.ask2 = ob.ask2;
        if (pt.ask3 == null) pt.ask3 = ob.ask3;
      }
    }
  }

  // ---- moving average ---------------------------------------------------------
  const W = 50;
  for (const sym of symSet) {
    const pts = out.touch[sym] || [];
    for (let i = 0; i < pts.length; i++) {
      const slice = pts.slice(Math.max(0,i-W+1),i+1).map(p=>p.mid).filter(v=>v!=null);
      pts[i].movAvg = slice.length ? +(slice.reduce((a,b)=>a+b,0)/slice.length).toFixed(2) : null;
    }
  }

  // ---- seed position at ts=0 so no gap at start -------------------------------
  const minTs = Math.min(...[...symSet].flatMap(s => (out.touch[s]||[]).map(p=>p.ts)).filter(v=>!isNaN(v)));
  for (const sym of symSet) {
    if (!out.position[sym]) out.position[sym] = [];
    const pos = out.position[sym];
    // prepend zero if first entry isn't at the very start
    if (!pos.length || pos[0].ts > (isFinite(minTs) ? minTs : 0)) {
      pos.unshift({ ts: isFinite(minTs) ? minTs : 0, pos: 0 });
    }
  }

  out.symbols = [...symSet].sort();
  return out;
}

// =============================================================================
// SERIES CONFIG  -- price-axis series (position lines are dynamic per symbol)
// =============================================================================
const PRICE_SERIES = [
  { key: "mid",       label: "mid",        color: "#60a5fa", type: "line",    dash: undefined },
  { key: "movAvg",    label: "mov avg",    color: "#f97316", type: "line",    dash: "5 3" },
  { key: "bid1",      label: "bid L1",     color: "#34d399", type: "line",    dash: "4 2" },
  { key: "bid2",      label: "bid L2",     color: "#34d39966", type: "line",  dash: "3 3" },
  { key: "bid3",      label: "bid L3",     color: "#34d39933", type: "line",  dash: "2 4" },
  { key: "ask1",      label: "ask L1",     color: "#fb7185", type: "line",    dash: "4 2" },
  { key: "ask2",      label: "ask L2",     color: "#fb718566", type: "line",  dash: "3 3" },
  { key: "ask3",      label: "ask L3",     color: "#fb718533", type: "line",  dash: "2 4" },
  { key: "pnl",       label: "pnl",        color: "#e2e240", type: "line",    dash: undefined },
  { key: "placedBid", label: "placed bid", color: "#22c55e", type: "scatter", shape: "tri-down" },
  { key: "placedAsk", label: "placed ask", color: "#f43f5e", type: "scatter", shape: "tri-up"   },
  { key: "buyFill",   label: "buy fill",   color: "#a3e635", type: "scatter", shape: "circle"   },
  { key: "sellFill",  label: "sell fill",  color: "#fb923c", type: "scatter", shape: "circle"   },
];

const DEFAULT_HIDDEN_G = { movAvg:true, bid2:true, bid3:true, ask2:true, ask3:true, pnl:true, placedBid:true, placedAsk:true };
// pnl (combined) and all pnl_SYM hidden by default in local too.
// pnl_SYM keys are dynamic so they fall back to isHidden(..., true) — no need to list them here.
const DEFAULT_HIDDEN_L = { pnl:true };

// dynamic keys (pnl_SYM, pos_SYM) default to hidden=true if not yet in state
function isHidden(hidden, key, def=false) { return key in hidden ? !!hidden[key] : def; }

const POS_COLORS = ["#a78bfa", "#fbbf24", "#f472b6", "#22d3ee", "#e879f9"];
const PNL_COLORS = ["#facc15", "#fb923c", "#c084fc", "#34d399", "#f87171"];
function posColor(i) { return POS_COLORS[i % POS_COLORS.length]; }
function pnlColor(i) { return PNL_COLORS[i % PNL_COLORS.length]; }

// =============================================================================
// SIZE-PROPORTIONAL SHAPES  sqrt(size) scaling, clamped
// =============================================================================
function scaleR(size, minR=3, maxR=11) {
  return !size || size <= 0 ? minR : Math.max(minR, Math.min(maxR, Math.sqrt(size) * 1.6));
}
function scaleTri(size, minH=5, maxH=13) {
  return !size || size <= 0 ? minH : Math.max(minH, Math.min(maxH, Math.sqrt(size) * 1.4));
}

// Scatter shapes (filled markers for fills/orders)
function makeCircleDot(fill, large) {
  return function CircleDot({ cx, cy, payload }) {
    if (cx == null || cy == null) return null;
    const r = large ? scaleR(payload && payload.size, 6, 14) : scaleR(payload && payload.size, 3, 9);
    const opacity = large ? 1 : 0.85;
    const ringR = large ? r + 3 : r + 2;
    const ringOp = large ? 0.5 : 0.4;
    return <g>
      <circle cx={cx} cy={cy} r={r}     fill={fill} fillOpacity={opacity} stroke="#0f172a" strokeWidth={large ? 1.2 : 1} />
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={fill} strokeWidth={0.8} strokeOpacity={ringOp} />
    </g>;
  };
}
// stable refs for both contexts
const BUY_FILL_GLOBAL  = makeCircleDot("#a3e635", false);
const BUY_FILL_LOCAL   = makeCircleDot("#a3e635", true);
const SELL_FILL_GLOBAL = makeCircleDot("#fb923c", false);
const SELL_FILL_LOCAL  = makeCircleDot("#fb923c", true);
// Placed orders: larger (min 8), brighter, with glow outline ring so they stand above market dots
function BuyOrderDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload && payload.size, 8, 18), w = h * 0.8;
  return (
    <g>
      <polygon points={cx+","+(cy+h+3.5)+" "+(cx-w-2.5)+","+(cy-h*0.4-1.5)+" "+(cx+w+2.5)+","+(cy-h*0.4-1.5)}
        fill="none" stroke="#4ade80" strokeWidth={1} strokeOpacity={0.4} />
      <polygon points={cx+","+(cy+h)+" "+(cx-w)+","+(cy-h*0.4)+" "+(cx+w)+","+(cy-h*0.4)}
        fill="#4ade80" stroke="#0f172a" strokeWidth={0.8} />
    </g>
  );
}
function SellOrderDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload && payload.size, 8, 18), w = h * 0.8;
  return (
    <g>
      <polygon points={cx+","+(cy-h-3.5)+" "+(cx-w-2.5)+","+(cy+h*0.4+1.5)+" "+(cx+w+2.5)+","+(cy+h*0.4+1.5)}
        fill="none" stroke="#f87171" strokeWidth={1} strokeOpacity={0.4} />
      <polygon points={cx+","+(cy-h)+" "+(cx-w)+","+(cy+h*0.4)+" "+(cx+w)+","+(cy+h*0.4)}
        fill="#f87171" stroke="#0f172a" strokeWidth={0.8} />
    </g>
  );
}

// Market bid/ask level dots — smaller (3–11) so placed orders visually dominate
function makeLevelDot(color, volKey) {
  return function LevelDot(props) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const vol = payload && payload[volKey];
    if (!vol) return null;
    const r = scaleR(vol, 3, 11);
    return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.6} stroke="#0f172a" strokeWidth={0.6} />;
  };
}
const BID1DOT = makeLevelDot("#34d399",   "bv1");
const BID2DOT = makeLevelDot("#34d39988", "bv2");
const BID3DOT = makeLevelDot("#34d39955", "bv3");
const ASK1DOT = makeLevelDot("#fb7185",   "av1");
const ASK2DOT = makeLevelDot("#fb718588", "av2");
const ASK3DOT = makeLevelDot("#fb718555", "av3");

// Custom tooltip: compact, shows volumes for bid/ask levels, size for orders
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  // grab the underlying data point (same for all line entries at this tick)
  const pt = payload[0] && payload[0].payload;
  const seen = new Set();
  const rows = [];
  for (const e of payload) {
    const k = e.name || e.dataKey;
    if (!k || seen.has(k) || e.value == null) continue;
    seen.add(k);
    const size = e.payload && e.payload.size;
    rows.push({ k, v: typeof e.value === "number" ? e.value.toFixed(1) : e.value, size });
  }
  if (!rows.length) return null;
  // volume annotations from the data point
  const vols = [];
  if (pt) {
    const pairs = [["bv1",pt.bv1],["bv2",pt.bv2],["bv3",pt.bv3],["av1",pt.av1],["av2",pt.av2],["av3",pt.av3]];
    for (const [k,v] of pairs) if (v != null && v !== 0) vols.push({ k, v });
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
          {vols.map(({k,v}) => (
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

// =============================================================================
// PRICE CHART  (dual Y-axis: price left, position right)
// isLocal = true → bid/ask levels drawn as dotted line + volume dots
// =============================================================================
const PriceChart = memo(function PriceChart({ sym, parsedData, hidden, refArea, showPosSeries, isLocal }) {
  const touch      = parsedData.touch[sym]      || [];
  const placedBids = parsedData.placedBids[sym] || [];
  const placedAsks = parsedData.placedAsks[sym] || [];
  const allFills   = parsedData.fills[sym]      || [];
  const allSymbols = parsedData.symbols;

  // memoize fill split — stable across legend toggles
  const [buyFills, sellFills] = useMemo(function() {
    const b = [], s = [];
    for (const f of allFills) (f.side === "buy" ? b : s).push(f);
    return [b, s];
  }, [allFills]);

  // domain: always from full data, independent of hidden → no recompute on legend toggle
  const priceDom = useMemo(function() {
    const v = [];
    for (const d of touch) {
      if (d.bid1 != null) v.push(d.bid1);
      if (d.ask1 != null) v.push(d.ask1);
      if (d.mid  != null) v.push(d.mid);
    }
    for (const d of placedBids) v.push(d.price);
    for (const d of placedAsks) v.push(d.price);
    for (const d of allFills)   v.push(d.price);
    if (!v.length) return ["auto","auto"];
    const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    const pad = (hi - lo) * 0.15 || 2;
    return [+(lo - pad).toFixed(1), +(hi + pad).toFixed(1)];
  }, [touch, placedBids, placedAsks, allFills]);

  const posDom = useMemo(function() {
    if (!showPosSeries) return [0, 1];
    const v = [];
    for (const s of allSymbols) (parsedData.position[s] || []).forEach(d => v.push(d.pos));
    if (!v.length) return ["auto","auto"];
    const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    const pad = Math.max((hi - lo) * 0.15, 5);
    return [Math.floor(lo-pad), Math.ceil(hi+pad)];
  }, [parsedData, allSymbols, showPosSeries]);  // no hidden dep

  const xDom = useMemo(function() {
    return touch.length ? [touch[0].ts, touch[touch.length-1].ts] : ["auto","auto"];
  }, [touch]);

  // bid/ask line style varies by view
  const bidLine = (dataKey, color, dash, dotComp) => (
    <Line yAxisId="price" data={touch} dataKey={dataKey} stroke={color}
      dot={isLocal ? dotComp : false} strokeWidth={isLocal ? 0.7 : 1}
      strokeDasharray={isLocal ? "3 3" : dash}
      isAnimationActive={false} legendType="none" connectNulls={false} />
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top:4, right: showPosSeries ? 48 : 10, bottom:4, left:2 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" />
        <XAxis dataKey="ts" type="number" domain={xDom} tick={{ fill:"#475569", fontSize:9 }} tickLine={false} allowDuplicatedCategory={false} />
        <YAxis yAxisId="price" domain={priceDom} tick={{ fill:"#475569", fontSize:9 }} tickLine={false} width={50} tickFormatter={v => v.toFixed(1)} />
        {showPosSeries && (
          <YAxis yAxisId="pos" orientation="right" domain={posDom} tick={{ fill:"#64748b", fontSize:9 }} tickLine={false} width={38}
            label={{ value:"pos", angle:90, position:"insideRight", fill:"#475569", fontSize:8, offset:6 }} />
        )}
        <Tooltip content={<ChartTooltip />} isAnimationActive={false} />

        {!hidden.mid    && <Line yAxisId="price" data={touch} dataKey="mid"    stroke="#60a5fa" dot={false} strokeWidth={1.5} isAnimationActive={false} legendType="none" connectNulls={false} />}
        {!hidden.movAvg && <Line yAxisId="price" data={touch} dataKey="movAvg" stroke="#f97316" dot={false} strokeWidth={1}   isAnimationActive={false} strokeDasharray="5 3" legendType="none" connectNulls={false} />}
        {!hidden.bid1   && bidLine("bid1", "#34d399",   "4 2", BID1DOT)}
        {!hidden.bid2   && bidLine("bid2", "#34d39988", "3 3", BID2DOT)}
        {!hidden.bid3   && bidLine("bid3", "#34d39955", "2 4", BID3DOT)}
        {!hidden.ask1   && bidLine("ask1", "#fb7185",   "4 2", ASK1DOT)}
        {!hidden.ask2   && bidLine("ask2", "#fb718588", "3 3", ASK2DOT)}
        {!hidden.ask3   && bidLine("ask3", "#fb718555", "2 4", ASK3DOT)}
        {!isHidden(hidden,"pnl") && <Line yAxisId="price" data={touch} dataKey="pnl" stroke="#e2e240" dot={false} strokeWidth={1.2} isAnimationActive={false} legendType="none" connectNulls={false} />}

        {!isHidden(hidden,"placedBid") && <Scatter yAxisId="price" data={placedBids} dataKey="price" name="placed bid" fill="#22c55e" shape={<BuyOrderDot />} isAnimationActive={false} legendType="none" />}
        {!isHidden(hidden,"placedAsk") && <Scatter yAxisId="price" data={placedAsks} dataKey="price" name="placed ask" fill="#f43f5e" shape={<SellOrderDot />} isAnimationActive={false} legendType="none" />}
        {!isHidden(hidden,"buyFill")  && <Scatter yAxisId="price" data={buyFills}  dataKey="price" name="buy fill"  fill="#a3e635" shape={isLocal ? <BUY_FILL_LOCAL  /> : <BUY_FILL_GLOBAL  />} isAnimationActive={false} legendType="none" />}
        {!isHidden(hidden,"sellFill") && <Scatter yAxisId="price" data={sellFills} dataKey="price" name="sell fill" fill="#fb923c" shape={isLocal ? <SELL_FILL_LOCAL /> : <SELL_FILL_GLOBAL />} isAnimationActive={false} legendType="none" />}

        {showPosSeries && allSymbols.map(function(s, i) {
          if (isHidden(hidden, "pos_"+s)) return null;
          const posData = parsedData.position[s] || [];
          if (!posData.length) return null;
          return <Line key={"pos_"+s} yAxisId="pos" data={posData} dataKey="pos" stroke={posColor(i)} dot={false} strokeWidth={1.5} type="stepAfter" isAnimationActive={false} legendType="none" />;
        })}

        {allSymbols.map(function(s, i) {
          if (isHidden(hidden, "pnl_"+s, true)) return null;
          const pd = parsedData.touch[s] || [];
          if (!pd.length) return null;
          return <Line key={"pnl_"+s} yAxisId="price" data={pd} dataKey="pnl" stroke={pnlColor(i)} dot={false} strokeWidth={1.2} isAnimationActive={false} legendType="none" connectNulls={false} />;
        })}

        {refArea && refArea[0] != null && (
          <ReferenceArea yAxisId="price" x1={refArea[0]} x2={refArea[1]} fill="#f43f5e" fillOpacity={0.1} stroke="#f43f5e" strokeOpacity={0.35} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}, function areEqual(prev, next) {
  // only re-render when data or hidden actually changes
  return prev.sym === next.sym &&
    prev.parsedData === next.parsedData &&
    prev.hidden === next.hidden &&
    prev.refArea === next.refArea &&
    prev.showPosSeries === next.showPosSeries &&
    prev.isLocal === next.isLocal;
});
function CustomLegend({ priceSeries, symbols, hidden, onToggle }) {
  function LegendItem({ itemKey, color, label, shape, off }) {
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

  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 10px", padding:"2px 0 4px 4px" }}>
      {priceSeries.map(s => (
        <LegendItem key={s.key} itemKey={s.key} color={s.color} label={s.label}
          shape={s.type === "scatter" ? (s.shape || "circle") : (s.dash || "line")}
          off={isHidden(hidden, s.key)} />
      ))}
      {symbols.map((sym, i) => (
        <LegendItem key={"pos_"+sym} itemKey={"pos_"+sym} color={posColor(i)} label={"pos "+sym} shape="line"
          off={isHidden(hidden, "pos_"+sym)} />
      ))}
      {symbols.map((sym, i) => (
        <LegendItem key={"pnl_"+sym} itemKey={"pnl_"+sym} color={pnlColor(i)} label={"pnl "+sym} shape="line"
          off={isHidden(hidden, "pnl_"+sym, true)} />
      ))}
    </div>
  );
}

// =============================================================================
// DATA TABLE
// =============================================================================
function DataTable({ sym, parsedData, tsRange }) {
  const [lo, hi] = tsRange || [0, Infinity];
  const touch      = useMemo(() => (parsedData.touch[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const placedBids = useMemo(() => (parsedData.placedBids[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const placedAsks = useMemo(() => (parsedData.placedAsks[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const fills      = useMemo(() => (parsedData.fills[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);
  const position   = useMemo(() => (parsedData.position[sym] || []).filter(d => d.ts >= lo && d.ts <= hi), [parsedData, sym, lo, hi]);

  const rows = useMemo(function() {
    const posMap = {}, pbMap = {}, paMap = {}, fillsMap = {};
    for (const p of position)   { posMap[p.ts] = p.pos; }
    for (const b of placedBids) { if (!pbMap[b.ts]) pbMap[b.ts] = []; pbMap[b.ts].push(b.price+"x"+b.size); }
    for (const a of placedAsks) { if (!paMap[a.ts]) paMap[a.ts] = []; paMap[a.ts].push(a.price+"x"+a.size); }
    for (const f of fills)      { if (!fillsMap[f.ts]) fillsMap[f.ts] = []; fillsMap[f.ts].push(f); }
    return touch.map(function(d) {
      return {
        ts: d.ts, mid: d.mid, bid1: d.bid1, bv1: d.bv1, bid2: d.bid2, bv2: d.bv2,
        ask1: d.ask1, av1: d.av1, ask2: d.ask2, av2: d.av2, movAvg: d.movAvg,
        pos:  posMap[d.ts] != null ? posMap[d.ts] : "",
        pBid: (pbMap[d.ts] || []).join(" "),
        pAsk: (paMap[d.ts] || []).join(" "),
        fills: (fillsMap[d.ts] || []).map(f => (f.side==="buy"?"B":"S")+f.price+"×"+f.size).join(" "),
      };
    });
  }, [touch, placedBids, placedAsks, fills, position]);

  const th = { padding:"3px 6px", textAlign:"right", fontSize:9, color:"#475569", letterSpacing:"0.08em", borderBottom:"1px solid #1e293b", whiteSpace:"nowrap", position:"sticky", top:0, background:"#0a1628" };
  const td = (color) => ({ padding:"2px 6px", fontSize:9, textAlign:"right", whiteSpace:"nowrap", borderBottom:"1px solid #0f172a", color: color || "#94a3b8", fontVariantNumeric:"tabular-nums" });

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
    { h:"my bids",   get: r => r.pBid, color:"#4ade80",  title:"My placed buy orders at this tick (price×qty)" },
    { h:"my asks",   get: r => r.pAsk, color:"#f87171",  title:"My placed sell orders at this tick (price×qty)" },
    { h:"my trades", get: r => r.fills, color:"#e2e8f0", title:"My filled trades at this tick (B/S price×qty)" },
  ];

  return (
    <div style={{ height:"100%", overflowY:"auto", overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", tableLayout:"auto", minWidth:"100%" }}>
        <thead>
          <tr>{cols.map(c => <th key={c.h} style={th} title={c.title || ""}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(function(r, i) {
            const hasFill = r.fills.length > 0;
            return (
              <tr key={i} style={{ background: hasFill ? "rgba(163,230,53,0.06)" : "transparent" }}>
                {cols.map(c => <td key={c.h} style={td(c.color)}>{c.get(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// DUAL-HANDLE RANGE BAR
// =============================================================================
function RangeBar({ tsData, brush, setBrush }) {
  const trackRef = useRef(null);
  const n = tsData.length - 1;
  function pct(i) { return n > 0 ? (i / n) * 100 : 0; }
  function idxFromX(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(((clientX - rect.left) / rect.width) * n)));
  }
  function makeDown(handle) {
    return function(e) {
      e.preventDefault();
      function mv(ev) { const idx = idxFromX(ev.clientX); setBrush(prev => handle==="lo" ? [Math.min(idx,prev[1]-1),prev[1]] : [prev[0],Math.max(idx,prev[0]+1)]); }
      function up() { window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); }
      window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
    };
  }
  function tsAt(i) { const d = tsData[Math.max(0,Math.min(i,n))]; return d ? String(d.ts) : ""; }
  const [loT, setLoT] = useState(() => tsAt(brush[0]));
  const [hiT, setHiT] = useState(() => tsAt(brush[1]));
  const prev = useRef(brush);
  if (prev.current !== brush) { prev.current = brush; setLoT(tsAt(brush[0])); setHiT(tsAt(brush[1])); }
  function commit(side, val) {
    const ts = Number(val); if (isNaN(ts) || !tsData.length) return;
    let best=0, bd=Infinity;
    for (let i=0;i<tsData.length;i++) { const d=Math.abs(tsData[i].ts-ts); if(d<bd){bd=d;best=i;} }
    setBrush(prev => side==="lo" ? [Math.min(best,prev[1]-1),prev[1]] : [prev[0],Math.max(best,prev[0]+1)]);
  }
  const inp = { background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"3px 6px", fontSize:10, width:72, fontFamily:"inherit", outline:"none", textAlign:"center" };
  function hdl(p) { return { position:"absolute", top:"50%", left:p+"%", transform:"translate(-50%,-50%)", width:12, height:12, borderRadius:"50%", background:"#f43f5e", border:"2px solid #0f172a", cursor:"ew-resize", zIndex:2, boxSizing:"border-box", boxShadow:"0 0 0 3px rgba(244,63,94,0.25)" }; }
  return (
    <div style={{ marginBottom:10, paddingLeft:2 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input value={loT} onChange={e=>setLoT(e.target.value)} onBlur={e=>commit("lo",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commit("lo",loT);}} style={inp} />
        <div ref={trackRef} style={{ flex:1, position:"relative", height:18, cursor:"crosshair" }}>
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:0, right:0, height:3, background:"#1e293b", borderRadius:2 }} />
          <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:pct(brush[0])+"%", width:(pct(brush[1])-pct(brush[0]))+"%", height:3, background:"#f43f5e", borderRadius:2 }} />
          <div onMouseDown={makeDown("lo")} style={hdl(pct(brush[0]))} />
          <div onMouseDown={makeDown("hi")} style={hdl(pct(brush[1]))} />
        </div>
        <input value={hiT} onChange={e=>setHiT(e.target.value)} onBlur={e=>commit("hi",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commit("hi",hiT);}} style={inp} />
      </div>
    </div>
  );
}

// =============================================================================
// RESIZABLE HOOK
// =============================================================================
function useResizable(init, min, max) {
  const [pct, setPct] = useState(init);
  const ref = useRef(null);
  const onMouseDown = useCallback(function(e) {
    e.preventDefault();
    function mv(ev) {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPct(Math.max(min, Math.min(max, ((ev.clientX - rect.left) / rect.width) * 100)));
    }
    function up() { window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); }
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  }, [min, max]);
  return { pct, ref, onMouseDown };
}

function Label({ text }) {
  return <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3, paddingLeft:2 }}>{text}</div>;
}

// =============================================================================
// STATS PANEL
// =============================================================================
function StatsPanel({ parsed }) {
  const stats = useMemo(function() {
    return parsed.symbols.map(function(sym, i) {
      const pts   = parsed.touch[sym] || [];
      const fills = parsed.fills[sym]  || [];

      // pnl series
      const pnlArr = pts.map(p => p.pnl != null ? p.pnl : 0);
      const finalPnl = pnlArr.length ? pnlArr[pnlArr.length - 1] : 0;

      // max drawdown
      let maxDD = 0, peak = -Infinity;
      for (const v of pnlArr) {
        if (v > peak) peak = v;
        const dd = peak - v;
        if (dd > maxDD) maxDD = dd;
      }

      // std dev of tick-to-tick pnl changes
      const changes = [];
      for (let j = 1; j < pnlArr.length; j++) changes.push(pnlArr[j] - pnlArr[j-1]);
      const mean = changes.length ? changes.reduce((a,b)=>a+b,0)/changes.length : 0;
      const variance = changes.length ? changes.reduce((a,b)=>a+(b-mean)**2,0)/changes.length : 0;
      const stdDev = Math.sqrt(variance);

      // fill ratio: fills per 100 ticks
      const fillRatio = pts.length ? (fills.length / pts.length * 100) : 0;

      // buy/sell breakdown
      const buyF  = fills.filter(f=>f.side==="buy").length;
      const sellF = fills.filter(f=>f.side==="sell").length;

      return { sym, finalPnl, maxDD, stdDev, fillRatio, buyF, sellF, color: posColor(i) };
    });
  }, [parsed]);

  const totalPnl = stats.reduce((a,b)=>a+b.finalPnl, 0);
  const totalDD  = stats.reduce((a,b)=>a+b.maxDD, 0);

  const V = ({ v, dec=1, prefix="" }) => {
    const n = +v;
    const col = n > 0 ? "#22c55e" : n < 0 ? "#f43f5e" : "#64748b";
    return <span style={{ color: col, fontVariantNumeric:"tabular-nums" }}>{prefix}{Math.abs(n).toFixed(dec)}</span>;
  };

  const rowStyle = { display:"flex", justifyContent:"space-between", padding:"2px 0", borderBottom:"1px solid #0f172a" };
  const kStyle   = { color:"#475569", fontSize:9 };
  const vStyle   = { fontSize:9, fontVariantNumeric:"tabular-nums" };

  return (
    <div style={{ width:168, flexShrink:0, borderLeft:"1px solid #0f172a", padding:"6px 8px", overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
      {/* totals */}
      <div>
        <div style={{ fontSize:8, color:"#334155", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4 }}>portfolio</div>
        <div style={rowStyle}><span style={kStyle}>total pnl</span><span style={vStyle}><V v={totalPnl} /></span></div>
        <div style={rowStyle}><span style={kStyle}>total drawdown</span><span style={vStyle}><V v={-totalDD} /></span></div>
      </div>

      {/* per-symbol */}
      {stats.map(function(s) {
        return (
          <div key={s.sym}>
            <div style={{ fontSize:8, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3, color: s.color }}>{s.sym}</div>
            <div style={rowStyle}><span style={kStyle}>pnl</span>          <span style={vStyle}><V v={s.finalPnl} /></span></div>
            <div style={rowStyle}><span style={kStyle}>drawdown</span>     <span style={vStyle}><V v={-s.maxDD} /></span></div>
            <div style={rowStyle}><span style={kStyle}>pnl σ / tick</span> <span style={vStyle} style2={{ color:"#94a3b8" }}>{s.stdDev.toFixed(2)}</span></div>
            <div style={rowStyle}><span style={kStyle}>fill rate</span>    <span style={{ fontSize:9, color:"#94a3b8" }}>{s.fillRatio.toFixed(1)}%</span></div>
            <div style={rowStyle}><span style={kStyle}>B / S fills</span>  <span style={{ fontSize:9 }}><span style={{ color:"#22c55e" }}>{s.buyF}</span><span style={{ color:"#475569" }}>/</span><span style={{ color:"#fb923c" }}>{s.sellF}</span></span></div>
          </div>
        );
      })}

      {!stats.length && <div style={{ color:"#1e3a5f", fontSize:10, textAlign:"center", marginTop:20 }}>no data</div>}
    </div>
  );
}

// =============================================================================
// PERSISTENCE helpers
// =============================================================================
const LS_RAW  = "p4viz_raw";
const LS_META = "p4viz_meta";
const MAX_LS  = 4.5 * 1024 * 1024; // 4.5 MB guard

function lsSave(raw, meta) {
  try {
    if (raw.length < MAX_LS) localStorage.setItem(LS_RAW, raw);
    localStorage.setItem(LS_META, JSON.stringify(meta));
  } catch(e) { /* quota exceeded — silent */ }
}
function lsLoadRaw()  { try { return localStorage.getItem(LS_RAW)  || null; } catch(e) { return null; } }
function lsLoadMeta() { try { return JSON.parse(localStorage.getItem(LS_META) || "null"); } catch(e) { return null; } }
function lsClear()    { try { localStorage.removeItem(LS_RAW); localStorage.removeItem(LS_META); } catch(e) {} }

// =============================================================================
// APP
// =============================================================================
const EMPTY = { symbols:[], touch:{}, placedBids:{}, placedAsks:{}, fills:{}, position:{} };

function initState() {
  const raw  = lsLoadRaw();
  const meta = lsLoadMeta();
  if (!raw || !meta) return null;
  try {
    const p = parseP4Json(raw);
    return { parsed: p, sym: meta.sym || p.symbols[0] || "", brush: meta.brush || [0,50],
             fileName: meta.fileName || "restored", hiddenG: meta.hiddenG || {}, hiddenL: meta.hiddenL || {} };
  } catch(e) { return null; }
}

export default function App() {
  const init = useMemo(initState, []);

  const [parsed,   setParsed]   = useState(init ? init.parsed   : EMPTY);
  const [sym,      setSym]      = useState(init ? init.sym      : "");
  const [brush,    setBrush]    = useState(init ? init.brush    : [0, 50]);
  const [fileName, setFileName] = useState(init ? init.fileName : "no file loaded");
  const [hiddenG,  setHiddenG]  = useState(init ? init.hiddenG  : DEFAULT_HIDDEN_G);
  const [hiddenL,  setHiddenL]  = useState(init ? init.hiddenL  : DEFAULT_HIDDEN_L);
  const [serverPath, setServerPath] = useState("");
  const [fetching,   setFetching]   = useState(false);
  const fileRef = useRef(null);
  const rawRef  = useRef(init ? lsLoadRaw() : null); // keep raw for re-saves

  const vert  = useResizable(36, 15, 65);
  const horiz = useResizable(62, 25, 85);

  // persist meta (lightweight) on every relevant state change
  const persistMeta = useCallback(function(overrides) {
    const meta = Object.assign({ sym, brush, fileName, hiddenG, hiddenL }, overrides);
    lsSave(rawRef.current || "", meta);
  }, [sym, brush, fileName, hiddenG, hiddenL]);

  function applyRaw(rawText, name) {
    const p = parseP4Json(rawText);
    rawRef.current = rawText;
    const first = p.symbols[0] || "";
    const tLen  = first ? (p.touch[first] || []).length : 0;
    const b     = [0, Math.min(50, tLen - 1)];
    setParsed(p); setSym(first); setBrush(b); setFileName(name); setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
    lsSave(rawText, { sym: first, brush: b, fileName: name, hiddenG: DEFAULT_HIDDEN_G, hiddenL: DEFAULT_HIDDEN_L });
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try { applyRaw(ev.target.result, file.name); }
      catch(err) { alert("Failed to parse: " + err.message); }
    };
    reader.readAsText(file);
  }

  function loadFromServer() {
    const path = serverPath.trim(); if (!path) return;
    setFetching(true);
    fetch(path, { mode: "cors" })
      .then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText + " — check the path is correct and the file exists.");
        return r.text();
      })
      .then(function(txt) {
        const t = txt.trimStart();
        if (!t.startsWith("{") && !t.startsWith("["))
          throw new Error(
            "Server returned HTML instead of JSON.\n\n" +
            "This usually means:\n" +
            "  1. Wrong path — the URL returned a 404/redirect page\n" +
            "  2. CORS blocked — add 'Access-Control-Allow-Origin: *' to your server\n\n" +
            "Tip: python -m http.server 8000 serves the current dir with no CORS.\n" +
            "Then use: http://localhost:8000/your_log.json\n\n" +
            "Got: " + t.slice(0, 60) + "…"
          );
        applyRaw(txt, path.split("/").pop() || path);
      })
      .catch(function(err) { alert("Fetch failed:\n\n" + err.message); })
      .finally(function() { setFetching(false); });
  }

  function reset() {
    lsClear(); rawRef.current = null;
    setParsed(EMPTY); setSym(""); setBrush([0,50]);
    setFileName("no file loaded"); setHiddenG(DEFAULT_HIDDEN_G); setHiddenL(DEFAULT_HIDDEN_L);
    setServerPath("");
  }

  function toggleG(key) { const next = Object.assign({}, hiddenG, { [key]: !hiddenG[key] }); setHiddenG(next); persistMeta({ hiddenG: next }); }
  function toggleL(key) { const next = Object.assign({}, hiddenL, { [key]: !hiddenL[key] }); setHiddenL(next); persistMeta({ hiddenL: next }); }
  function changeSym(s) {
    const tLen = (parsed.touch[s] || []).length;
    const b = [0, Math.min(50, tLen - 1)];
    setSym(s); setBrush(b); persistMeta({ sym: s, brush: b });
  }
  const setBrushP = useCallback(function(valOrFn) {
    setBrush(function(prev) {
      const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      persistMeta({ brush: next });
      return next;
    });
  }, [persistMeta]);

  const tsData  = parsed.touch[sym] || [];
  const safeEnd = Math.min(brush[1], tsData.length - 1);
  const refArea = tsData.length && tsData[brush[0]] && tsData[safeEnd]
    ? [tsData[brush[0]].ts, tsData[safeEnd].ts] : null;
  const tsRange = refArea || [0, Infinity];

  const localParsed = useMemo(function() {
    const [lo, hi] = tsRange;
    const localPos = {};
    for (const s of parsed.symbols) localPos[s] = (parsed.position[s] || []).filter(d => d.ts >= lo && d.ts <= hi);
    return {
      symbols:    parsed.symbols,
      touch:      { [sym]: tsData.slice(brush[0], brush[1] + 1) },
      placedBids: { [sym]: (parsed.placedBids[sym] || []).filter(d => d.ts >= lo && d.ts <= hi) },
      placedAsks: { [sym]: (parsed.placedAsks[sym] || []).filter(d => d.ts >= lo && d.ts <= hi) },
      fills:      { [sym]: (parsed.fills[sym]      || []).filter(d => d.ts >= lo && d.ts <= hi) },
      position:   localPos,
    };
  }, [parsed, sym, brush[0], brush[1]]);  // eslint-disable-line

  const totalFills  = (parsed.fills[sym]     || []).length;
  const totalOrders = (parsed.placedBids[sym] || []).length + (parsed.placedAsks[sym] || []).length;
  const localTouchLen = (localParsed.touch[sym] || []).length;

  const btnBase = { border:"none", borderRadius:3, padding:"5px 12px", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"inherit" };
  const globalChartRef = useRef(null);
  const dragRef = useRef(null);  // { startX, startIdx }

  function globalMouseDown(e) {
    if (!tsData.length || !globalChartRef.current) return;
    const rect = globalChartRef.current.getBoundingClientRect();
    // account for left margin offset (yAxis width ~50px + padding 16px)
    const leftOff = 66, rightOff = 58;
    const usable = rect.width - leftOff - rightOff;
    const x = e.clientX - rect.left - leftOff;
    if (x < 0 || x > usable) return;
    const idx = Math.max(0, Math.min(tsData.length-1, Math.round((x / usable) * (tsData.length-1))));
    dragRef.current = { startIdx: idx };
    function onMove(ev) {
      if (!dragRef.current) return;
      const x2 = ev.clientX - rect.left - leftOff;
      const idx2 = Math.max(0, Math.min(tsData.length-1, Math.round((x2 / usable) * (tsData.length-1))));
      const lo = Math.min(dragRef.current.startIdx, idx2);
      const hi = Math.max(dragRef.current.startIdx, idx2);
      if (hi > lo) setBrushP([lo, hi]);
    }
    function onUp() { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div style={{ background:"#020817", color:"#e2e8f0", height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'JetBrains Mono','Fira Code',monospace", overflow:"hidden" }}>

      {/* top bar */}
      <div style={{ padding:"6px 16px", borderBottom:"1px solid #0f172a", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#38bdf8", letterSpacing:"0.08em" }}>IMC PROSPERITY 4</span>
        <span style={{ fontSize:10, color:"#1e3a5f", letterSpacing:"0.15em" }}>visualizer</span>
        <div style={{ flex:1 }} />

        <input ref={fileRef} type="file" accept=".json,.log,.txt" onChange={e => loadFile(e.target.files && e.target.files[0])} style={{ display:"none" }} />
        <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btnBase, background:"#0ea5e9", color:"#020817" }}>Load File</button>

        <input
          value={serverPath} onChange={e => setServerPath(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") loadFromServer(); }}
          placeholder="or paste server path / URL…"
          style={{ background:"#0f172a", color:"#94a3b8", border:"1px solid #1e293b", borderRadius:3, padding:"4px 8px", fontSize:10, fontFamily:"inherit", outline:"none", width:200 }}
        />
        <button onClick={loadFromServer} disabled={fetching || !serverPath.trim()}
          style={{ ...btnBase, background: fetching ? "#164e63" : "#0284c7", color:"#e0f2fe", opacity: (!serverPath.trim() || fetching) ? 0.5 : 1 }}>
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
        <button onClick={reset} style={{ ...btnBase, background:"#be123c", color:"#fff" }} title="Clear all data and reset view">Reset</button>
      </div>

      {/* body */}
      <div ref={vert.ref} style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* global panel */}
        <div style={{ height:vert.pct+"%", minHeight:0, display:"flex", flexDirection:"column", padding:"8px 16px 0" }}>
          <Label text={"GLOBAL -- " + tsData.length + " ticks -- all symbols position on right axis"} />
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

        {/* vertical resize handle */}
        <div onMouseDown={vert.onMouseDown}
          style={{ height:5, cursor:"ns-resize", background:"#0a1628", borderTop:"1px solid #1e293b", borderBottom:"1px solid #1e293b", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:32, height:2, background:"#334155", borderRadius:1 }} />
        </div>

        {/* local row: chart + table */}
        <div ref={horiz.ref} style={{ flex:1, minHeight:0, display:"flex", flexDirection:"row", overflow:"hidden" }}>

          {/* local chart */}
          <div style={{ width:horiz.pct+"%", minWidth:0, display:"flex", flexDirection:"column", padding:"8px 0 8px 16px" }}>
            <Label text={"LOCAL -- ticks "+brush[0]+"-"+brush[1]+" ("+localTouchLen+" pts)"} />
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
            <Label text={"DATA TABLE -- " + sym + " -- ts " + tsRange[0] + " to " + tsRange[1]} />
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