import { planCrestSpending, upgradeStepsFor } from "./CrestSpending";
import * as CrestDB from "Databases/CrestDB";

/*
  Spending crests.

  The real cost tables are empty - which crest each currency id is, and what each rank costs, are game data the app
  can't derive, and guessing either produces recommendations that are wrong in a way nothing in the output betrays.
  So the arithmetic is tested against a stand-in table here, and dropping the real numbers in changes no code.
*/

const HERO = 3445, MYTH = 3446;

// A stand-in table with ranks priced differently per track, so the ordering below tests healing per crest rather
// than just healing. The real table charges the same for every rank, which would make the two indistinguishable.
const COSTS = {
  Hero: [
    { fromLevel: 321, toLevel: 324, crest: "Hero", crests: 15 },
    { fromLevel: 324, toLevel: 328, crest: "Hero", crests: 15 },
  ],
  Myth: [
    { fromLevel: 331, toLevel: 334, crest: "Myth", crests: 10 },
  ],
};

beforeEach(() => {
  jest.spyOn(CrestDB, "hasCrestData").mockReturnValue(true);
  jest.spyOn(CrestDB, "crestCurrency").mockImplementation((crest) => (crest === "Hero" ? HERO : crest === "Myth" ? MYTH : 0));
  jest.spyOn(CrestDB, "remainingUpgrades").mockImplementation((track, level) =>
    (COSTS[track] || []).filter((rank) => rank.fromLevel >= level));
});
afterEach(() => jest.restoreAllMocks());

const item = (name, track, level) => ({ name, upgradeTrack: track, level });
const flat = (gain) => () => gain;

describe("Working out what to spend crests on", () => {
  test("an item's remaining ranks are the ones above where it is", () => {
    expect(upgradeStepsFor(item("boots", "Hero", 321)).map((s) => s.toLevel)).toEqual([324, 328]);
    expect(upgradeStepsFor(item("boots", "Hero", 324)).map((s) => s.toLevel)).toEqual([328]);
    expect(upgradeStepsFor(item("boots", "Hero", 328))).toEqual([]);
  });

  test("an item with no upgrade track has nothing to buy", () => {
    expect(upgradeStepsFor(item("trinket", "", 300))).toEqual([]);
    expect(upgradeStepsFor(null)).toEqual([]);
  });

  test("the most healing per crest is bought first", () => {
    const boots = item("boots", "Hero", 321);
    const chest = item("chest", "Myth", 331);
    // The chest gains less in total but costs fewer crests, so it's the better buy.
    const gains = (step) => (step.item === chest ? 80 : 100);

    const plan = planCrestSpending([boots, chest], { [HERO]: 100, [MYTH]: 100 }, gains);

    expect(plan[0].item).toBe(chest);   // 80 / 10 crests beats 100 / 15.
    expect(plan[0].efficiency).toBeGreaterThan(plan[1].efficiency);
  });

  test("it stops when the crests run out", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 15 }, flat(50));

    // Enough for the first rank only, even though a second is available.
    expect(plan).toHaveLength(1);
    expect(plan[0].toLevel).toEqual(324);
  });

  test("ranks are bought in order, never skipped", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 100 }, flat(50));

    expect(plan.map((p) => p.toLevel)).toEqual([324, 328]);
  });

  test("an upgrade that gains nothing isn't bought at any price", () => {
    const boots = item("boots", "Hero", 321);
    expect(planCrestSpending([boots], { [HERO]: 999 }, flat(0))).toEqual([]);
    expect(planCrestSpending([boots], { [HERO]: 999 }, flat(-5))).toEqual([]);
  });

  test("the running total says what each purchase has cost so far", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 100 }, flat(50));

    expect(plan[0].spent[HERO]).toEqual(15);
    expect(plan[1].spent[HERO]).toEqual(30);
  });

  test("a crest tier we can't identify is never spent", () => {
    CrestDB.crestCurrency.mockReturnValue(0);
    const boots = item("boots", "Hero", 321);

    expect(planCrestSpending([boots], { [HERO]: 999 }, flat(50))).toEqual([]);
  });

  test("with no cost data at all there is no plan, rather than a wrong one", () => {
    CrestDB.hasCrestData.mockReturnValue(false);
    const boots = item("boots", "Hero", 321);

    expect(planCrestSpending([boots], { [HERO]: 999 }, flat(50))).toEqual([]);
  });

  test("nothing to upgrade is an empty plan, not a crash", () => {
    expect(planCrestSpending([], { [HERO]: 100 }, flat(50))).toEqual([]);
    expect(planCrestSpending(null, {}, flat(50))).toEqual([]);
  });
});

