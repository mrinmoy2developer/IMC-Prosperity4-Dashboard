import { useState, useRef, useCallback } from "react";

// dir: "h" = horizontal splitter (divides left/right), "v" = vertical splitter (divides top/bottom)
export function useResizable(init, min, max, dir = "h") {
  const [pct, setPct] = useState(init);
  const ref = useRef(null);
  const onMouseDown = useCallback(function (e) {
    e.preventDefault();
    function mv(ev) {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const ratio = dir === "v"
        ? (ev.clientY - rect.top)  / rect.height
        : (ev.clientX - rect.left) / rect.width;
      setPct(Math.max(min, Math.min(max, ratio * 100)));
    }
    function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [min, max, dir]);
  return { pct, ref, onMouseDown };
}