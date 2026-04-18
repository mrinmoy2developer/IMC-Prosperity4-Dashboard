// Size-scaling helpers — sqrt(size) so perceived area is linear with volume
export function scaleR(size, minR = 3, maxR = 15) {
  return !size || size <= 0 ? minR : Math.max(minR, Math.min(maxR, Math.sqrt(size) * 1.6));
}
export function scaleTri(size, minH = 3, maxH = 10) {
  return !size || size <= 0 ? minH : Math.max(minH, Math.min(maxH, Math.sqrt(size) ));
}

// ---- Fill circles (buy/sell trades) ----------------------------------------
// large=false → global view (smaller, semi-transparent)
// large=true  → local view (bigger, fully opaque, wider ring)
export function makeCircleDot(fill, large) {
  return function CircleDot({ cx, cy, payload }) {
    if (cx == null || cy == null) return null;
    const r      = large ? scaleR(payload?.size, 6, 14) : scaleR(payload?.size, 3, 9);
    const op     = large ? 1 : 0.85;
    const ringR  = large ? r + 3 : r + 2;
    const ringOp = large ? 0.5  : 0.4;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r}     fill={fill} fillOpacity={op}    stroke="#0f172a" strokeWidth={large ? 1.2 : 1} />
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={fill}       strokeWidth={0.8} strokeOpacity={ringOp} />
      </g>
    );
  };
}

// Stable module-level refs — never recreated on render
export const BUY_FILL_GLOBAL  = makeCircleDot("#a3e635", false);
export const BUY_FILL_LOCAL   = makeCircleDot("#b7f359ff", true);
export const SELL_FILL_GLOBAL = makeCircleDot("#fb923c", false);
export const SELL_FILL_LOCAL  = makeCircleDot("#fbd23cff", true);

// ---- Market trade diamonds (hollow, purple/magenta) -------------------------
// Hollow diamond so they're clearly distinct from own-trade filled circles
export function makeMarketDot(stroke, large) {
  return function MarketDot({ cx, cy, payload }) {
    if (cx == null || cy == null) return null;
    const s = large ? scaleR(payload?.size, 5, 12) : scaleR(payload?.size, 2, 6);
    const op = large ? 0.9 : 0.65;
    return (
      <polygon
        points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
        fill="none" stroke={stroke} strokeWidth={large ? 1.5 : 1} strokeOpacity={op}
      />
    );
  };
}

export const MARKET_TRADE_GLOBAL = makeMarketDot("#e879f9", false);
export const MARKET_TRADE_LOCAL  = makeMarketDot("#e879f9", true);

// ---- Placed order triangles -------------------------------------------------
// Larger (min 8px), brighter lime/red, outer glow ring so they dominate market dots
export function BuyOrderDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload?.size, 8, 18), w = h * 0.8;
  return (
    <g>
      <polygon
        points={`${cx},${cy + h + 3.5} ${cx - w - 2.5},${cy - h * 0.4 - 1.5} ${cx + w + 2.5},${cy - h * 0.4 - 1.5}`}
        fill="none" stroke="#4ade80" strokeWidth={1} strokeOpacity={0.4}
      />
      <polygon
        points={`${cx},${cy + h} ${cx - w},${cy - h * 0.4} ${cx + w},${cy - h * 0.4}`}
        fill="#4ade80" stroke="#0f172a" strokeWidth={0.8}
      />
    </g>
  );
}

export function SellOrderDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload?.size, 8, 18), w = h * 0.8;
  return (
    <g>
      <polygon
        points={`${cx},${cy - h - 3.5} ${cx - w - 2.5},${cy + h * 0.4 + 1.5} ${cx + w + 2.5},${cy + h * 0.4 + 1.5}`}
        fill="none" stroke="#f87171" strokeWidth={1} strokeOpacity={0.4}
      />
      <polygon
        points={`${cx},${cy - h} ${cx - w},${cy + h * 0.4} ${cx + w},${cy + h * 0.4}`}
        fill="#f87171" stroke="#0f172a" strokeWidth={0.8}
      />
    </g>
  );
}

// ---- Market bid/ask level dots (local view only) ----------------------------
// Smaller (3–11) + lower opacity so they don't compete with placed order markers
function makeLevelDot(color, volKey) {
  return function LevelDot({ cx, cy, payload }) {
    if (cx == null || cy == null) return null;
    const vol = payload?.[volKey];
    if (!vol) return null;
    const r = scaleR(vol, 3, 11);
    return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.6} stroke="#0f172a" strokeWidth={0.6} />;
  };
}

export const BID1DOT = makeLevelDot("#34d399",   "bv1");
export const BID2DOT = makeLevelDot("#34d39988", "bv2");
export const BID3DOT = makeLevelDot("#34d39955", "bv3");
export const ASK1DOT = makeLevelDot("#fb7185",   "av1");
export const ASK2DOT = makeLevelDot("#fb718588", "av2");
export const ASK3DOT = makeLevelDot("#fb718555", "av3");