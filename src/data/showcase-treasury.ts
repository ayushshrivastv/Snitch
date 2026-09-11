/** Presentation-only USD figures approved for the Snitchpay.co showcase.
 * These never participate in wallet balances, payout limits, or transaction signing.
 */
export const showcaseUsdTreasury = {
  balanceCents: 0,
  balanceHistoryCents: [1_946_000, 1_938_000, 1_973_000, 1_946_000, 2_075_000, 2_134_000, 2_322_000, 2_558_000, 2_821_000, 3_095_000, 3_610_000, 4_158_000, 4_434_000, 4_716_000, 0],
  volumeHistoryCents: [3_949, 4_997, 4_906, 7_116, 7_066, 12_213, 12_283, 13_821, 13_025, 12_426, 13_336, 13_680, 19_808, 19_063, 18_613, 17_329, 18_674, 24_989, 26_750, 25_650, 24_336, 25_301, 26_027, 30_446, 29_566, 27_867, 31_285, 37_041, 38_411, 40_026],
  periodLabel: "30-day overview",
  volumePeriodLabel: "Last 3 days",
  volumeStartLabel: "Sep 9",
  startLabel: "Aug 13",
  endLabel: "Sep 11",
} as const;
