// Parses the P4 JSON log format into a structured object.
// Mirrors load_states() from the Python notebook.
export function parseP4Json(text) {
  const raw = JSON.parse(text);
  const out = {
    symbols:    [],
    touch:      {},   // sym -> [{ts, mid, pnl, bid1..3, ask1..3, bv1..3, av1..3, movAvg}]
    placedBids: {},   // sym -> [{ts, price, size}]
    placedAsks: {},   // sym -> [{ts, price, size}]
    fills:      {},   // sym -> [{ts, price, size, side}]
    position:   {},   // sym -> [{ts, pos}]
  };
  const symSet = new Set();
  const obMap  = {};  // ts -> sym -> { bid2,bid3,ask2,ask3 }

  // ---- activitiesLog CSV -------------------------------------------------------
  if (raw.activitiesLog) {
    const lines = raw.activitiesLog.trim().split("\n");
    const hdr = lines[0].split(";").map(h => h.trim().toLowerCase());
    const col = k => hdr.indexOf(k);
    const iTs   = col("timestamp"), iProd = col("product");
    const iMid  = col("mid_price"), iPnl  = col("profit_and_loss");
    const iBid1 = col("bid_price_1"), iBid2 = col("bid_price_2"), iBid3 = col("bid_price_3");
    const iAsk1 = col("ask_price_1"), iAsk2 = col("ask_price_2"), iAsk3 = col("ask_price_3");
    const iBv1  = col("bid_volume_1"), iBv2  = col("bid_volume_2"), iBv3  = col("bid_volume_3");
    const iAv1  = col("ask_volume_1"), iAv2  = col("ask_volume_2"), iAv3  = col("ask_volume_3");

    function num(p, i) {
      if (i < 0 || i >= p.length) return null;
      const v = p[i].trim();
      return v === "" || v === "nan" ? null : (+v || null);
    }

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

      for (const o of orders) {
        const sym = o[0]; symSet.add(sym);
        if (o[2] < 0) {
          if (!out.placedAsks[sym]) out.placedAsks[sym] = [];
          out.placedAsks[sym].push({ ts: time, price: o[1], size: Math.abs(o[2]) });
        } else {
          if (!out.placedBids[sym]) out.placedBids[sym] = [];
          out.placedBids[sym].push({ ts: time, price: o[1], size: o[2] });
        }
      }

      for (const [sym, pos] of Object.entries(posMap)) {
        symSet.add(sym);
        if (!out.position[sym]) out.position[sym] = [];
        out.position[sym].push({ ts: time, pos: +pos });
      }

      for (const [sym, sides] of Object.entries(obBook)) {
        symSet.add(sym);
        if (!Array.isArray(sides) || sides.length < 2) continue;
        const bidPrices = Object.keys(sides[0] || {}).map(Number).sort((a, b) => b - a);
        const askPrices = Object.keys(sides[1] || {}).map(Number).sort((a, b) => a - b);
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
      out.fills[sym].push({
        ts: t.timestamp, price: +t.price, size: +t.quantity,
        side: t.buyer === "SUBMISSION" ? "buy" : "sell",
      });
    }
  }

  // ---- merge obMap depth into touch -------------------------------------------
  for (const sym of symSet) {
    for (const pt of (out.touch[sym] || [])) {
      const ob = obMap[pt.ts] && obMap[pt.ts][sym];
      if (ob) {
        if (pt.bid2 == null) pt.bid2 = ob.bid2;
        if (pt.bid3 == null) pt.bid3 = ob.bid3;
        if (pt.ask2 == null) pt.ask2 = ob.ask2;
        if (pt.ask3 == null) pt.ask3 = ob.ask3;
      }
    }
  }

  // ---- moving average (window=50) on mid --------------------------------------
  const W = 50;
  for (const sym of symSet) {
    const pts = out.touch[sym] || [];
    for (let i = 0; i < pts.length; i++) {
      const slice = pts.slice(Math.max(0, i - W + 1), i + 1).map(p => p.mid).filter(v => v != null);
      pts[i].movAvg = slice.length
        ? +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2)
        : null;
    }
  }

  // ---- seed position at ts=0 to avoid gap at chart start ----------------------
  const minTs = Math.min(
    ...[...symSet].flatMap(s => (out.touch[s] || []).map(p => p.ts)).filter(v => !isNaN(v))
  );
  for (const sym of symSet) {
    if (!out.position[sym]) out.position[sym] = [];
    const pos = out.position[sym];
    const seed = isFinite(minTs) ? minTs : 0;
    if (!pos.length || pos[0].ts > seed) pos.unshift({ ts: seed, pos: 0 });
  }

  out.symbols = [...symSet].sort();
  return out;
}