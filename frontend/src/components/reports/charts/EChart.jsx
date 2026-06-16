/**
 * EChart — a thin, theme-aware React wrapper around Apache ECharts.
 *
 * Hand-wrapped (init in an effect, like the Three.js component) so there is no
 * React-version peer dependency. Canvas can't read CSS variables, so colours
 * are resolved per theme via `chartTheme()` and baked into the option object;
 * the chart re-renders whenever the option or the active theme changes.
 */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { useTheme } from "../../../contexts/theme";

/** Canvas-safe palette for each theme (mirrors the app's CSS variables). */
export function chartTheme(theme) {
  const dark = theme === "dark";
  return {
    text: dark ? "#EDEDEF" : "#111318",
    sub: dark ? "#8A8F98" : "#5F6368",
    faint: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
    split: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    bg: dark ? "#0a0a0c" : "#FFFFFF",
    tooltipBg: dark ? "rgba(12,12,14,0.96)" : "rgba(255,255,255,0.98)",
    tooltipBorder: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    accent: "#E60000",
  };
}

/** Severity buckets — shared by the aggregation and every chart. */
export const SEV = [
  { key: "low", label: "< 1h", color: "#fbbf24" },
  { key: "med", label: "1–4h", color: "#fb923c" },
  { key: "high", label: "4–12h", color: "#f43f5e" },
  { key: "crit", label: "12h+", color: "#dc2626" },
];
export const sevIndex = (hrs) => (hrs >= 12 ? 3 : hrs >= 4 ? 2 : hrs >= 1 ? 1 : 0);

/** Left→right gradient from a base hex (transparent-ish → solid). */
export function grad(color) {
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: color + "66" },
    { offset: 1, color },
  ]);
}

export default function EChart({ option, height = 240, onClick, className = "" }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const { theme } = useTheme();

  // Init once; resize with the container; dispose on unmount.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    chartRef.current = chart;
    chart.on("click", (p) => onClickRef.current?.(p));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Push the option (and re-theme) whenever either changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (chart && option) chart.setOption(option, true);
  }, [option, theme]);

  return <div ref={elRef} className={className} style={{ width: "100%", height }} />;
}
