import { planCrestSpending, upgradeStepsFor } from "./CrestSpending";
import * as CrestDB from "Databases/CrestDB";

/*
  Spending crests.

  The real cost tables are empty - which crest each currency id is, and what each rank costs, are game data the app
  can't derive, and guessing either produces recommendations that are wrong in a way nothing in the output betrays.
  So the arithmetic is tested against a stand-in table here, and dropping the real numbers in changes no code.
*/

const HERO = 3445, MYTH = 3444, VALOR = 1792;

// Two ranks on each track. Myth crests buy more healing per crest than Hero ones at these prices, which is what
// makes the ordering below worth asserting.
const COSTS = {
  Hero: [
    { fromLevel: 321, toLevel: 324, crest: "Hero", crests: 15, valorstones: 500 },
    { fromLevel: 324, toLevel: 328, crest: "Hero", crests: 15, valorstones: 600 },
  ],
  Myth: [
    { fromLevel: 331, toLevel: 334, crest: "Myth", crests: 10, valorstones: 500 },
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

    const plan = planCrestSpending([boots, chest], { [HERO]: 100, [MYTH]: 100, [VALOR]: 9999 }, gains);

    expect(plan[0].item).toBe(chest);   // 80 / 10 crests beats 100 / 15.
    expect(plan[0].efficiency).toBeGreaterThan(plan[1].efficiency);
  });

  test("it stops when the crests run out", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 15, [VALOR]: 9999 }, flat(50));

    // Enough for the first rank only, even though a second is available.
    expect(plan).toHaveLength(1);
    expect(plan[0].toLevel).toEqual(324);
  });

  test("Valorstones are a limit too, not just crests", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 100, [VALOR]: 400 }, flat(50));

    expect(plan).toEqual([]);
  });

  test("ranks are bought in order, never skipped", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 100, [VALOR]: 9999 }, flat(50));

    expect(plan.map((p) => p.toLevel)).toEqual([324, 328]);
  });

  test("an upgrade that gains nothing isn't bought at any price", () => {
    const boots = item("boots", "Hero", 321);
    expect(planCrestSpending([boots], { [HERO]: 999, [VALOR]: 9999 }, flat(0))).toEqual([]);
    expect(planCrestSpending([boots], { [HERO]: 999, [VALOR]: 9999 }, flat(-5))).toEqual([]);
  });

  test("the running total says what each purchase has cost so far", () => {
    const boots = item("boots", "Hero", 321);
    const plan = planCrestSpending([boots], { [HERO]: 100, [VALOR]: 9999 }, flat(50));

    expect(plan[0].spent[HERO]).toEqual(15);
    expect(plan[1].spent[HERO]).toEqual(30);
    expect(plan[1].spent[VALOR]).toEqual(1100);
  });

  test("a crest tier we can't identify is never spent", () => {
    CrestDB.crestCurrency.mockReturnValue(0);
    const boots = item("boots", "Hero", 321);

    expect(planCrestSpending([boots], { [HERO]: 999, [VALOR]: 9999 }, flat(50))).toEqual([]);
  });

  test("with no cost data at all there is no plan, rather than a wrong one", () => {
    CrestDB.hasCrestData.mockReturnValue(false);
    const boots = item("boots", "Hero", 321);

    expect(planCrestSpending([boots], { [HERO]: 999, [VALOR]: 9999 }, flat(50))).toEqual([]);
  });

  test("nothing to upgrade is an empty plan, not a crash", () => {
    expect(planCrestSpending([], { [HERO]: 100 }, flat(50))).toEqual([]);
    expect(planCrestSpending(null, {}, flat(50))).toEqual([]);
  });
});
