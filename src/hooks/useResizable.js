import { useState, useRef, useCallback } from "react";

export function useResizable(init, min, max) {
  const [pct, setPct] = useState(init);
  const ref = useRef(null);
  const onMouseDown = useCallback(function (e) {
    e.preventDefault();
    function mv(ev) {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPct(Math.max(min, Math.min(max, ((ev.clientX - rect.left) / rect.width) * 100)));
    }
    function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [min, max]);
  return { pct, ref, onMouseDown };
}