export const PRICE_SERIES = [
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
  { key: "buyFill",     label: "buy fill",   color: "#a3e635", type: "scatter", shape: "circle"   },
  { key: "sellFill",   label: "sell fill",  color: "#fb923c", type: "scatter", shape: "circle"   },
  { key: "marketTrade",label: "mkt trade",  color: "#d946ef", type: "scatter", shape: "circle"   },
];

// Global view defaults: show only essentials (mid, bid/ask L1, fills)
export const DEFAULT_HIDDEN_G = {
  movAvg: true, bid2: true, bid3: true, ask2: true, ask3: true,
  pnl: true, placedBid: true, placedAsk: true, marketTrade: true,
};

// Local view defaults: hide combined pnl; per-symbol pnl_SYM defaults via isHidden(…, true)
export const DEFAULT_HIDDEN_L = { pnl: true };

// dynamic keys (pnl_SYM, pos_SYM) default to `def` if not explicitly set in state
export function isHidden(hidden, key, def = false) {
  return key in hidden ? !!hidden[key] : def;
}

export const POS_COLORS = ["#a78bfa", "#fbbf24", "#f472b6", "#22d3ee", "#e879f9"];
export const PNL_COLORS = ["#facc15", "#fb923c", "#c084fc", "#34d399", "#f87171"];
export const posColor = i => POS_COLORS[i % POS_COLORS.length];
export const pnlColor = i => PNL_COLORS[i % PNL_COLORS.length];