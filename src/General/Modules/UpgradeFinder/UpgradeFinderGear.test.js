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

/*
  WoWAudit conditions.

  WoWAudit takes a report only if it was generated under a fixed set of conditions. Most of them the engine meets
  and could not fail to meet; two are settings, and both have to be right or the report is rejected on submission
  rather than here. The toggle sets them together and writes down what it did.
*/
describe("Running a report under WoWAudit conditions", () => {
  const { reportConditions, wowAuditSettings, withFightLength, WOWAUDIT_FIGHT_LENGTH } = require("./UpgradeFinderEngine");

  test("five minutes is 300 seconds, not QE's own 400", () => {
    expect(WOWAUDIT_FIGHT_LENGTH).toBe(300);
  });

  describe("the settings it forces", () => {
    test("it upgrades both sides of the comparison without being asked", () => {
      // WoWAudit rejects a 1/6-against-finished comparison, so leaving this to the player to remember is a
      // rejection waiting to happen.
      expect(wowAuditSettings({ wowAudit: true }).maxCurrentGear).toBe(true);
      expect(wowAuditSettings({ wowAudit: true, maxCurrentGear: false }).maxCurrentGear).toBe(true);
    });

    test("off, it changes nothing at all", () => {
      const settings = { maxCurrentGear: false, raid: [3] };

      expect(wowAuditSettings(settings)).toBe(settings);
      expect(wowAuditSettings({})).toEqual({});
      expect(wowAuditSettings(undefined)).toBe(undefined);
    });

    test("the rest of the settings survive", () => {
      expect(wowAuditSettings({ wowAudit: true, raid: [3], dungeon: 10 })).toEqual({
        wowAudit: true, raid: [3], dungeon: 10, maxCurrentGear: true,
      });
    });
  });

  describe("pinning the fight length", () => {
    const { reportFightLength } = require("./UpgradeFinderEngine");

    test("a WoWAudit report is scored at five minutes", () => {
      expect(reportFightLength({ wowAudit: true })).toBe(WOWAUDIT_FIGHT_LENGTH);
    });

    test("every other report is left at whatever the character's model says", () => {
      // 0 means "don't touch it" - not "a zero second fight".
      expect(reportFightLength({ maxCurrentGear: true })).toBe(0);
      expect(reportFightLength({})).toBe(0);
      expect(reportFightLength(undefined)).toBe(0);
    });

    const model = (length) => ({ fightInfo: { fightLength: length } });

    test("the run sees the pinned length", () => {
      const castModel = model(400);
      const seen = withFightLength(castModel, 300, () => castModel.fightInfo.fightLength);

      expect(seen).toBe(300);
    });

    test("the model is put back afterwards", () => {
      // It is the character's own model, shared with the rest of the app. Leaving it pinned would quietly
      // rescore every other page.
      const castModel = model(400);
      withFightLength(castModel, 300, () => null);

      expect(castModel.fightInfo.fightLength).toBe(400);
    });

    test("it is put back even when the run throws", () => {
      const castModel = model(400);

      expect(() => withFightLength(castModel, 300, () => { throw new Error("boom"); })).toThrow("boom");
      expect(castModel.fightInfo.fightLength).toBe(400);
    });

    test("no pin leaves the model alone and still runs", () => {
      const castModel = model(400);
      const seen = withFightLength(castModel, 0, () => castModel.fightInfo.fightLength);

      expect(seen).toBe(400);
      expect(castModel.fightInfo.fightLength).toBe(400);
    });

    test("a model with no fight info is not a crash", () => {
      expect(withFightLength(undefined, 300, () => "ran")).toBe("ran");
      expect(withFightLength({}, 300, () => "ran")).toBe("ran");
    });

    test("the value it returns is the run's own", () => {
      expect(withFightLength(model(400), 300, () => ["a", "b"])).toEqual(["a", "b"]);
    });
  });

  describe("what the report says it was run under", () => {
    test("an ordinary report claims nothing", () => {
      expect(reportConditions({ maxCurrentGear: true })).toEqual([]);
      expect(reportConditions({})).toEqual([]);
      expect(reportConditions(undefined)).toEqual([]);
    });

    test("every condition on WoWAudit's list is accounted for", () => {
      const listed = reportConditions({ wowAudit: true }).map((entry) => entry.condition);

      expect(listed).toEqual(["Fight style", "Fight length", "Targets", "Power Infusion", "Vault sockets", "Equipped gear", "Candidates"]);
    });

    test("it states the length it actually ran at", () => {
      const length = reportConditions({ wowAudit: true }).find((entry) => entry.condition === "Fight length");

      expect(length.value).toBe("5 minutes");
      expect(WOWAUDIT_FIGHT_LENGTH).toBe(5 * 60);
    });

    test("it says which conditions the toggle enforced and which merely hold", () => {
      // The two it enforces are the two that could have been wrong. The rest the engine cannot do otherwise,
      // and claiming to have enforced them would be claiming a check that does not exist.
      const enforced = reportConditions({ wowAudit: true }).filter((entry) => entry.enforced).map((e) => e.condition);

      expect(enforced).toEqual(["Fight length", "Equipped gear", "Candidates"]);
    });
  });
});

