const LS_RAW  = "p4viz_raw";
const LS_META = "p4viz_meta";
const MAX_LS  = 4.5 * 1024 * 1024; // 4.5 MB guard

export function lsSave(raw, meta) {
  try {
    if (raw.length < MAX_LS) localStorage.setItem(LS_RAW, raw);
    localStorage.setItem(LS_META, JSON.stringify(meta));
  } catch (e) { /* quota exceeded — silent */ }
}

export function lsLoadRaw()  { try { return localStorage.getItem(LS_RAW) || null; } catch (e) { return null; } }
export function lsLoadMeta() { try { return JSON.parse(localStorage.getItem(LS_META) || "null"); } catch (e) { return null; } }
export function lsClear()    { try { localStorage.removeItem(LS_RAW); localStorage.removeItem(LS_META); } catch (e) {} }