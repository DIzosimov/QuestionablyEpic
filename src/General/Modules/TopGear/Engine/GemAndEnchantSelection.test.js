import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear } from "./TopGearEngine";
import { getEnchantById, getEnchantsForSlot } from "Databases/EnchantDB";
import { getFolioGems } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Gem, enchant and Folio selection. The contract that matters is that leaving everything on Automatic reproduces
  exactly what the engine did before any of it was selectable, and that "replace existing gems" genuinely changes
  which gems end up socketed.
*/

const base = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
const cfg = (overrides = {}) => {
  const s = JSON.parse(JSON.stringify(base));
  Object.entries(overrides).forEach(([k, v]) => {
    s[k] = s[k] ? { ...s[k], value: v } : { value: v, options: [], category: "gems", type: "hidden", gameType: "Retail" };
  });
  return s;
};

const GEAR = [
  [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
  [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
  [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
];

const run = (settings, socketedGems = null) => {
  const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
  GEAR.forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "");
    item.active = true;
    item.isEquipped = true;
    // Simulate gems already socketed, the way the SimC import records them.
    if (socketedGems && item.socket) item.gemString = socketedGems;
    player.addActiveItem(item);
  });
  return runTopGear(player.activeItems, buildNewWepCombos(player, true), player, "Raid", player.getHPS("Raid"), settings, player.getActiveModel("Raid"));
};