/*
  What the finished report declares as equipped.

  The report is uploaded and read by other tools - WoWAudit checks this list to confirm the report was run with
  every piece upgraded, and rejects it if the levels say otherwise. Raising the comparison raises copies, by
  design, so the player's own items are untouched; left there, the report scores at 6/6 and then declares gear at
  1/6, which is a contradiction whether or not anything catches it.
*/
describe("The equipped gear the report declares", () => {
  const { reportedEquippedItems, upgradeFinderBaseline } = require("./UpgradeFinderEngine");
  const { CONSTANTS: C } = require("General/Engine/CONSTANTS");

  const worn = () => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    [["Head", 308, "Hero"], ["Neck", 311, "Myth"]].forEach(([slot, level, track]) => {
      const item = new Item(268230, "", slot, 0, "", 0, level, "");
      item.active = true;
      item.isEquipped = true;
      item.upgradeTrack = track;
      player.addActiveItem(item);
    });
    // Not worn, so it has no business being in the report either way.
    const spare = new Item(268231, "", "Shoulder", 0, "", 0, 300, "");
    spare.upgradeTrack = "Hero";
    player.addActiveItem(spare);
    return player;
  };

  test("an ordinary report declares the gear exactly as it is", () => {
    expect(reportedEquippedItems(worn(), { maxCurrentGear: false }).map((i) => i.level)).toEqual([308, 311]);
    expect(reportedEquippedItems(worn(), undefined).map((i) => i.level)).toEqual([308, 311]);
  });

  test("a 6/6 report declares the gear at 6/6, the way it was scored", () => {
    expect(reportedEquippedItems(worn(), { maxCurrentGear: true }).map((i) => i.level))
      .toEqual([C.itemLevelCaps.Hero, C.itemLevelCaps.Myth]);
  });

  test("a WoWAudit report does too, without the other box being ticked", () => {
    // The toggle forces the 6/6 comparison on, so the declaration has to follow it rather than the raw setting.
    expect(reportedEquippedItems(worn(), { wowAudit: true, maxCurrentGear: false }).map((i) => i.level))
      .toEqual([C.itemLevelCaps.Hero, C.itemLevelCaps.Myth]);
  });

  test("it declares what was scored, piece for piece", () => {
    // The two lists are built by different code from different sources; if they ever disagree the report is
    // making a claim the run didn't back up.
    const player = worn();
    const settings = { maxCurrentGear: true };

    expect(reportedEquippedItems(player, settings).map((i) => i.level))
      .toEqual(upgradeFinderBaseline(player, settings).map((i) => i.level));
  });

  test("gear the player isn't wearing stays out of it", () => {
    expect(reportedEquippedItems(worn(), { maxCurrentGear: true }).length).toBe(2);
  });

  test("the player's own items are never touched", () => {
    // They're shown elsewhere in the app and saved to the character. A report must not rewrite them.
    const player = worn();
    reportedEquippedItems(player, { maxCurrentGear: true });

    expect(player.activeItems.filter((i) => i.isEquipped).map((i) => i.level)).toEqual([308, 311]);
  });

  test("a character with no items is not a crash", () => {
    const empty = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    expect(reportedEquippedItems(empty, { maxCurrentGear: true })).toEqual([]);
  });
});
