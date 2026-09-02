import { UpgradeCost, crestCurrency, remainingUpgrades, hasCrestData } from "Databases/CrestDB";

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

const canAfford = (step: UpgradeStep, budget: CrestBudget): boolean => {
  const currency = crestCurrency(step.crest);
  if (!currency) return false; // A tier we can't identify is never spent - see CrestDB.

  return (budget[currency] || 0) >= step.crests;
};

const pay = (step: UpgradeStep, budget: CrestBudget): CrestBudget => ({
  ...budget,
  [crestCurrency(step.crest)]: (budget[crestCurrency(step.crest)] || 0) - step.crests,
});

/**
 * Works out what to spend, in the order to spend it.
 *
 * `gainOf` is asked what one step is worth, which keeps the arithmetic here independent of how healing is scored -
 * the planner never evaluates a set itself.
 *
 * Ranks are sequential, so only the next unbought rank of each item is ever a candidate: an item can't jump to its
 * third rank without buying its second.
 */
export function planCrestSpending(items: any[], budget: CrestBudget, gainOf: (step: UpgradeStep) => number): PlannedPurchase[] {
  if (!hasCrestData()) return [];

  // The remaining ranks of each item, in order. Taking a step shifts that item's queue forward.
  const queues = (items || []).map((item) => upgradeStepsFor(item)).filter((steps) => steps.length > 0);
  const plan: PlannedPurchase[] = [];
  let remaining: CrestBudget = { ...budget };
  const spent: { [currencyID: number]: number } = {};

  while (true) {
    let best: { step: UpgradeStep; gain: number; efficiency: number; queue: UpgradeStep[] } | null = null;

    queues.forEach((queue) => {
      const step = queue[0];
      if (!step || !canAfford(step, remaining)) return;

      const gain = gainOf(step);
      // An upgrade that gains nothing is not worth a crest, however cheap it is.
      if (gain <= 0) return;

      const efficiency = gain / Math.max(1, step.crests);
      if (!best || efficiency > best.efficiency) best = { step, gain, efficiency, queue };
    });

    if (!best) return plan;

    const { step, gain, efficiency, queue } = best;
    remaining = pay(step, remaining);
    spent[crestCurrency(step.crest)] = (spent[crestCurrency(step.crest)] || 0) + step.crests;

    plan.push({ ...step, gain, efficiency, spent: { ...spent } });
    queue.shift();
  }
}