describe("Automatic reproduces the previous behaviour", () => {
  test("an untouched profile still produces a set", () => {
    expect(run(cfg())).toBeTruthy();
  });

  test("Folio runes on Automatic match the runes the engine used to hardcode", () => {
    expect(getFolioGems({}, "mastery")).toEqual([1279599, 1279603, 1287555, 1287771, 1279614]);
    expect(getFolioGems({}, "crit")).toEqual([1279599, 1279603, 1287555, 1279609, 1279614]);
  });

  test("Evoker still defaults to Arcane Mastery on the weapon", () => {
    expect(run(cfg()).itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Arcane Mastery");
  });
});

describe("Enchants are selectable per slot", () => {
  test("a chosen weapon enchant overrides the spec default", () => {
    const r = run(cfg({ enchantChoices: { CombinedWeapon: "Berserker's Rage" } }));
    expect(r.itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Berserker's Rage");
  });

  test("a chosen ring enchant overrides the best-stat pick", () => {
    const r = run(cfg({ enchantChoices: { Finger: "Silvermoon's Tenacity" } }));
    expect(r.itemSet.enchantBreakdown["Finger"]).toEqual("Silvermoon's Tenacity");
  });

  test("choosing a worse enchant measurably lowers throughput", () => {
    const auto = run(cfg()).itemSet.setHPS;
    const forced = run(cfg({ enchantChoices: { CombinedWeapon: "Acuity of the Ren'dorei" } })).itemSet.setHPS;
    expect(forced).toBeLessThan(auto);
  });

  test("an enchant that isn't legal on the slot is ignored rather than dropping the enchant", () => {
    const r = run(cfg({ enchantChoices: { Head: "Berserker's Rage" } }));
    expect(r.itemSet.enchantBreakdown["Head"]).toEqual("Empowered Hex of Leeching");
  });

  test("every offered enchant is legal on the slot it's offered for", () => {
    ["Head", "Chest", "Shoulder", "Legs", "Feet", "Finger", "CombinedWeapon"].forEach((slot) => {
      getEnchantsForSlot(slot, "Preservation Evoker").forEach((e) => {
        expect(getEnchantById(e.id).slots).toContain(slot);
      });
    });
  });
});

describe("Gem selection and the replace / fill-empty switch", () => {
  const gemsOf = (r) => r.itemSet.enchantBreakdown["Gems"];

  test("a chosen gem fills the non-meta sockets", () => {
    const r = run(cfg({ selectedGems: [240914] })); // Flawless Deadly Lapis, vers/crit
    gemsOf(r).slice(1).forEach((id) => expect(id).toEqual(240914));
  });

  test("a chosen meta gem only replaces the meta socket", () => {
    const r = run(cfg({ selectedMetaGem: 240969, selectedGems: [240914] }));
    expect(gemsOf(r)[0]).toEqual(240969);
    gemsOf(r).slice(1).forEach((id) => expect(id).toEqual(240914));
  });

  test("with replace on, gems already socketed are overwritten", () => {
    const r = run(cfg({ selectedGems: [240914], replaceExistingGems: true }), "240890:240890");
    gemsOf(r).slice(1).forEach((id) => expect(id).toEqual(240914));
  });

  test("with replace off, gems already socketed are kept", () => {
    const r = run(cfg({ selectedGems: [240914], replaceExistingGems: false }), "240890:240890");
    // 240890 was already socketed, so it survives rather than being swapped for the selection.
    expect(gemsOf(r)).toContain(240890);
  });

  test("with replace off, empty sockets still get filled", () => {
    const r = run(cfg({ selectedGems: [240914], replaceExistingGems: false }), "");
    expect(gemsOf(r).length).toBeGreaterThan(0);
    gemsOf(r).slice(1).forEach((id) => expect(id).toEqual(240914));
  });

  test("keeping worse gems scores lower than replacing them", () => {
    const kept = run(cfg({ selectedGems: [240898], replaceExistingGems: false }), "240914:240914").itemSet.setHPS;
    const replaced = run(cfg({ selectedGems: [240898], replaceExistingGems: true }), "240914:240914").itemSet.setHPS;
    expect(replaced).toBeGreaterThan(kept);
  });

  test("an unrecognised socketed gem is treated as an empty socket", () => {
    const r = run(cfg({ selectedGems: [240914], replaceExistingGems: false }), "999999:999999");
    gemsOf(r).slice(1).forEach((id) => expect(id).toEqual(240914));
  });
});

describe("Folio runes are selectable", () => {
  test("slot 4 can be overridden away from the best stat", () => {
    const set = (v) => ({ folioSlot4: { value: v, options: [], category: "omniumFolio", type: "hidden", gameType: "Retail" } });
    expect(getFolioGems(set("Vers"), "haste")[3]).toEqual(1279613);
    expect(getFolioGems(set("Crit"), "haste")[3]).toEqual(1279609);
  });

  test("a stale rune name falls back to Automatic instead of losing the slot", () => {
    const stale = { folioSlot1: { value: "No Such Rune", options: [], category: "omniumFolio", type: "hidden", gameType: "Retail" } };
    expect(getFolioGems(stale, "haste").length).toEqual(5);
    expect(getFolioGems(stale, "haste")[0]).toEqual(1279599);
  });
});

/* ---------------------------------------------------------------------------------------------- */
/*                      Selecting several gems expands the candidate sets                          */
/* ---------------------------------------------------------------------------------------------- */
const { buildGemLoadouts } = require("./TopGearEngine");

describe("Gem loadouts", () => {
  const A = 240890, B = 240898, C = 240914;

  test("one gem gives one loadout, filling every socket", () => {
    expect(buildGemLoadouts([A], 4)).toEqual([[A, A, A, A]]);
  });

  test("two gems over two sockets give every distinct mix", () => {
    const loadouts = buildGemLoadouts([A, B], 2);
    expect(loadouts).toEqual([[A, A], [A, B], [B, B]]);
  });

  test("sockets are interchangeable, so mirrored mixes aren't produced twice", () => {
    // [A,B] and [B,A] are the same stats, so only one should appear.
    const loadouts = buildGemLoadouts([A, B], 2);
    const asKeys = loadouts.map((l) => [...l].sort().join("-"));
    expect(new Set(asKeys).size).toEqual(loadouts.length);
  });

  test("three gems over three sockets give all ten combinations", () => {
    expect(buildGemLoadouts([A, B, C], 3).length).toEqual(10);
  });

  test("the expansion is capped so a run can't blow up", () => {
    const loadouts = buildGemLoadouts([A, B, C], 8, 12);
    expect(loadouts.length).toBeLessThanOrEqual(12);
  });

  test("every loadout fills exactly the socket count", () => {
    buildGemLoadouts([A, B, C], 5).forEach((l) => expect(l.length).toEqual(5));
  });

  test("no gems or no sockets gives nothing to evaluate", () => {
    expect(buildGemLoadouts([], 4)).toEqual([]);
    expect(buildGemLoadouts([A, B], 0)).toEqual([]);
  });

  test("zero entries are ignored rather than socketed", () => {
    expect(buildGemLoadouts([0, A, 0], 2)).toEqual([[A, A]]);
  });
});

describe("Selecting several gems is ranked like any other choice", () => {
  test("Top Gear still returns a set", () => {
    expect(run(cfg({ selectedGems: [240890, 240898] }))).toBeTruthy();
  });

  test("the winning set uses gems the player actually selected", () => {
    const chosen = [240890, 240898];
    const gems = run(cfg({ selectedGems: chosen })).itemSet.enchantBreakdown["Gems"];
    gems.slice(1).forEach((id) => expect(chosen).toContain(id));
  });

  test("offering a stronger gem alongside a weaker one wins at least as much as the weaker alone", () => {
    const weakOnly = run(cfg({ selectedGems: [240914] })).itemSet.setHPS; // vers major, worst for this spec
    const both = run(cfg({ selectedGems: [240914, 240898] })).itemSet.setHPS; // plus mastery major
    expect(both).toBeGreaterThanOrEqual(weakOnly);
  });

  test("more candidate sets are evaluated when several gems are offered", () => {
    const one = run(cfg({ selectedGems: [240898] })).itemsCompared;
    const several = run(cfg({ selectedGems: [240898, 240890, 240914] })).itemsCompared;
    expect(several).toBeGreaterThan(one);
  });
});
