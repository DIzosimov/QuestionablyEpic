import { CONSTANTS } from "General/Engine/CONSTANTS";

/* ---------------------------------------------------------------------------------------------- */
/*                                     Upgrade costs and crests                                   */
/* ---------------------------------------------------------------------------------------------- */
// What it costs to push an item up its upgrade track, and which currency pays for it.
//
// Attributing a character's crests to the wrong tier, or mispricing a rank, produces recommendations that are
// confidently wrong and look entirely plausible - you'd be told to spend crests you don't have and to skip
// upgrades you can afford. So the tier names below were confirmed against a real character rather than inferred,
// and the crafted tracks are left unpriced rather than guessed at.
//
// Valorstones are not modelled: that system is gone.

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
};

/** Every rank costs the same, so the table below is derived rather than typed out. */
export const CRESTS_PER_UPGRADE = 20;

// Crafted gear doesn't climb a ladder. It's made at a base level for no crests at all, and one payment lifts it to
// its track's ceiling: Hero crests for a Runed piece, Myth crests for a Gilded one.
export const CRAFTED_BASE_LEVEL = 305;
export const CRAFTED_UPGRADE_CRESTS = 80;
// Named for the crest that pays for them. The Runed / Gilded names are the previous expansion's, kept so gear
// saved under them is still priced rather than silently dropping out of a plan.
const CRAFTED_TRACKS: { [track: string]: string } = {
  "Hero Crafted": "Hero", "Myth Crafted": "Myth",
  "Runed Crafted": "Hero", "Gilded Crafted": "Myth",
};

/**
 * The ranks of each upgrade track, cheapest first.
 *
 * Derived rather than hand written: a rank is one step up the item level ladder, every rank costs the same, and a
 * track is paid for with the crest of its own name. That leaves nothing to keep in step by hand except the ladder
 * and the caps, which the app already had.
 *
 * The crafted tracks are the exception: one payment from the base level to the ceiling, rather than a ladder.
 */
export const UPGRADE_COSTS: { [track: string]: UpgradeCost[] } = Object.keys(CONSTANTS.itemLevelCaps)
  .filter((track) => Object.values(CREST_CURRENCIES).includes(track))
  .reduce((tracks: { [track: string]: UpgradeCost[] }, track) => {
    const levels = CONSTANTS.fullItemLevels.filter((level: number) => level <= CONSTANTS.itemLevelCaps[track]);

    tracks[track] = levels.slice(0, -1).map((fromLevel: number, i: number) => ({
      fromLevel,
      toLevel: levels[i + 1],
      crest: track,
      crests: CRESTS_PER_UPGRADE,
    }));
    return tracks;
  }, Object.entries(CRAFTED_TRACKS).reduce((tracks: { [track: string]: UpgradeCost[] }, [track, crest]) => {
    tracks[track] = [{
      fromLevel: CRAFTED_BASE_LEVEL,
      toLevel: CONSTANTS.itemLevelCaps[track],
      crest,
      crests: CRAFTED_UPGRADE_CRESTS,
    }];
    return tracks;
  }, {}));

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
