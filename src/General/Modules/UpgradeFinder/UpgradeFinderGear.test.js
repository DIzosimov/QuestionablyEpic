import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear } from "General/Modules/TopGear/Engine/TopGearEngine";
import { upgradeFinderGearSettings } from "./UpgradeFinderEngine";
import { keepsExistingGear } from "General/Engine/ItemUtilities";
import { getEnchantByEnchantID } from "Databases/EnchantDB";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Upgrade Finder measures against the gear the player actually has.

  It runs a full evaluation per candidate item, hundreds of times, on the thread drawing the page - so it takes
  whatever Top Gear is set to and pins it: no gem or enchant expansion, and the character's own gems, enchants and
  runes rather than a re-gemmed ideal. The percentage is then "how much better would this item make me", not "how
  much better would this item and a full re-gem make me".
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;

const GEAR = [
  [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
  [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
  [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
];
const SOCKETED = "240890:240890:240890"; // Deadly Peridot.
const WORN_WEAPON = 7983;                // Berserker's Rage.

const geared = () => {
  const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
  GEAR.forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "");
    item.active = true;
    item.isEquipped = true;
    if (item.socket) item.gemString = SOCKETED;
    if (slot === "2H Weapon") item.enchantID = WORN_WEAPON;
    player.addActiveItem(item);
  });
  return player;
};

const evaluate = (settings) => {
  const p = geared();
  return runTopGear(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"), settings, p.getActiveModel("Raid"));
};

describe("The settings Upgrade Finder evaluates under", () => {
  test("it keeps the gear's own gems, enchants and runes", () => {
    expect(keepsExistingGear(upgradeFinderGearSettings(base()))).toBe(true);
  });

  test("it keeps them even when Top Gear is set to replace", () => {
    const replacing = { ...base(), replaceExistingGems: { value: true } };
    expect(keepsExistingGear(upgradeFinderGearSettings(replacing))).toBe(true);
  });

  test("the gem and enchant expansion is off, whatever Top Gear is doing", () => {
    // Left on, Optimize Everything would search millions of combinations per candidate item, on the UI thread.
    const searching = {
      ...base(),
      optimizeAllGearOptions: { value: true },
      detailedGearOptions: { value: true },
    };
    const pinned = upgradeFinderGearSettings(searching);

    expect(pinned.optimizeAllGearOptions.value).toBe(false);
    expect(pinned.detailedGearOptions.value).toBe(false);
  });

  test("the tier override it already relied on is untouched", () => {
    expect(upgradeFinderGearSettings(base()).forceTier).toEqual({ value: "S2" });
  });

  test("everything else is passed through", () => {
    const withOther = { ...base(), foodBuff: { value: "Amani Cornucopia" } };
    expect(upgradeFinderGearSettings(withOther).foodBuff).toEqual({ value: "Amani Cornucopia" });
  });
});

describe("What that means for the evaluation", () => {
  test("the set is scored wearing the player's own gems", () => {
    const asIs = evaluate(upgradeFinderGearSettings(base())).itemSet.enchantBreakdown["Gems"];

    // Socket 0 is the meta, chosen separately; the stat sockets are the player's own.
    expect(asIs.slice(1).every((gem) => gem === 240890)).toBe(true);
  });

  test("and the player's own enchants", () => {
    const asIs = evaluate(upgradeFinderGearSettings(base())).itemSet.enchantBreakdown;

    expect(asIs["CombinedWeapon"]).toEqual(getEnchantByEnchantID(WORN_WEAPON).name);
  });

  test("Top Gear's own settings would have re-gemmed it instead", () => {
    // The difference this makes: the same gear, scored the way Top Gear would, wears different gems.
    const topGear = evaluate(base()).itemSet.enchantBreakdown["Gems"];

    expect(topGear.slice(1).every((gem) => gem === 240890)).toBe(false);
  });

  test("one evaluation per candidate, even with Optimize Everything on", () => {
    const searching = { ...base(), optimizeAllGearOptions: { value: true } };
    const pinned = evaluate(upgradeFinderGearSettings(searching));

    // itemsCompared is sets times variants. One gear set, one variant.
    expect(pinned.itemsCompared).toEqual(1);
  });
});

/*
  Comparing against gear that is already finished.

  Upgrade Finder measures a candidate against what the player has on, so a partly upgraded set flatters everything
  it is compared with: a piece that only wins because the gear beside it is three ranks short isn't an upgrade,
  it's a reminder to spend crests. Raising the baseline answers the other question - what is still worth chasing
  once those crests are spent.
*/
describe("Measuring against fully upgraded gear", () => {
  const { atTopOfTrack } = require("./UpgradeFinderEngine");
  const { CONSTANTS } = require("General/Engine/CONSTANTS");

  const piece = (level, track) => {
    const item = new Item(268230, "", "Head", 1, "", 0, level, "");
    item.isEquipped = true;
    item.upgradeTrack = track;
    item.gemString = "240890";
    item.enchantID = 7961;
    return item;
  };

  test("a piece below its cap is raised to it", () => {
    const raised = atTopOfTrack([piece(308, "Hero")]);
    expect(raised[0].level).toEqual(CONSTANTS.itemLevelCaps.Hero);
  });

  test("each track goes to its own cap, not a shared one", () => {
    const raised = atTopOfTrack([piece(300, "Champion"), piece(300, "Hero"), piece(300, "Myth")]);

    expect(raised.map((item) => item.level))
      .toEqual([CONSTANTS.itemLevelCaps.Champion, CONSTANTS.itemLevelCaps.Hero, CONSTANTS.itemLevelCaps.Myth]);
  });

  test("a piece already at its cap is left exactly as it was", () => {
    const done = piece(CONSTANTS.itemLevelCaps.Hero, "Hero");
    expect(atTopOfTrack([done])[0]).toBe(done);
  });

  test("a piece with no track is left alone rather than guessed at", () => {
    // Crafted pieces this season carry no track, so there is nothing to raise them to.
    const crafted = piece(331, "");
    expect(atTopOfTrack([crafted])[0]).toBe(crafted);
  });

  test("the player's own gear is not touched", () => {
    const original = piece(308, "Hero");
    atTopOfTrack([original]);
    expect(original.level).toEqual(308);
  });

  test("a raised piece keeps its gems, its enchant and its equipped flag", () => {
    // It stands in for the equipped set, and the engine reads all three off it.
    const raised = atTopOfTrack([piece(308, "Hero")])[0];

    expect(raised.gemString).toEqual("240890");
    expect(raised.enchantID).toEqual(7961);
    expect(raised.isEquipped).toBe(true);
  });

  test("a raised piece actually gains stats", () => {
    const before = piece(308, "Hero");
    const after = atTopOfTrack([before])[0];

    expect(after.stats.intellect).toBeGreaterThan(before.stats.intellect);
  });

  test("nothing to raise is not a crash", () => {
    expect(atTopOfTrack([])).toEqual([]);
    expect(atTopOfTrack(undefined)).toEqual([]);
  });
});

/*
  The setting actually reaching the baseline. Testing the raising on its own left the wiring uncovered - the
  engine could ignore the setting entirely and every test still passed.
*/
describe("Choosing which baseline to measure against", () => {
  const { upgradeFinderBaseline } = require("./UpgradeFinderEngine");
  const { CONSTANTS } = require("General/Engine/CONSTANTS");

  const geared = () => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    [["Head", 308], ["Chest", 311]].forEach(([slot, level]) => {
      const item = new Item(268230, "", slot, 0, "", 0, level, "");
      item.active = true;
      item.isEquipped = true;
      item.upgradeTrack = "Hero";
      player.addActiveItem(item);
    });
    return player;
  };

  test("off, the gear is measured exactly as it is", () => {
    expect(upgradeFinderBaseline(geared(), { maxCurrentGear: false }).map((i) => i.level)).toEqual([308, 311]);
  });

  test("on, every piece is measured at the top of its track", () => {
    const cap = CONSTANTS.itemLevelCaps.Hero;
    expect(upgradeFinderBaseline(geared(), { maxCurrentGear: true }).map((i) => i.level)).toEqual([cap, cap]);
  });

  test("no settings at all behaves as off", () => {
    // An older saved session has no such setting, and must not silently change what the numbers mean.
    expect(upgradeFinderBaseline(geared(), undefined).map((i) => i.level)).toEqual([308, 311]);
    expect(upgradeFinderBaseline(geared(), {}).map((i) => i.level)).toEqual([308, 311]);
  });
});

