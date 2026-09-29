import { remainingUpgrades, isCraftedTrack, UPGRADE_COSTS, CRAFTED_BASE_LEVEL, CRAFTED_UPGRADE_CRESTS } from "./CrestDB";
import { upgradeStepsFor } from "General/Modules/TopGear/Engine/CrestSpending";
import { CONSTANTS } from "General/Engine/CONSTANTS";

/*
  What crafted gear costs.

  Crafted gear doesn't climb the ladder the rest of the gear does. It's made at a base level for no crests at all,
  and a single payment lifts it to its track's ceiling - 80 Myth crests to 331, or 80 Hero crests to 318. Pricing
  it as six cheap ranks, or as nothing at all, both produce a plan that looks entirely reasonable and spends
  crests the character doesn't have on an upgrade it can't make.

  Unlike the planner's own tests, these run against the real table: the numbers are the point.
*/

describe("The price of a crafted upgrade", () => {
  test("a Myth crafted piece costs 80 Myth crests and lands at 331", () => {
    expect(UPGRADE_COSTS["Myth Crafted"]).toEqual([
      { fromLevel: CRAFTED_BASE_LEVEL, toLevel: 331, crest: "Myth", crests: 80 },
    ]);
  });

  test("a Hero crafted piece costs 80 Hero crests and lands at 318", () => {
    expect(UPGRADE_COSTS["Hero Crafted"]).toEqual([
      { fromLevel: CRAFTED_BASE_LEVEL, toLevel: 318, crest: "Hero", crests: 80 },
    ]);
  });

  test("it is one payment, not a ladder of ranks", () => {
    // The distinction is the whole reason crafted gear is priced separately. Four ranks at 20 would come to the
    // same 80 crests while letting a plan buy a quarter of an upgrade that doesn't exist.
    expect(UPGRADE_COSTS["Myth Crafted"].length).toBe(1);
    expect(CRAFTED_UPGRADE_CRESTS).toBe(80);
  });

  test("the ceilings come from the app's own caps, not a second copy of them", () => {
    expect(UPGRADE_COSTS["Myth Crafted"][0].toLevel).toBe(CONSTANTS.itemLevelCaps["Myth Crafted"]);
    expect(UPGRADE_COSTS["Hero Crafted"][0].toLevel).toBe(CONSTANTS.itemLevelCaps["Hero Crafted"]);
  });

  test("the dropped tracks are still ladders", () => {
    expect(isCraftedTrack("Myth Crafted")).toBe(true);
    expect(isCraftedTrack("Myth")).toBe(false);
    expect(UPGRADE_COSTS.Myth.length).toBeGreaterThan(1);
  });
});

describe("Whether a crafted piece still has an upgrade to buy", () => {
  test("at its base level, the upgrade is on offer", () => {
    expect(remainingUpgrades("Myth Crafted", CRAFTED_BASE_LEVEL)).toHaveLength(1);
  });

  test("above its base level but below the ceiling, it is still on offer", () => {
    // A crafted piece doesn't have to sit at exactly its base level. Matching on the base alone offered nothing
    // at all for such a piece, and a piece that offers nothing never reaches a crest plan to be questioned.
    expect(remainingUpgrades("Myth Crafted", CRAFTED_BASE_LEVEL + 1)).toHaveLength(1);
    expect(remainingUpgrades("Myth Crafted", 318)).toHaveLength(1);
    expect(remainingUpgrades("Myth Crafted", 330)).toHaveLength(1);
  });

  test("at the ceiling, there is nothing left to buy", () => {
    expect(remainingUpgrades("Myth Crafted", 331)).toEqual([]);
    expect(remainingUpgrades("Hero Crafted", 318)).toEqual([]);
  });

  test("past the ceiling is not an upgrade either", () => {
    expect(remainingUpgrades("Myth Crafted", 340)).toEqual([]);
  });

  test("a dropped track is unaffected", () => {
    // It is walked a rank at a time, so what is left is what starts at or above where the piece sits.
    const left = remainingUpgrades("Myth", 331);

    expect(left.every((rank) => rank.fromLevel >= 331)).toBe(true);
    expect(remainingUpgrades("Myth", CONSTANTS.itemLevelCaps.Myth)).toEqual([]);
  });

  test("a track nobody has priced offers nothing rather than guessing", () => {
    expect(remainingUpgrades("Nonexistent", 305)).toEqual([]);
  });
});

describe("The step a crest plan is offered for a crafted piece", () => {
  const crafted = (level, track = "Myth Crafted") => ({ id: 1, slot: "Chest", level, upgradeTrack: track });

  test("a freshly crafted piece is offered the climb to 331 for 80 Myth crests", () => {
    expect(upgradeStepsFor(crafted(CRAFTED_BASE_LEVEL))).toEqual([
      { item: crafted(CRAFTED_BASE_LEVEL), track: "Myth Crafted", fromLevel: 305, toLevel: 331, crest: "Myth", crests: 80 },
    ]);
  });

  test("it reports the level the piece is actually at, not the base level", () => {
    // Otherwise a plan tells the player their 312 piece goes "305 → 331", which is a climb it never makes.
    const [step] = upgradeStepsFor(crafted(312));

    expect(step.fromLevel).toBe(312);
    expect(step.toLevel).toBe(331);
    expect(step.crests).toBe(80);
  });

  test("a piece crafted below the base level starts from where it is", () => {
    // Crafting quality moves the level a piece is made at, so a crafted piece is not necessarily at 305. Reporting
    // the base level regardless would describe a climb the piece never makes.
    const [step] = upgradeStepsFor(crafted(290));

    expect(step.fromLevel).toBe(290);
    expect(step.toLevel).toBe(331);
    expect(step.crests).toBe(80);
  });

  test("a finished crafted piece offers nothing", () => {
    expect(upgradeStepsFor(crafted(331))).toEqual([]);
  });

  test("a ladder piece's later ranks start where the rank starts, not where the piece is", () => {
    // A ladder is climbed a rank at a time, so only the first rank starts from the piece. Using the piece's level
    // throughout would describe every later rank as another climb from the bottom.
    const steps = upgradeStepsFor({ id: 2, slot: "Head", level: 308, upgradeTrack: "Hero" });

    expect(steps.length).toBeGreaterThan(1);
    expect(steps[0].fromLevel).toBe(308);
    steps.forEach((step, i) => expect(step.fromLevel).toBe(i === 0 ? 308 : steps[i - 1].toLevel));
  });

  test("a crafted piece with no track set offers nothing", () => {
    // Which is why the track has to be askable for - see the crafted options in ItemBar.
    expect(upgradeStepsFor({ id: 1, slot: "Chest", level: 305, upgradeTrack: "" })).toEqual([]);
  });

  test("a Hero crafted piece is paid for in Hero crests", () => {
    const [step] = upgradeStepsFor(crafted(305, "Hero Crafted"));

    expect(step.crest).toBe("Hero");
    expect(step.toLevel).toBe(318);
  });
});
