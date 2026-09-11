"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type TreasuryGraphicProps = {
  values: readonly number[];
  label: string;
  className?: string;
};

type Point = { x: number; y: number };

const WIDTH = 640;
const HEIGHT = 180;
const BASELINE = 174;
const PLOT_HEIGHT = 150;

// These scoped chart tokens preserve the violet/coral series identity of the
// treasury reference while allowing a parent theme to override the palette.
const palette = {
  bar: "var(--treasury-bar, #a579ff)",
  barTop: "var(--treasury-bar-top, #b184ff)",
  barCap: "var(--treasury-bar-cap, #d2c7ff)",
  volumeLine: "var(--treasury-volume-line, #ff8aaf)",
  volumePink: "var(--treasury-volume-pink, #ff8dbb)",
  volumeCoral: "var(--treasury-volume-coral, #ff9d9f)",
  volumeBloom: "var(--treasury-volume-bloom, #ffd7eb)",
};

function nonnegativeSeries(values: readonly number[]) {
  return values.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0);
}

function roundedTopBar(x: number, y: number, width: number, height: number) {
  const radius = Math.min(8, width / 3, height / 2);
  return `M ${x} ${y + height} V ${y + radius} Q ${x} ${y} ${x + radius} ${y} H ${x + width - radius} Q ${x + width} ${y} ${x + width} ${y + radius} V ${y + height} Z`;
}

// Harmonic-mean tangents keep the curve within each pair of observations. This
// rounds the joins without creating an extra peak or dipping below zero.
function smoothPath(points: Point[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const slopes = points.slice(1).map((point, index) => (
    (point.y - points[index].y) / (point.x - points[index].x)
  ));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];
    const before = slopes[index - 1];
    const after = slopes[index];
    return before * after > 0 ? 2 * before * after / (before + after) : 0;
  });

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const step = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + step} ${previous.y + tangents[index] * step}, ${point.x - step} ${point.y - tangents[index + 1] * step}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function EmptySeries({ titleId }: { titleId: string }) {
  return (
    <g>
      <desc id={titleId}>There are no positive values in this series.</desc>
      <line
        x1="4"
        x2={WIDTH - 4}
        y1={BASELINE}
        y2={BASELINE}
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-border"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={WIDTH / 2}
        y={HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        className="fill-muted-foreground text-xs"
      >
        No activity yet
      </text>
    </g>
  );
}

export function TreasuryBalanceBars({ values, label, className }: TreasuryGraphicProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const series = nonnegativeSeries(values);
  const maximum = series.reduce((highest, value) => Math.max(highest, value), 0);
  const column = WIDTH / Math.max(series.length, 1);
  const barWidth = Math.min(40, column * 0.67);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      aria-describedby={!maximum ? `${id}-empty` : undefined}
      className={cn("block h-44 w-full overflow-visible", className)}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.barTop} />
          <stop offset="100%" stopColor={palette.bar} />
        </linearGradient>
      </defs>
      {maximum ? series.map((value, index) => {
        const height = value / maximum * PLOT_HEIGHT;
        const x = (index + 0.5) * column - barWidth / 2;
        const y = BASELINE - height;
        // Both layers belong to one bar; the pale cap is part of its value.
        const capHeight = Math.min(height * 0.22, 26);

        return height > 0 ? (
          <g key={index}>
            <path
              d={roundedTopBar(x, y, barWidth, height)}
              fill={palette.barCap}
            />
            <path
              d={roundedTopBar(x, y + capHeight, barWidth, height - capHeight)}
              fill={`url(#${id}-bar)`}
            />
          </g>
        ) : (
          <line
            key={index}
            x1={x}
            x2={x + barWidth}
            y1={BASELINE}
            y2={BASELINE}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="text-border"
          />
        );
      }) : <EmptySeries titleId={`${id}-empty`} />}
    </svg>
  );
}

export function TreasuryVolumeArea({ values, label, className }: TreasuryGraphicProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const series = nonnegativeSeries(values);
  const maximum = series.reduce((highest, value) => Math.max(highest, value), 0);
  const points = series.map((value, index) => ({
    x: series.length === 1 ? WIDTH / 2 : 4 + index / (series.length - 1) * (WIDTH - 8),
    y: maximum ? BASELINE - value / maximum * PLOT_HEIGHT : BASELINE,
  }));
  const line = smoothPath(points);
  const area = points.length > 1
    ? `${line} L ${points[points.length - 1].x} ${BASELINE} L ${points[0].x} ${BASELINE} Z`
    : "";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      aria-describedby={!maximum ? `${id}-empty` : undefined}
      className={cn("block h-44 w-full overflow-visible", className)}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.volumeCoral} />
          <stop offset="28%" stopColor={palette.volumePink} />
          <stop offset="48%" stopColor={palette.volumeBloom} />
          <stop offset="70%" stopColor={palette.volumeCoral} />
          <stop offset="100%" stopColor={palette.volumePink} />
        </linearGradient>
        <filter id={`${id}-grain`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="8" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.16" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="grain" />
          <feBlend in="SourceGraphic" in2="grain" mode="multiply" />
        </filter>
      </defs>
      {maximum ? (
        <g>
          {area ? <path d={area} fill={`url(#${id}-fill)`} filter={`url(#${id}-grain)`} /> : null}
          <path
            d={line}
            fill="none"
            stroke={palette.volumeLine}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.length === 1 ? (
            <circle cx={points[0].x} cy={points[0].y} r="3" fill={palette.volumeLine} />
          ) : null}
        </g>
      ) : <EmptySeries titleId={`${id}-empty`} />}
    </svg>
  );
}