/*
  Which version of a candidate to offer.

  Raising the player's gear is only half the comparison. A candidate still offered at the level it drops at - one
  rank of six - measures the crests they haven't spent as much as the piece, and that is the skew that makes these
  numbers unusable elsewhere.
*/
describe("Offering candidates at the level they end up, not the level they drop", () => {
  const { candidateStates } = require("./UpgradeFinderEngine");
  const RAID = ["drop", "max", "bonus"];

  test("off, every version is offered as before", () => {
    expect(candidateStates(RAID, { maxCurrentGear: false })).toEqual(RAID);
    expect(candidateStates(RAID, {})).toEqual(RAID);
    expect(candidateStates(RAID, undefined)).toEqual(RAID);
  });

  test("on, the version that drops at one rank of six is dropped", () => {
    expect(candidateStates(RAID, { maxCurrentGear: true })).toEqual(["max", "bonus"]);
  });

  test("the finished versions are kept, both of them", () => {
    // "max" is the top of the track the piece drops on, "bonus" the top of the vault track above it - a 6/6 Hero
    // piece and a 6/6 Myth one, which is the comparison worth making.
    const offered = candidateStates(RAID, { maxCurrentGear: true });

    expect(offered).toContain("max");
    expect(offered).toContain("bonus");
  });

  test("a dungeon whose end and vault share a track still offers its finished version", () => {
    // That case only ever had two versions to begin with, so removing the drop must not leave it with none.
    const offered = candidateStates(["drop", "bonus"], { maxCurrentGear: true });

    expect(offered).toEqual(["bonus"]);
    expect(offered.length).toBeGreaterThan(0);
  });

  test("nothing on offer is not a crash", () => {
    expect(candidateStates([], { maxCurrentGear: true })).toEqual([]);
  });
});
