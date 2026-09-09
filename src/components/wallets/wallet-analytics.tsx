"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { buildWalletActivityChart, formatExactEthAmount } from "@/lib/wallet-chart-data";
import type { WalletActivity } from "@/lib/wallet-activity";
import { cn } from "@/lib/utils";

// Preserve the workspace's existing violet/pink series identity across both charts.
const colors = ["#8972e8", "#f5a5c5"];
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function WalletAnalytics({ activity }: { activity: WalletActivity[] }) {
  const [range, setRange] = useState<"7d" | "30d" | "all">("all");
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const chart = useMemo(() => buildWalletActivityChart(activity, { range }), [activity, range]);
  const id = useId().replace(/:/g, "");
  const max = Math.max(0, ...chart.daily.flatMap(day => [Number(day.received), Number(day.paidOut)]));
  const active = chart.daily.find(day => day.date === activeDate);
  const totalVolume = Number(chart.totals.totalVolume);

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
    <section className="flex min-w-0 flex-col rounded-md border border-border bg-card" aria-label="Payment volume chart">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div><h2 className="text-sm font-semibold tracking-tight">Payment volume</h2><p className="mt-1 text-xs text-muted-foreground">Incoming payments and outgoing payouts</p></div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5" role="group" aria-label="Chart date range">{([['7d', '7D'], ['30d', '30D'], ['all', 'All']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={range === value} onClick={() => { setRange(value); setActiveDate(null); }} className={cn("min-h-10 min-w-10 rounded-sm px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none", range === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{label}</button>)}</div>
      </header>
      <div className="grid grid-cols-1 gap-4 px-4 pt-5 min-[480px]:grid-cols-2 min-[480px]:gap-6 sm:px-5">
        <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowDownLeft aria-hidden="true" className="size-3.5" />Received</p><p className="mt-1.5 break-all text-lg font-semibold tracking-tight tabular-nums">{formatExactEthAmount(chart.totals.received)} <span className="text-xs font-normal text-muted-foreground">ETH</span></p></div>
        <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowUpRight aria-hidden="true" className="size-3.5" />Sent</p><p className="mt-1.5 break-all text-lg font-semibold tracking-tight tabular-nums">{formatExactEthAmount(chart.totals.paidOut)} <span className="text-xs font-normal text-muted-foreground">ETH</span></p></div>
      </div>
      <div className="mx-4 mb-4 mt-6 sm:mx-5">
      <div className="relative pl-10">
        <div aria-hidden="true" className="pointer-events-none absolute bottom-7 left-0 top-0 flex w-9 flex-col justify-between text-[11px] leading-none text-muted-foreground">{[0,1,2,3].map(line => <span key={line}>{(max * (1 - line / 3)).toLocaleString("en-US", {maximumSignificantDigits:3})}</span>)}</div>
        <svg viewBox="0 0 760 180" preserveAspectRatio="none" className="h-40 w-full overflow-visible sm:h-44" role="group" aria-label="Daily received and sent ETH. Focus a date to view its amounts.">
          <defs><linearGradient id={`${id}-received`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#8972e8" /><stop offset="100%" stopColor="#c8bdff" /></linearGradient><linearGradient id={`${id}-sent`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#ec93b7" /><stop offset="100%" stopColor="#f7c7de" /></linearGradient></defs>
          {[0, 1, 2, 3].map(line => <line key={line} x1="0" x2="760" y1={12 + line * 56} y2={12 + line * 56} stroke="currentColor" className="text-border/60" />)}
          {chart.daily.map((day, index) => {
            const column = 760 / Math.max(chart.daily.length, 1);
            const barWidth = Math.min(28, column * .3);
            const firstDay = Date.parse(chart.daily[0].date);
            const lastDay = Date.parse(chart.daily[chart.daily.length - 1].date);
            const x = chart.dailyIsSparse && lastDay > firstDay ? 28 + (Date.parse(day.date) - firstDay) / (lastDay - firstDay) * 704 : (index + .5) * column;
            const receivedHeight = max ? Number(day.received) / max * 168 : 0;
            const sentHeight = max ? Number(day.paidOut) / max * 168 : 0;
            return <g key={day.date} tabIndex={0} role="img" aria-label={`${dateLabel(day.date)}: received ${formatExactEthAmount(day.received)} ETH, sent ${formatExactEthAmount(day.paidOut)} ETH`} onMouseEnter={() => setActiveDate(day.date)} onMouseLeave={() => setActiveDate(null)} onFocus={() => setActiveDate(day.date)} onBlur={() => setActiveDate(null)} className="outline-none focus-visible:[&>rect:first-of-type]:stroke-foreground">
              <title>{`${dateLabel(day.date)} · Received ${formatExactEthAmount(day.received)} ETH · Sent ${formatExactEthAmount(day.paidOut)} ETH`}</title>
              <rect x={x - column / 2 + 2} y="4" width={Math.max(1, column - 4)} height="178" rx="3" fill={activeDate === day.date ? "#8972e810" : "transparent"} />
              <rect x={x - barWidth - 2} y={180 - receivedHeight} width={barWidth} height={receivedHeight} rx="2" fill={`url(#${id}-received)`} />
              <rect x={x + 2} y={180 - sentHeight} width={barWidth} height={sentHeight} rx="2" fill={`url(#${id}-sent)`} />
            </g>;
          })}
        </svg>
        <div aria-hidden="true" className="relative mt-2 h-5 text-[11px] text-muted-foreground">{chart.daily.map((day, index) => {
          const show = chart.daily.length <= 7 || index === 0 || index === chart.daily.length - 1 || index % Math.ceil(chart.daily.length / 4) === 0;
          const first = Date.parse(chart.daily[0].date), last = Date.parse(chart.daily[chart.daily.length - 1].date);
          const position = chart.dailyIsSparse && last > first ? (28 + (Date.parse(day.date) - first) / (last - first) * 704) / 760 * 100 : (index + .5) / chart.daily.length * 100;
          return show ? <span key={day.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{left:`${position}%`}}>{dateLabel(day.date)}</span> : null;
        })}</div>
        {!max ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-7"><span className="rounded-md border border-border bg-card px-3 py-2 text-center text-xs text-muted-foreground">No completed transfers in this period</span></div> : null}
      </div>
      </div>
      <div className="mt-auto flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5" aria-live="polite">{active ? <><span className="font-medium text-foreground">{dateLabel(active.date)}</span><span className="break-all">Received {formatExactEthAmount(active.received)} ETH</span><span className="break-all">Sent {formatExactEthAmount(active.paidOut)} ETH</span></> : <><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-[#8972e8]" />Received</span><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-[#ec93b7]" />Sent</span><span className="ml-auto tabular-nums">{chart.totals.count} completed transfers</span></>}</div>
    </section>

    <section className="flex min-w-0 flex-col rounded-md border border-border bg-card" aria-label="Activity by network">
      <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5"><div><h2 className="text-sm font-semibold tracking-tight">Activity by network</h2><p className="mt-1 text-xs text-muted-foreground">Share of completed payment volume</p></div><span className="shrink-0 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">ETH</span></header>
      <div className="flex flex-1 items-center justify-center px-4 py-5">
      <div className="relative size-40">
        <svg viewBox="0 0 180 180" role="img" aria-label={`${chart.totals.count} completed transfers across ${chart.networks.length} networks`} className="size-full -rotate-90">
          <circle cx="90" cy="90" r="70" fill="none" stroke="currentColor" strokeWidth="17" className="text-muted" />
          {chart.networks.map((network, index) => {
            const share = totalVolume ? Number(network.volume) / totalVolume * 100 : 0;
            const start = totalVolume ? chart.networks.slice(0, index).reduce((sum, item) => sum + Number(item.volume), 0) / totalVolume * 100 : 0;
            return <circle key={network.network} cx="90" cy="90" r="70" pathLength="100" fill="none" stroke={colors[index % colors.length]} strokeWidth="17" strokeDasharray={`${Math.max(0, share - (share === 100 ? 0 : .9))} ${100 - Math.max(0, share - (share === 100 ? 0 : .9))}`} strokeDashoffset={-start}><title>{`${network.network}: ${network.count} transfers`}</title></circle>;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold tracking-tight tabular-nums">{chart.totals.count}</span><span className="mt-1 text-xs text-muted-foreground">Transfers</span></div>
      </div>
      </div>
      <div className="divide-y divide-border border-t border-border">{chart.networks.length ? chart.networks.map((network, index) => <div key={network.network} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5"><span className="flex items-center gap-2 text-xs font-medium"><span className="size-2 shrink-0 rounded-sm" style={{ background: colors[index % colors.length] }} />{network.network === "Base Sepolia" ? "ETH · Base" : "ETH · Ethereum"}</span><span className="text-xs tabular-nums text-muted-foreground">{totalVolume ? Math.round(Number(network.volume) / totalVolume * 100) : 0}% <span className="mx-1" aria-hidden="true">·</span> {network.count} transfers</span></div>) : <p className="px-4 py-4 text-center text-xs text-muted-foreground">Network activity will appear after your first completed transfer.</p>}</div>
    </section>
  </div>;
}
