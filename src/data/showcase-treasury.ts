/** Presentation-only USD figures approved for the Snitchpay.co showcase.
 * These never participate in wallet balances, payout limits, or transaction signing.
 */
export const showcaseUsdTreasury = {
  balanceCents: 9_800,
  balanceHistoryCents: [1_946_000, 1_938_000, 1_973_000, 1_946_000, 2_075_000, 2_134_000, 2_322_000, 2_558_000, 2_821_000, 3_095_000, 3_610_000, 4_158_000, 4_434_000, 4_716_000, 9_800],
  volumeHistoryCents: [4_489, 5_681, 5_577, 8_090, 8_033, 13_884, 13_964, 15_712, 14_807, 14_126, 15_161, 15_552, 22_518, 21_672, 21_160, 19_700, 21_229, 28_408, 30_410, 29_160, 27_666, 28_763, 29_588, 34_612, 33_612, 31_680, 35_566, 42_110, 43_667, 45_503],
  periodLabel: "30-day overview",
  volumePeriodLabel: "Last 3 days",
  volumeStartLabel: "Sep 9",
  startLabel: "Aug 13",
  endLabel: "Sep 11",
} as const;
