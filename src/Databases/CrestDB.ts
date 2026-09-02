/* ---------------------------------------------------------------------------------------------- */
/*                                     Upgrade costs and crests                                   */
/* ---------------------------------------------------------------------------------------------- */
// What it costs to push an item up its upgrade track, and which currency pays for it.
//
// Both tables below are game data the app has no way to derive, so both are deliberately empty rather than
// guessed. Nothing here is inferred from item levels or track names: attributing a character's crests to the
// wrong tier, or mispricing a rank, produces recommendations that are confidently wrong and look entirely
// plausible - you'd be told to spend crests you don't have and to skip upgrades you can afford.
//
// The planner treats an empty table as "we can't price this" and returns no plan, which is why the crest spending
// feature reports that it has no cost data rather than showing a wrong one.

/** Valorstones, which every upgrade costs alongside its crests. */
export const VALORSTONE_CURRENCY = 1792;

/**
 * Which crest tier each SimC currency id is.
 *
 * Confirmed by matching a character's exact in-game amounts against their export's `upgrade_currencies` line. All
 * five amounts were distinct, so each id has exactly one tier it can be. Two later exports agree: the Adventurer
 * and Myth counts moved between them while the rest held, which is what earning those crests looks like.
 *
 * The names match the upgrade track names in CONSTANTS.itemLevelCaps, which is what lets a track be priced.
 */
export const CREST_CURRENCIES: { [currencyID: number]: string } = {
  3442: "Adventurer", // 338
  3443: "Veteran",    // 500
  3444: "Champion",   // 100
  3445: "Hero",       // 25
  3446: "Myth",       // 84
};

/** One rank of one track: what it lifts the item to, and what it costs. */
export type UpgradeCost = {
  fromLevel: number;
  toLevel: number;
  crest: string;      // the tier name, as used in CREST_CURRENCIES
  crests: number;
  valorstones: number;
};

/**
 * The ranks of each upgrade track, cheapest first.
 *
 * Keyed by the track names the app already uses - Adventurer, Veteran, Champion, Hero, Myth, Runed Crafted and
 * Gilded Crafted, per CONSTANTS.itemLevelCaps.
 */
export const UPGRADE_COSTS: { [track: string]: UpgradeCost[] } = {};

/** Whether we know enough to price upgrades at all. */
export const hasCrestData = (): boolean =>
  Object.keys(CREST_CURRENCIES).length > 0 && Object.keys(UPGRADE_COSTS).length > 0;

/** The currency id a crest tier is held as, or 0 when we don't know that tier. */
export const crestCurrency = (crest: string): number => {
  const found = Object.entries(CREST_CURRENCIES).find(([, name]) => name === crest);
  return found ? Number(found[0]) : 0;
};

/** The ranks still available to an item, from where it is now to the top of its track. */
export const remainingUpgrades = (track: string, level: number): UpgradeCost[] =>
  (UPGRADE_COSTS[track] || []).filter((rank) => rank.fromLevel >= level);
