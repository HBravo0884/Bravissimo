import { useMemo, useRef, useState } from "react";

export interface Point {
  t: number;
  y: number;
  tip: string[];
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * One series over time: 2px line, 8px markers, recessive grid, and a crosshair
 * tooltip on hover/touch. The chart's title (outside) names the series.
 */
export function LineChart({
  points,
  color,
  yMax,
  yFormat = (v) => String(Math.round(v)),
  height = 220,
  label,
}: {
  points: Point[];
  color: string;
  yMax?: number;
  yFormat?: (v: number) => string;
  height?: number;
  label: string;
}) {
  const W = 640;
  const H = height;
  const M = { l: 44, r: 14, t: 12, b: 28 };
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const ts = points.map((p) => p.t);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const span = t1 - t0 || 1;
    const top = yMax ?? niceMax(Math.max(...points.map((p) => p.y), 1));
    const x = (t: number) => (points.length === 1 ? (M.l + W - M.r) / 2 : M.l + ((t - t0) / span) * (W - M.l - M.r));
    const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
    return { x, y, top, t0, t1 };
  }, [points, yMax, H, M.l, M.r, M.t, M.b]);

  if (!points.length) return <div className="empty small">No games yet.</div>;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * geo.top);
  const d = points.map((p, i) => `${i ? "L" : "M"}${geo.x(p.t).toFixed(1)} ${geo.y(p.y).toFixed(1)}`).join(" ");

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(geo.x(p.t) - sx);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="gridline" x1={M.l} x2={W - M.r} y1={geo.y(v)} y2={geo.y(v)} />
            <text className="axis-label" x={M.l - 8} y={geo.y(v) + 4} textAnchor="end">
              {yFormat(v)}
            </text>
          </g>
        ))}
        <text className="axis-label" x={M.l} y={H - 8}>
          {fmtDate(geo.t0)}
        </text>
        {geo.t1 !== geo.t0 && (
          <text className="axis-label" x={W - M.r} y={H - 8} textAnchor="end">
            {fmtDate(geo.t1)}
          </text>
        )}
        {hp && <line className="crosshair" x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={M.t} y2={H - M.b} />}
        <path d={d} className="series-line" style={{ stroke: color }} />
        {points.map((p, i) => (
          <circle key={i} cx={geo.x(p.t)} cy={geo.y(p.y)} r={hover === i ? 6 : 4} fill={color} stroke="var(--surface)" strokeWidth={2} />
        ))}
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: `${(geo.x(hp.t) / W) * 100}%`, top: `${(geo.y(hp.y) / H) * 100}%` }}>
          {hp.tip.map((line, i) => (
            <div key={i} style={i === 0 ? { fontWeight: 700 } : { color: "var(--ink-2)" }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for the roster; no axes, the column header names it. */
export function Sparkline({ values, max = 1, width = 120, height = 32, label }: { values: number[]; max?: number; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <span className="tiny muted">{values.length ? "1 game" : "—"}</span>;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => 3 + (1 - v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={3} fill="var(--accent)" />
    </svg>
  );
}