/*
  The real cost table, derived rather than typed out: a rank is one step up the item level ladder, every rank costs
  the same, and a track is paid for with the crest of its own name.
*/
describe("What an upgrade really costs", () => {
  const { UPGRADE_COSTS, CRESTS_PER_UPGRADE, CRAFTED_BASE_LEVEL, hasCrestData, remainingUpgrades,
          CREST_CURRENCIES: CREST_TIERS } = jest.requireActual("Databases/CrestDB");
  const { CONSTANTS } = require("General/Engine/CONSTANTS");

  const ladderTracks = () => Object.entries(UPGRADE_COSTS).filter(([track]) => !track.includes("Crafted"));

  test("every rank costs the same, in the crest named after its track", () => {
    ladderTracks().forEach(([track, ranks]) => {
      ranks.forEach((rank) => {
        expect(rank.crests).toEqual(CRESTS_PER_UPGRADE);
        expect(rank.crest).toEqual(track);
      });
    });
  });

  test("a rank is one step up the ladder, and stops at the track's cap", () => {
    ladderTracks().forEach(([track, ranks]) => {
      ranks.forEach((rank) => {
        const ladder = CONSTANTS.fullItemLevels;
        expect(ladder[ladder.indexOf(rank.fromLevel) + 1]).toEqual(rank.toLevel);
        expect(rank.toLevel).toBeLessThanOrEqual(CONSTANTS.itemLevelCaps[track]);
      });
    });
  });

  test("crafted gear is one payment to its ceiling, not a ladder", () => {
    const { CRAFTED_BASE_LEVEL, CRAFTED_UPGRADE_CRESTS } = jest.requireActual("Databases/CrestDB");

    expect(UPGRADE_COSTS["Runed Crafted"]).toEqual([
      { fromLevel: CRAFTED_BASE_LEVEL, toLevel: 318, crest: "Hero", crests: CRAFTED_UPGRADE_CRESTS },
    ]);
    expect(UPGRADE_COSTS["Gilded Crafted"]).toEqual([
      { fromLevel: CRAFTED_BASE_LEVEL, toLevel: 331, crest: "Myth", crests: CRAFTED_UPGRADE_CRESTS },
    ]);
  });

  test("a crafted track is paid for in a crest that isn't its own name", () => {
    // Every other track spends the crest named after it; these two don't, which is why they're written out.
    expect(UPGRADE_COSTS["Runed Crafted"][0].crest).not.toEqual("Runed Crafted");
    expect(Object.values(CREST_TIERS)).toContain(UPGRADE_COSTS["Gilded Crafted"][0].crest);
  });

  test("a crafted piece already at its ceiling has nothing to buy", () => {
    expect(remainingUpgrades("Gilded Crafted", 331)).toEqual([]);
    expect(remainingUpgrades("Gilded Crafted", CRAFTED_BASE_LEVEL)).toHaveLength(1);
  });

  test("an item at its track's cap has nothing left to buy", () => {
    // A Hero piece at 321 is finished; the same piece at 318 has one rank to go.
    expect(remainingUpgrades("Hero", CONSTANTS.itemLevelCaps.Hero)).toEqual([]);
    expect(remainingUpgrades("Hero", 318)).toHaveLength(1);
  });

  test("there is enough data to plan with", () => {
    expect(hasCrestData()).toBe(true);
  });
});
