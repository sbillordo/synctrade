// eToro cost assumptions for the trade simulator. Saved on this device and edited in Settings.
// Defaults checked against eToro order tickets (NVDA, Nov 2026): $1 commission per side at x1; at x2 and x5 a 0.15%
// spread per side and an overnight fee of ~10.2% a year on the whole exposure ($250 at x5 -> $0.07 a night,
// $0.21 the weekend night). eToro sets the overnight rate per instrument: compare with the ticket and adjust.

export type Costs = {
  commission: number; // $ per side on real stocks (x1)
  cfdSpread: number;  // % of trade value per side on leveraged positions (CFD)
  overnight: number;  // % a year on the whole exposure of a leveraged position, charged every night (x3 one weekday)
  fx: number;         // % per EUR <-> USD conversion (0 when the account already holds dollars)
};

export const DEFAULT_COSTS: Costs = { commission: 1, cfdSpread: 0.15, overnight: 10.2, fx: 0 };

export const LEVERAGES = [1, 2, 5]; // EU retail limit on stocks is x5
