import { memo, useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { isHidden, posColor, pnlColor } from "../seriesConfig.js";
import {
  BuyOrderDot, SellOrderDot,
  BUY_FILL_GLOBAL, BUY_FILL_LOCAL, SELL_FILL_GLOBAL, SELL_FILL_LOCAL,
  MARKET_TRADE_GLOBAL, MARKET_TRADE_LOCAL,
  BID1DOT, BID2DOT, BID3DOT, ASK1DOT, ASK2DOT, ASK3DOT,
} from "../shapes.jsx";
import { ChartTooltip } from "./ChartTooltip.jsx";

export const PriceChart = memo(function PriceChart({
  sym, parsedData, hidden, refArea, showPosSeries, isLocal,
}) {
  const touch      = parsedData.touch[sym]      || [];
  const placedBids = parsedData.placedBids[sym] || [];
  const placedAsks = parsedData.placedAsks[sym] || [];
  const allFills       = parsedData.fills[sym]        || [];
  const allMarketTrades = parsedData.marketTrades?.[sym] || [];
  const allSymbols     = parsedData.symbols;

  const [buyFills, sellFills] = useMemo(function () {
    const b = [], s = [];
    for (const f of allFills) (f.side === "buy" ? b : s).push(f);
    return [b, s];
  }, [allFills]);

  const priceDom = useMemo(function () {
    const v = [];
    for (const d of touch) {
      if (d.bid1 != null) v.push(d.bid1);
      if (d.ask1 != null) v.push(d.ask1);
      if (d.mid  != null) v.push(d.mid);
    }
    for (const d of placedBids) v.push(d.price);
    for (const d of placedAsks) v.push(d.price);
    for (const d of allFills)         v.push(d.price);
    for (const d of allMarketTrades)  v.push(d.price);
    if (!v.length) return ["auto", "auto"];
    const lo = Math.min(...v), hi = Math.max(...v);
    const pad = (hi - lo) * 0.15 || 2;
    return [+(lo - pad).toFixed(1), +(hi + pad).toFixed(1)];
  }, [touch, placedBids, placedAsks, allFills, allMarketTrades]);

  const posDom = useMemo(function () {
    if (!showPosSeries) return [0, 1];
    const v = [];
    for (const s of allSymbols) (parsedData.position[s] || []).forEach(d => v.push(d.pos));
    if (!v.length) return ["auto", "auto"];
    const lo = Math.min(...v), hi = Math.max(...v);
    const pad = Math.max((hi - lo) * 0.15, 5);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [parsedData, allSymbols, showPosSeries]);

  const xDom = useMemo(function () {
    return touch.length ? [touch[0].ts, touch[touch.length - 1].ts] : ["auto", "auto"];
  }, [touch]);

  const bidLine = (dataKey, color, dash, dotComp) => (
    <Line yAxisId="price" data={touch} dataKey={dataKey} stroke={color}
      dot={isLocal ? dotComp : false}
      strokeWidth={isLocal ? 0.7 : 1}
      strokeDasharray={isLocal ? "3 3" : dash}
      isAnimationActive={false} legendType="none" connectNulls={false} />
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top:4, right: showPosSeries ? 48 : 10, bottom:4, left:2 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" />
        <XAxis dataKey="ts" type="number" domain={xDom}
          tick={{ fill:"#475569", fontSize:9 }} tickLine={false} allowDuplicatedCategory={false} />
        <YAxis yAxisId="price" domain={priceDom}
          tick={{ fill:"#475569", fontSize:9 }} tickLine={false} width={50} tickFormatter={v => v.toFixed(1)} />
        {showPosSeries && (
          <YAxis yAxisId="pos" orientation="right" domain={posDom}
            tick={{ fill:"#64748b", fontSize:9 }} tickLine={false} width={38}
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
        {!isHidden(hidden, "pnl") && (
          <Line yAxisId="price" data={touch} dataKey="pnl" stroke="#e2e240" dot={false}
            strokeWidth={1.2} isAnimationActive={false} legendType="none" connectNulls={false} />
        )}

        {!isHidden(hidden, "placedBid") && (
          <Scatter yAxisId="price" data={placedBids} dataKey="price" name="placed bid"
            fill="#22c55e" shape={<BuyOrderDot />} isAnimationActive={false} legendType="none" />
        )}
        {!isHidden(hidden, "placedAsk") && (
          <Scatter yAxisId="price" data={placedAsks} dataKey="price" name="placed ask"
            fill="#f43f5e" shape={<SellOrderDot />} isAnimationActive={false} legendType="none" />
        )}
        {!isHidden(hidden, "buyFill") && (
          <Scatter yAxisId="price" data={buyFills} dataKey="price" name="buy fill" fill="#a3e635"
            shape={isLocal ? <BUY_FILL_LOCAL /> : <BUY_FILL_GLOBAL />} isAnimationActive={false} legendType="none" />
        )}
        {!isHidden(hidden, "sellFill") && (
          <Scatter yAxisId="price" data={sellFills} dataKey="price" name="sell fill" fill="#fb923c"
            shape={isLocal ? <SELL_FILL_LOCAL /> : <SELL_FILL_GLOBAL />} isAnimationActive={false} legendType="none" />
        )}
        {!isHidden(hidden, "marketTrade") && (
          <Scatter yAxisId="price" data={allMarketTrades} dataKey="price" name="mkt trade" fill="#d946ef"
            shape={isLocal ? <MARKET_TRADE_LOCAL /> : <MARKET_TRADE_GLOBAL />} isAnimationActive={false} legendType="none" />
        )}

        {showPosSeries && allSymbols.map(function (s, i) {
          if (isHidden(hidden, "pos_"+s)) return null;
          const posData = parsedData.position[s] || [];
          if (!posData.length) return null;
          return (
            <Line key={"pos_"+s} yAxisId="pos" data={posData} dataKey="pos"
              stroke={posColor(i)} dot={false} strokeWidth={1.5} type="stepAfter"
              isAnimationActive={false} legendType="none" />
          );
        })}

        {allSymbols.map(function (s, i) {
          if (isHidden(hidden, "pnl_"+s, true)) return null;
          const pd = parsedData.touch[s] || [];
          if (!pd.length) return null;
          return (
            <Line key={"pnl_"+s} yAxisId="price" data={pd} dataKey="pnl"
              stroke={pnlColor(i)} dot={false} strokeWidth={1.2}
              isAnimationActive={false} legendType="none" connectNulls={false} />
          );
        })}

        {refArea?.[0] != null && (
          <ReferenceArea yAxisId="price" x1={refArea[0]} x2={refArea[1]}
            fill="#f43f5e" fillOpacity={0.1} stroke="#f43f5e" strokeOpacity={0.35} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}, function areEqual(prev, next) {
  return (
    prev.sym           === next.sym &&
    prev.parsedData    === next.parsedData &&
    prev.hidden        === next.hidden &&
    prev.refArea       === next.refArea &&
    prev.showPosSeries === next.showPosSeries &&
    prev.isLocal       === next.isLocal
  );
});