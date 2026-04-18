// Size-scaling helpers — sqrt(size) so perceived area is linear with volume
export function scaleR(size, minR = 3, maxR = 15) {
  return !size || size <= 0 ? minR : Math.max(minR, Math.min(maxR, Math.sqrt(size) * 1.6));
}
export function scaleTri(size, minH = 3, maxH = 10) {
  return !size || size <= 0 ? minH : Math.max(minH, Math.min(maxH, Math.sqrt(size)));
}

// ---- Fill circles (buy/sell/market trades) ----------------------------------
// scale prop injected by recharts cloneElement when passed as shape={<Dot scale={x} />}
export function makeCircleDot(fill, large) {
  return function CircleDot({ cx, cy, payload, scale = 1 }) {
    if (cx == null || cy == null) return null;
    const r      = large ? scaleR(payload?.size, 6 * scale, 14 * scale) : scaleR(payload?.size, 3 * scale, 9 * scale);
    const op     = large ? 1 : 0.85;
    const ringR  = large ? r + 3 * scale : r + 2 * scale;
    const ringOp = large ? 0.5 : 0.4;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r}     fill={fill} fillOpacity={op}  stroke="#0f172a" strokeWidth={large ? 1.2 : 1} />
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={fill}     strokeWidth={0.8} strokeOpacity={ringOp} />
      </g>
    );
  };
}

export const BUY_FILL_GLOBAL    = makeCircleDot("#a3e635",   false);
export const BUY_FILL_LOCAL     = makeCircleDot("#b7f359",   true);
export const SELL_FILL_GLOBAL   = makeCircleDot("#fb923c",   false);
export const SELL_FILL_LOCAL    = makeCircleDot("#fbd23c",   true);
export const MARKET_TRADE_GLOBAL = makeCircleDot("#d946ef",  false);
export const MARKET_TRADE_LOCAL  = makeCircleDot("#d946ef",  true);

// ---- Placed order triangles -------------------------------------------------
export function BuyOrderDot({ cx, cy, payload, scale = 1 }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload?.size, 8 * scale, 18 * scale), w = h * 0.8;
  return (
    <g>
      <polygon
        points={`${cx},${cy + h + 3.5 * scale} ${cx - w - 2.5 * scale},${cy - h * 0.4 - 1.5 * scale} ${cx + w + 2.5 * scale},${cy - h * 0.4 - 1.5 * scale}`}
        fill="none" stroke="#4ade80" strokeWidth={1} strokeOpacity={0.4}
      />
      <polygon
        points={`${cx},${cy + h} ${cx - w},${cy - h * 0.4} ${cx + w},${cy - h * 0.4}`}
        fill="#4ade80" stroke="#0f172a" strokeWidth={0.8}
      />
    </g>
  );
}

export function SellOrderDot({ cx, cy, payload, scale = 1 }) {
  if (cx == null || cy == null) return null;
  const h = scaleTri(payload?.size, 8 * scale, 18 * scale), w = h * 0.8;
  return (
    <g>
      <polygon
        points={`${cx},${cy - h - 3.5 * scale} ${cx - w - 2.5 * scale},${cy + h * 0.4 + 1.5 * scale} ${cx + w + 2.5 * scale},${cy + h * 0.4 + 1.5 * scale}`}
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
function makeLevelDot(color, volKey) {
  return function LevelDot({ cx, cy, payload, scale = 1 }) {
    if (cx == null || cy == null) return null;
    const vol = payload?.[volKey];
    if (!vol) return null;
    const r = scaleR(vol, 3 * scale, 11 * scale);
    return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.6} stroke="#0f172a" strokeWidth={0.6} />;
  };
}

export const BID1DOT = makeLevelDot("#34d399",   "bv1");
export const BID2DOT = makeLevelDot("#34d39988", "bv2");
export const BID3DOT = makeLevelDot("#34d39955", "bv3");
export const ASK1DOT = makeLevelDot("#fb7185",   "av1");
export const ASK2DOT = makeLevelDot("#fb718588", "av2");
export const ASK3DOT = makeLevelDot("#fb718555", "av3");
