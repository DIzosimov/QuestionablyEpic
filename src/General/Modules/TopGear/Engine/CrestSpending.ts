import { UpgradeCost, crestCurrency, remainingUpgrades, hasCrestData, CREST_CURRENCIES } from "Databases/CrestDB";

/* ---------------------------------------------------------------------------------------------- */
/*                                        Crest spending                                          */
/* ---------------------------------------------------------------------------------------------- */
// Given what a character can afford, which upgrades to buy and in what order.
//
// Greedy by efficiency: repeatedly take the affordable upgrade that gains the most healing per crest, then look
// again. That answers the question actually being asked - "what do I spend next" - and produces an ordered list
// rather than one target set the player may not be able to reach in a single go.
//
// Every rank currently costs the same, so ranking by healing per crest comes out the same as ranking by healing.
// It's still divided through: the budget is per tier, and the day a rank costs something different this keeps
// ordering them correctly rather than silently going wrong.
//
// Greedy isn't provably optimal. It can be beaten where a cheap upgrade unlocks a much better expensive one, so
// the list is a spending order rather than a claim of the best possible outcome.

/** One rank on one item: what it lifts the item to, and what that costs. */
export type UpgradeStep = {
  item: any;
  track: string;
  fromLevel: number;
  toLevel: number;
  crest: string;
  crests: number;
};

export type PlannedPurchase = UpgradeStep & {
  gain: number;        // healing gained by taking this step
  efficiency: number;  // that gain per crest spent
  spent: { [currencyID: number]: number }; // running total after this purchase
};

export type CrestBudget = { [currencyID: number]: number };

/** The setting that overrides how many of a crest the character is treated as having. */
export const crestSettingKey = (crest: string): string => "crests" + crest;

/**
 * What the plan is allowed to spend.
 *
 * The crest boxes are seeded from the SimC import and edited from there, so they are the budget. What the import
 * read is only a fallback, for a character imported before those boxes existed.
 */
export function crestBudget(held: CrestBudget = {}, userSettings: any = {}): CrestBudget {
  const budget: CrestBudget = { ...held };

  Object.entries(CREST_CURRENCIES).forEach(([currencyID, crest]) => {
    const setting = (userSettings || {})[crestSettingKey(crest)];
    const raw = setting && typeof setting === "object" ? setting.value : setting;
    // The settings panel writes number fields through as strings.
    const amount = typeof raw === "string" ? parseInt(raw, 10) : raw;

    if (typeof amount === "number" && !isNaN(amount) && amount >= 0) budget[Number(currencyID)] = amount;
  });

  return budget;
}

/** Every rank an item could still be pushed through, cheapest first. */
export function upgradeStepsFor(item: any): UpgradeStep[] {
  if (!item || !item.upgradeTrack) return [];

  return remainingUpgrades(item.upgradeTrack, item.level).map((rank: UpgradeCost) => ({
    item,
    track: item.upgradeTrack,
    fromLevel: rank.fromLevel,
    toLevel: rank.toLevel,
    crest: rank.crest,
    crests: rank.crests,
  }));
}

const canAfford = (step: UpgradeStep, budget: CrestBudget, crests = step.crests): boolean => {
  const currency = crestCurrency(step.crest);
  if (!currency) return false; // A tier we can't identify is never spent - see CrestDB.

  return (budget[currency] || 0) >= crests;
};

const pay = (step: UpgradeStep, budget: CrestBudget): CrestBudget => ({
  ...budget,
  [crestCurrency(step.crest)]: (budget[crestCurrency(step.crest)] || 0) - step.crests,
});

/**
 * Works out what to spend, in the order to spend it.
 *
 * `gainOf` is asked what one step is worth on top of everything bought so far, which keeps the arithmetic here
 * independent of how healing is scored - the planner never evaluates a set itself. Passing the purchases along
 * matters because gear diminishes: the second upgrade of a stat is worth less than the first, so asking what each
 * step is worth against the original gear would keep overvaluing later ones.
 *
 * Ranks are sequential, so only the next unbought rank of each item is ever a candidate: an item can't jump to its
 * third rank without buying its second.
 */
export function planCrestSpending(items: any[], budget: CrestBudget,
                                  gainOf: (step: UpgradeStep, bought: UpgradeStep[]) => number): PlannedPurchase[] {
  if (!hasCrestData()) return [];

  // The remaining ranks of each item, in order. Taking a step shifts that item's queue forward.
  const queues = (items || []).map((item) => upgradeStepsFor(item)).filter((steps) => steps.length > 0);
  const plan: PlannedPurchase[] = [];
  let remaining: CrestBudget = { ...budget };
  const spent: { [currencyID: number]: number } = {};

  while (true) {
    let best: { step: UpgradeStep; gain: number; efficiency: number; queue: UpgradeStep[]; upTo: number; crests: number } | null = null;

    queues.forEach((queue) => {
      // Every level this piece could be taken to, not just its next rank. A piece that isn't currently worn has
      // to clear the one in its slot before it gains anything at all, so its first rank alone reads as worthless
      // and a rank-at-a-time search would never buy into it. Costing the whole climb lets it compete.
      let crests = 0;
      for (let rank = 0; rank < queue.length; rank++) {
        crests += queue[rank].crests;
        if (!canAfford(queue[rank], remaining, crests)) break;

        const gain = gainOf(queue[rank], plan);
        // An upgrade that gains nothing is not worth a crest, however cheap it is.
        if (gain <= 0) continue;

        const efficiency = gain / Math.max(1, crests);
        if (!best || efficiency > best.efficiency) best = { step: queue[rank], gain, efficiency, queue, upTo: rank, crests };
      }
    });

    if (!best) return plan;

    const { step, gain, efficiency, queue, upTo, crests } = best;
    // The whole climb is bought at once, and recorded as the single decision it is: one piece, from where it is
    // now to where it ends up, for what that costs.
    const bought: UpgradeStep = { ...step, fromLevel: queue[0].fromLevel, crests };
    remaining = pay(bought, remaining);
    spent[crestCurrency(bought.crest)] = (spent[crestCurrency(bought.crest)] || 0) + crests;

    plan.push({ ...bought, gain, efficiency, spent: { ...spent } });
    queue.splice(0, upTo + 1);
  }
}
