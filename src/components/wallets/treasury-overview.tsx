"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import { TreasuryBalanceBars, TreasuryVolumeArea } from "./treasury-graphics";

export type UsdTreasurySnapshot = {
  balanceCents: number;
  balanceHistoryCents: readonly number[];
  volumeHistoryCents: readonly number[];
  periodLabel: string;
  startLabel: string;
  endLabel: string;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cardClass = "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card";
const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function UsdMark() {
  return <svg viewBox="0 0 36 26" className="h-6 w-8 shrink-0 overflow-hidden rounded-sm" aria-hidden="true">
    <rect width="36" height="26" fill="#fff" />
    {Array.from({ length: 7 }, (_, row) => <rect key={row} y={row * 4} width="36" height="2" fill="#e86868" />)}
    <rect width="15" height="14" fill="#465994" />
    {Array.from({ length: 12 }, (_, index) => <circle key={index} cx={2.5 + index % 3 * 5} cy={2 + Math.floor(index / 3) * 3.2} r=".8" fill="#fff" />)}
  </svg>;
}

export function TreasuryOverview({ data, onWalletDetails, onViewPayments, onViewPayouts }: {
  data: UsdTreasurySnapshot;
  onWalletDetails: () => void;
  onViewPayments: () => void;
  onViewPayouts: () => void;
}) {
  const volumeCents = data.volumeHistoryCents.reduce((sum, value) => sum + value, 0);
  return <div className="grid gap-4 md:grid-cols-2">
    <section className={cardClass} aria-label="USD treasury balance">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><UsdMark />USD</h2>
          <span className="text-xs text-muted-foreground">{data.periodLabel}</span>
        </div>
        <p className="mt-4 break-words text-4xl font-medium leading-tight tracking-tight tabular-nums sm:text-[42px]">{usd.format(data.balanceCents / 100)}</p>
        <p className="mt-1 text-sm text-muted-foreground">Available balance</p>
      </div>
      <div className="mt-4 px-5 sm:px-6">
        <TreasuryBalanceBars values={data.balanceHistoryCents} label={`USD balance history, ending at ${usd.format(data.balanceCents / 100)}`} className="h-44 w-full sm:h-48" />
        <div className="mt-3 flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{data.startLabel}</span><span>{data.endLabel}</span></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2 sm:px-4">
        <button type="button" onClick={onViewPayouts} className={actionClass}><ArrowUpRight className="size-4" aria-hidden="true" />Payouts</button>
        <button type="button" onClick={onWalletDetails} className={actionClass}>Wallet details<ChevronRight className="size-4" aria-hidden="true" /></button>
      </div>
    </section>
    <section className={cardClass} aria-label="USD payment volume">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex min-h-7 items-center justify-between gap-3"><h2 className="text-sm font-medium text-muted-foreground">Payment volume</h2><span className="text-xs text-muted-foreground">{data.periodLabel}</span></div>
        <p className="mt-4 break-words text-4xl font-medium leading-tight tracking-tight tabular-nums sm:text-[42px]">{usd.format(volumeCents / 100)}</p>
        <p className="mt-1 text-sm text-muted-foreground">Total processed</p>
      </div>
      <div className="mt-4 px-5 sm:px-6">
        <TreasuryVolumeArea values={data.volumeHistoryCents} label={`Daily USD payment volume, ${usd.format(volumeCents / 100)} total`} className="h-44 w-full sm:h-48" />
        <div className="mt-3 flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{data.startLabel}</span><span>{data.endLabel}</span></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 px-5 py-2 sm:px-6">
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-pink-400" />Payment activity</span>
        <button type="button" onClick={onViewPayments} className={actionClass}>View payments<ArrowUpRight className="size-4" aria-hidden="true" /></button>
      </div>
    </section>
  </div>;
}
