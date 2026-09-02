import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos, getGearOption, isDetailedGearOptions } from "General/Engine/ItemUtilities";
import { runTopGear, runTopGearShard, finishTopGear, TopSets, countGearSets, estimateEvaluations, keepsExistingGear, getEnchantSearchSpace as enchantSpace } from "./TopGearEngine";
import { getEnchantById, getEnchantsForSlot } from "Databases/EnchantDB";
import { getFolioGems, getFolioChoices, countFolioCombinations, buildFolioCombinations, FOLIO_SLOT_SETTINGS, FOLIO_STAT_SLOT } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Gem, enchant and Folio selection. The contract that matters is that leaving everything on Automatic reproduces
  exactly what the engine did before any of it was selectable, and that "replace existing gems" genuinely changes
  which gems end up socketed.
*/

const base = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
// The detailed gear options toggle gates every setting in this file, so these tests run with it on. Its own
// behaviour - and what happens to these settings when it's off - is covered in the last describe block.
const cfg = (overrides = {}) => {
  const s = JSON.parse(JSON.stringify(base));
  Object.entries({ detailedGearOptions: true, ...overrides }).forEach(([k, v]) => {
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
    expect(getFolioGems({}, "mastery")).toEqual([1279599, 1279603, 1287555, 1279612, 1279614]);
    expect(getFolioGems({}, "crit")).toEqual([1279599, 1279603, 1287555, 1279609, 1279614]);
  });

  test("Evoker still defaults to Arcane Mastery on the weapon", () => {
    expect(run(cfg()).itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Arcane Mastery");
  });
});

describe("Enchants are selectable per slot", () => {
  test("a chosen weapon enchant overrides the spec default", () => {
    const r = run(cfg({ enchantChoices: { CombinedWeapon: ["Berserker's Rage"] } }));
    expect(r.itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Berserker's Rage");
  });

  test("a chosen ring enchant overrides the best-stat pick", () => {
    // Written before rings were split, so it also covers the migration: the old single Finger key has to reach
    // both ring slots rather than being dropped.
    const r = run(cfg({ enchantChoices: { Finger: ["Silvermoon's Tenacity"] } }));
    expect(r.itemSet.enchantBreakdown["Finger1"]).toEqual("Silvermoon's Tenacity");
    expect(r.itemSet.enchantBreakdown["Finger2"]).toEqual("Silvermoon's Tenacity");
  });

  test("choosing a worse enchant measurably lowers throughput", () => {
    const auto = run(cfg()).itemSet.setHPS;
    const forced = run(cfg({ enchantChoices: { CombinedWeapon: ["Acuity of the Ren'dorei"] } })).itemSet.setHPS;
    expect(forced).toBeLessThan(auto);
  });

  test("an enchant that isn't legal on the slot is ignored rather than dropping the enchant", () => {
    const r = run(cfg({ enchantChoices: { Head: ["Berserker's Rage"] } }));
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
    const set = (v) => cfg({ folioSlot4: v });
    expect(getFolioGems(set("Vers"), "haste")[3]).toEqual(1279613);
    expect(getFolioGems(set("Crit"), "haste")[3]).toEqual(1279609);
  });

  test("a stale rune name falls back to Automatic instead of losing the slot", () => {
    const stale = cfg({ folioSlot4: "No Such Rune" });
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

/* ---------------------------------------------------------------------------------------------- */
/*                    Multi-selecting enchants expands the candidate sets                          */
/* ---------------------------------------------------------------------------------------------- */
const { buildEnchantCombinations, buildSetVariants } = require("./TopGearEngine");

describe("Enchant combinations", () => {
  test("one option per slot is a single combination, not a search", () => {
    expect(buildEnchantCombinations({ Chest: ["Mark of the Worldsoul"] })).toEqual([{ Chest: "Mark of the Worldsoul" }]);
  });

  test("two options in one slot give two combinations", () => {
    const combos = buildEnchantCombinations({ Chest: ["Mark of the Worldsoul", "Mark of the Magister"] });
    expect(combos.length).toEqual(2);
  });

  test("options across slots are combined, not concatenated", () => {
    const combos = buildEnchantCombinations({
      Chest: ["Mark of the Worldsoul", "Mark of the Magister"],
      CombinedWeapon: ["Arcane Mastery", "Berserker's Rage"],
    });
    expect(combos.length).toEqual(4);
    combos.forEach((c) => {
      expect(c).toHaveProperty("Chest");
      expect(c).toHaveProperty("CombinedWeapon");
    });
  });

  test("empty slots contribute nothing", () => {
    expect(buildEnchantCombinations({ Chest: [], Head: [] })).toEqual([]);
    expect(buildEnchantCombinations({})).toEqual([]);
    expect(buildEnchantCombinations(null)).toEqual([]);
  });

  test("the expansion is capped", () => {
    const many = {
      Chest: ["Mark of the Worldsoul", "Mark of the Magister"],
      CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"],
      Finger: ["Nature's Fury", "Zul'jin's Mastery", "Silvermoon's Alacrity", "Silvermoon's Tenacity"],
    };
    expect(buildEnchantCombinations(many, 10).length).toBeLessThanOrEqual(10);
  });
});

describe("Gems and enchants expand together", () => {
  test("variants are the product of both, capped", () => {
    const gems = [[1, 1], [2, 2]];
    const enchants = [{ Chest: "a" }, { Chest: "b" }, { Chest: "c" }];
    expect(buildSetVariants({ gemLoadouts: gems, enchantCombos: enchants }, 100).length).toEqual(6);
    expect(buildSetVariants({ gemLoadouts: gems, enchantCombos: enchants }, 4).length).toEqual(4);
  });

  test("Folio and consumable combinations are further axes, multiplied in with the rest", () => {
    const gems = [[1, 1], [2, 2]];
    const enchants = [{ Chest: "a" }, { Chest: "b" }, { Chest: "c" }];
    const folios = [{ 4: "Crit" }, { 4: "Haste" }];
    expect(buildSetVariants({ gemLoadouts: gems, enchantCombos: enchants, folioCombos: folios }, 100).length).toEqual(12);
    expect(buildSetVariants({ folioCombos: folios }, 100).length).toEqual(2);
    expect(buildSetVariants({ folioCombos: folios, consumableCombos: [{ flask: "Crit" }, { flask: "Haste" }] }, 100).length).toEqual(4);
  });

  test("neither selected still yields exactly one variant", () => {
    expect(buildSetVariants({}, 10)).toEqual([{ gemLoadout: null, enchantOverride: null, folioOverride: null, consumableOverride: null }]);
  });

  test("multi-selecting enchants evaluates more sets and still returns one winner", () => {
    const single = run(cfg({ enchantChoices: { CombinedWeapon: ["Arcane Mastery"] } }));
    const multi = run(cfg({ enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"] } }));

    expect(multi.itemsCompared).toBeGreaterThan(single.itemsCompared);
    expect(multi.itemSet).toBeTruthy();
    // The winner must be one of the enchants actually offered.
    expect(["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"])
      .toContain(multi.itemSet.enchantBreakdown["CombinedWeapon"]);
  });

  test("offering extra enchants never produces a worse winner than offering one", () => {
    const forcedWorst = run(cfg({ enchantChoices: { CombinedWeapon: ["Acuity of the Ren'dorei"] } })).itemSet.setHPS;
    const choice = run(cfg({ enchantChoices: { CombinedWeapon: ["Acuity of the Ren'dorei", "Arcane Mastery"] } })).itemSet.setHPS;
    expect(choice).toBeGreaterThanOrEqual(forcedWorst);
  });
});

/*
  The detailed options are opt-in. A player who configures gems and enchants, then switches back to the simple
  view, must get the plain run back - settings left behind in their profile can't keep steering it invisibly.
*/
describe("The detailed gear options toggle gates the whole section", () => {
  const off = (overrides = {}) => cfg({ ...overrides, detailedGearOptions: false });

  test("defaults to off, so an untouched profile is a plain run", () => {
    expect(base.detailedGearOptions.value).toBe(false);
    expect(isDetailedGearOptions(base)).toBe(false);
  });

  test("a stale enchant choice is ignored while the toggle is off", () => {
    const chosen = { CombinedWeapon: ["Berserker's Rage"] };

    expect(run(cfg({ enchantChoices: chosen })).itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Berserker's Rage");
    expect(run(off({ enchantChoices: chosen })).itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Arcane Mastery");
  });

  test("a stale gem choice is ignored while the toggle is off", () => {
    const chosen = [240914]; // Flawless Deadly Lapis - vers major, not the Evoker's automatic pick.

    const on = run(cfg({ selectedGems: chosen })).itemSet.enchantBreakdown["Gems"];
    const plain = run(off({ selectedGems: chosen })).itemSet.enchantBreakdown["Gems"];

    expect(on).toContain(240914);
    expect(plain).not.toContain(240914);
    expect(plain).toEqual(run(off()).itemSet.enchantBreakdown["Gems"]);
  });

  test("a stale Folio choice is ignored while the toggle is off", () => {
    const automatic = getFolioGems({}, "mastery");

    expect(getFolioGems(cfg({ folioSlot4: "Crit" }), "mastery")).not.toEqual(automatic);
    expect(getFolioGems(off({ folioSlot4: "Crit" }), "mastery")).toEqual(automatic);
  });

  test("multi-select expansion doesn't happen while the toggle is off", () => {
    // Several gems and enchants would normally expand the run into many variants. Off, it's a single pass.
    const many = { selectedGems: [240898, 240890, 240914], enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage"] } };

    expect(run(off(many)).itemsCompared).toEqual(run(off()).itemsCompared);
    expect(run(cfg(many)).itemsCompared).toBeGreaterThan(run(off(many)).itemsCompared);
  });

  test("getGearOption tolerates the string form the settings panel writes", () => {
    expect(isDetailedGearOptions({ detailedGearOptions: { value: "true" } })).toBe(true);
    expect(isDetailedGearOptions({ detailedGearOptions: { value: false } })).toBe(false);
    expect(isDetailedGearOptions({})).toBe(false);
    expect(isDetailedGearOptions(null)).toBe(false);

    expect(getGearOption(off(), "selectedGems", [])).toEqual([]);
    expect(getGearOption(cfg({ selectedGems: [240898] }), "selectedGems", [])).toEqual([240898]);
    // A key that isn't in the profile at all still comes back as its fallback.
    expect(getGearOption(cfg(), "noSuchOption", "Automatic")).toEqual("Automatic");
  });
});

/*
  Search depth. The cap on how far a run expands is a setting, not a constant, so a player hunting the genuinely
  optimal setup can ask for the full combinatorics instead of a truncated search. The default has to stay exactly
  where it was, and the counting helpers the panel projects with have to agree with what the builders produce.
*/
const { resolveVariantLimit, countGemLoadouts, countEnchantCombinations } = require("./TopGearEngine");

// Enough selections that a cap genuinely bites: 24 enchant combinations times a handful of gem loadouts is far
// past the smaller limits, so a capped run is searching a fraction of the space.
const WIDE_SELECTION = {
  selectedGems: [240898, 240890, 240914],
  enchantChoices: {
    Chest: ["Mark of the Worldsoul", "Mark of the Magister"],
    CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"],
    Finger: ["Nature's Fury", "Zul'jin's Mastery", "Silvermoon's Alacrity", "Silvermoon's Tenacity"],
  },
};

describe("Search depth is configurable", () => {
  const A = 240898, B = 240890, C = 240914;

  test("no limit is the default, and the untouched path still caps at 24", () => {
    expect(base.gearVariantLimit.value).toEqual(0);
    expect(resolveVariantLimit(cfg())).toEqual(Infinity);
    // A profile that never opened the gear panel has to run exactly as it did before any of this existed.
    expect(resolveVariantLimit(cfg({ detailedGearOptions: false }))).toEqual(24);
  });

  test("zero means no limit", () => {
    expect(resolveVariantLimit(cfg({ gearVariantLimit: 0 }))).toEqual(Infinity);
  });

  test("the settings panel's string form is accepted, and nonsense falls back to the default", () => {
    expect(resolveVariantLimit(cfg({ gearVariantLimit: "150" }))).toEqual(150);
    expect(resolveVariantLimit(cfg({ gearVariantLimit: "0" }))).toEqual(Infinity);
    expect(resolveVariantLimit(cfg({ gearVariantLimit: "banana" }))).toEqual(24);
    expect(resolveVariantLimit(cfg({ gearVariantLimit: -5 }))).toEqual(24);
  });

  test("the limit is ignored while the detailed toggle is off", () => {
    expect(resolveVariantLimit(cfg({ gearVariantLimit: 0, detailedGearOptions: false }))).toEqual(24);
  });

  test("no limit builds every gem loadout instead of the capped 12", () => {
    // 3 gems over 8 sockets is C(10,8) = 45 distinct multisets, well past the default cap.
    expect(buildGemLoadouts([A, B, C], 8, 12).length).toEqual(12);
    expect(buildGemLoadouts([A, B, C], 8, Infinity).length).toEqual(45);
  });

  test("no limit builds every enchant combination", () => {
    const many = {
      Chest: ["Mark of the Worldsoul", "Mark of the Magister"],
      CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"],
      Finger: ["Nature's Fury", "Zul'jin's Mastery", "Silvermoon's Alacrity", "Silvermoon's Tenacity"],
    };
    expect(buildEnchantCombinations(many, 10).length).toEqual(10);
    expect(buildEnchantCombinations(many, Infinity).length).toEqual(24);
    expect(buildSetVariants({ gemLoadouts: [[A], [B]], enchantCombos: buildEnchantCombinations(many, Infinity) }, Infinity).length).toEqual(48);
  });

  test("the counting helpers agree with what the builders produce", () => {
    // This is the whole point of them - the panel projects a count without paying to build the list.
    [[1, 5], [2, 3], [3, 3], [3, 8], [4, 6]].forEach(([gemCount, sockets]) => {
      const gems = [A, B, C, 240905].slice(0, gemCount);
      expect(countGemLoadouts(gemCount, sockets)).toEqual(buildGemLoadouts(gems, sockets, Infinity).length);
    });

    expect(countGemLoadouts(0, 8)).toEqual(0);
    expect(countGemLoadouts(3, 0)).toEqual(0);

    const choices = { Chest: ["a", "b"], Finger: ["c", "d", "e"] };
    expect(countEnchantCombinations(choices)).toEqual(buildEnchantCombinations(choices, Infinity).length);
    expect(countEnchantCombinations({})).toEqual(0);
    expect(countEnchantCombinations(null)).toEqual(0);
  });

  const wide = WIDE_SELECTION;

  test("raising the limit evaluates strictly more sets, and no limit the most of all", () => {
    const capped = run(cfg({ ...wide, gearVariantLimit: 24 })).itemsCompared;
    const wider = run(cfg({ ...wide, gearVariantLimit: 150 })).itemsCompared;
    const unlimited = run(cfg({ ...wide, gearVariantLimit: 0 })).itemsCompared;

    expect(wider).toBeGreaterThan(capped);
    expect(unlimited).toBeGreaterThan(wider);
  });

  test("a wider search never returns a worse set than the capped one", () => {
    // The point of paying for the extra variants: the winner can only improve. The cap has to be explicit now that
    // no limit is the default, or this compares a run against itself.
    const capped = run(cfg({ ...wide, gearVariantLimit: 24 })).itemSet.setHPS;
    const unlimited = run(cfg({ ...wide, gearVariantLimit: 0 })).itemSet.setHPS;

    expect(unlimited).toBeGreaterThanOrEqual(capped);
  });

  test("leaving the limit alone searches everything selected", () => {
    // The limit is a brake for people who want one, not something you have to find and release first: whatever you
    // multi-select is what gets searched.
    expect(run(cfg(wide)).itemsCompared).toEqual(run(cfg({ ...wide, gearVariantLimit: 0 })).itemsCompared);
  });
});

/*
  Folio runes are multi-selectable on the same terms as gems and enchants: pin several in a slot and every
  combination is ranked as its own set. Slots used to hold a single shortName, and profiles saved before this
  still do, so the single-string form has to keep working.
*/
describe("Omnium Folio runes can be multi-selected", () => {
  const CRIT = 1279609, HASTE = 1279610, VERS = 1279613;
  const UNLEASHED_FIRE = 1279599; // Slot 1's automatic pick, which nothing selectable can change any more.

  test("an untouched profile is Automatic and expands into nothing", () => {
    expect(getFolioChoices(cfg(), 4)).toEqual([]);
    expect(countFolioCombinations(cfg())).toEqual(0);
    expect(buildFolioCombinations(cfg())).toEqual([]);
  });

  test("the single-string form saved by older profiles still resolves", () => {
    expect(getFolioChoices(cfg({ folioSlot4: "Crit" }), 4)).toEqual(["Crit"]);
    expect(getFolioGems(cfg({ folioSlot4: "Crit" }), "haste")[3]).toEqual(CRIT);
    // "Automatic" was the old empty state and must not be read as a rune name.
    expect(getFolioChoices(cfg({ folioSlot4: "Automatic" }), 4)).toEqual([]);
  });

  test("one pinned rune needs no expansion and is applied directly", () => {
    expect(buildFolioCombinations(cfg({ folioSlot4: ["Crit"] })).length).toEqual(1);
    expect(getFolioGems(cfg({ folioSlot4: ["Crit"] }), "haste")[3]).toEqual(CRIT);
  });

  test("several pinned runes expand into one combination each", () => {
    const combos = buildFolioCombinations(cfg({ folioSlot4: ["Crit", "Haste", "Vers"] }));
    expect(combos.length).toEqual(3);
    expect(combos.map((c) => c[4]).sort()).toEqual(["Crit", "Haste", "Vers"]);
  });

  test("the count agrees with the build, and the cap applies", () => {
    const settings = cfg({ folioSlot4: ["Crit", "Haste", "Vers"] });
    expect(countFolioCombinations(settings)).toEqual(3);
    expect(buildFolioCombinations(settings).length).toEqual(3);
    expect(buildFolioCombinations(settings, 2).length).toEqual(2);
  });

  test("a variant picks the stat rune, and every other slot stays Automatic", () => {
    const settings = cfg({ folioSlot4: ["Crit", "Vers"] });

    expect(getFolioGems(settings, "haste", { 4: "Vers" })).toEqual([UNLEASHED_FIRE, 1279603, 1287555, VERS, 1279614]);
    expect(getFolioGems(settings, "haste", { 4: "Crit" })).toEqual([UNLEASHED_FIRE, 1279603, 1287555, CRIT, 1279614]);
  });

  test("only the stat slot is selectable at all", () => {
    // Slots 1 and 5 are deliberately not offered - their runes are procs the engine already picks well, and
    // searching them multiplied every run for nothing.
    expect(Object.keys(FOLIO_SLOT_SETTINGS)).toEqual([String(FOLIO_STAT_SLOT)]);
    expect(getFolioChoices(cfg({ folioSlot1: ["Void-Touched"] }), 1)).toEqual([]);
    expect(getFolioGems(cfg({ folioSlot1: ["Void-Touched"] }), "haste")[0]).toEqual(UNLEASHED_FIRE);
  });

  test("several pinned but no variant falls back to Automatic rather than guessing one", () => {
    // Without a variant there is no single answer, so the slot must not silently take the first pick.
    const settings = cfg({ folioSlot4: ["Crit", "Vers"] });
    expect(getFolioGems(settings, "haste")[3]).toEqual(HASTE);
  });

  test("a stale rune name in a list falls through to Automatic", () => {
    expect(getFolioGems(cfg({ folioSlot4: ["No Such Rune"] }), "haste")[3]).toEqual(HASTE);
    expect(getFolioGems(cfg({ folioSlot4: ["No Such Rune"] }), "haste").length).toEqual(5);
  });

  test("the detailed toggle still gates them", () => {
    const off = cfg({ folioSlot4: ["Crit", "Vers"], detailedGearOptions: false });
    expect(getFolioChoices(off, 4)).toEqual([]);
    expect(countFolioCombinations(off)).toEqual(0);
    expect(buildFolioCombinations(off)).toEqual([]);
  });

  test("multi-selecting runes evaluates more sets and still returns one winner", () => {
    const single = run(cfg({ folioSlot4: ["Crit"] }));
    const multi = run(cfg({ folioSlot4: ["Crit", "Haste", "Mastery", "Vers"] }));

    expect(multi.itemsCompared).toEqual(single.itemsCompared * 4);
    expect(multi.itemSet).toBeTruthy();
    // The winner must actually be wearing one of the runes that were offered.
    expect([CRIT, HASTE, 1279612, VERS]).toContain(multi.itemSet.folioGems[3]);
  });

  test("offering extra runes never produces a worse winner than offering one", () => {
    const single = run(cfg({ folioSlot4: ["Vers"] })).itemSet.setHPS;
    const multi = run(cfg({ folioSlot4: ["Crit", "Haste", "Mastery", "Vers"] })).itemSet.setHPS;

    expect(multi).toBeGreaterThanOrEqual(single);
  });

  test("runes expand alongside gems and enchants, all three at once", () => {
    const plain = run(cfg()).itemsCompared;
    const all = run(cfg({
      selectedGems: [240898, 240890],
      enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage"] },
      folioSlot4: ["Crit", "Haste"],
      gearVariantLimit: 0,
    })).itemsCompared;

    // The gem figure depends on the set's socket count, but every axis multiplies in, so the total has to be a
    // clean multiple of the 2 enchants x 2 runes the other two contribute.
    expect(all).toBeGreaterThan(plain);
    expect(all % 4).toEqual(0);
  });
});

/*
  Optimize Everything. A settings-panel switch that replaces pinning with a full search: the engine tries every
  gem, enchant and Folio rune itself. It supersedes the pins rather than writing to them, so turning it off leaves
  whatever the player had chosen exactly as they left it.
*/
const { getGemSearchSpace, getEnchantSearchSpace } = require("./TopGearEngine");
const { getFolioSearchSpace, getFolioOptions } = require("Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData");
const { getCurrentStatGems } = require("Databases/GemDB");
const { ENCHANTABLE_SLOTS } = require("Databases/EnchantDB");

describe("Optimize Everything searches the lot", () => {
  const SPEC = "Preservation Evoker";
  // It's a settings-panel switch, so it stands on its own rather than needing the gear panel's Detailed toggle.
  const all = (overrides = {}) => cfg({ ...overrides, detailedGearOptions: false, optimizeAllGearOptions: true });

  test("defaults to off", () => {
    expect(base.optimizeAllGearOptions.value).toBe(false);
    expect(getGemSearchSpace(cfg())).toEqual([]);
  });

  test("every current stat gem is searched, and no metas", () => {
    const searched = getGemSearchSpace(all());
    expect(searched).toEqual(getCurrentStatGems().map((gem) => gem.id));
    expect(searched.length).toBeGreaterThan(1);
    expect(searched).not.toContain(240983); // Indecipherable Eversong Diamond, a meta.
  });

  test("every enchant in every slot is searched", () => {
    const searched = getEnchantSearchSpace(all(), SPEC);
    const slotsWithOptions = ENCHANTABLE_SLOTS.filter((slot) => getEnchantsForSlot(slot, SPEC).length > 0);

    expect(Object.keys(searched).sort()).toEqual(slotsWithOptions.sort());
    slotsWithOptions.forEach((slot) => {
      expect(searched[slot]).toEqual(getEnchantsForSlot(slot, SPEC).map((enchant) => enchant.id));
    });
  });

  test("every Folio stat rune is searched", () => {
    expect(getFolioSearchSpace(all(), FOLIO_STAT_SLOT)).toEqual(getFolioOptions(FOLIO_STAT_SLOT));
  });

  test("it supersedes the player's pins without overwriting them", () => {
    const pinned = { selectedGems: [240914], enchantChoices: { CombinedWeapon: ["Arcane Mastery"] }, folioSlot4: ["Crit"] };

    // The search ignores the pins...
    expect(getGemSearchSpace(all(pinned)).length).toBeGreaterThan(1);
    expect(getEnchantSearchSpace(all(pinned), SPEC).CombinedWeapon.length).toBeGreaterThan(1);
    expect(getFolioSearchSpace(all(pinned), 4).length).toBeGreaterThan(1);

    // ...but the pins are still sitting there for when it's switched back off.
    expect(getGemSearchSpace(cfg(pinned))).toEqual([240914]);
    expect(getEnchantSearchSpace(cfg(pinned), SPEC)).toEqual({ CombinedWeapon: ["Arcane Mastery"] });
    expect(getFolioSearchSpace(cfg(pinned), 4)).toEqual(["Crit"]);
  });

  // A full-depth run over every gem, enchant, rune and consumable is the slowest thing in this file, so the tests
  // below share one rather than paying for it each.
  let fullRun = null;
  const searchedEverything = () => (fullRun = fullRun || run(all()));

  test("it sets its own depth, whatever the depth setting says", () => {
    // The dropdown is disabled in the panel while this is on, but a value left behind in an older profile mustn't
    // quietly truncate the search either.
    expect(resolveVariantLimit(all({ gearVariantLimit: 24 }))).toEqual(Infinity);
    expect(resolveVariantLimit(all({ gearVariantLimit: 150 }))).toEqual(Infinity);
    expect(searchedEverything().itemsCompared).toBeGreaterThan(run(cfg()).itemsCompared);
  });

  test("the winner is a real set, wearing real gems and enchants", () => {
    const best = searchedEverything().itemSet;

    expect(best).toBeTruthy();
    expect(best.setHPS).toBeGreaterThan(0);
    best.enchantBreakdown["Gems"].slice(1).forEach((gem) => {
      expect(getCurrentStatGems().map((g) => g.id)).toContain(gem);
    });
  });

  test("it never returns a worse set than the plain run", () => {
    expect(searchedEverything().itemSet.setHPS).toBeGreaterThanOrEqual(run(cfg()).itemSet.setHPS);
  });

  test("a capped search still can't lose to the plain run", () => {
    // Capping keeps the first N combinations, not the best N, so the engine's automatic pick is entered as a
    // candidate too. Without that this genuinely loses at some limits. Only reachable through the gear panel now
    // that Optimize Everything ignores the limit, but it's still reachable.
    [24, 150].forEach((gearVariantLimit) => {
      const capped = run(cfg({ ...WIDE_SELECTION, gearVariantLimit })).itemSet.setHPS;
      expect(capped).toBeGreaterThanOrEqual(run(cfg()).itemSet.setHPS);
    });
  });
});

/*
  Run progress. The engine reports where it is so the page can show a bar and an estimate. It's optional - every
  other test in this file calls runTopGear without it - so the contract worth pinning is that the numbers add up.
*/
describe("A run reports its progress", () => {
  const runWithProgress = (settings) => {
    const updates = [];
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      player.addActiveItem(item);
    });
    const result = runTopGear(player.getSelectedItems(), buildNewWepCombos(player, player.getSelectedItems()), player,
                              "Raid", 1000, settings, player.getActiveModel("Raid"), false, (p) => updates.push(p));
    return { result, updates };
  };

  test("it reports setup first, then evaluation, then ranking", () => {
    const { updates } = runWithProgress(cfg());
    const stages = [...new Set(updates.map((u) => u.stage))];

    // Sets are built and scored together, so there is no separate building stage - just the setup before any of
    // it starts, which has nothing to count.
    expect(stages).toEqual(["Preparing", "Evaluating sets", "Ranking results"]);
    expect(updates[0].total).toEqual(0);
  });

  test("done climbs to exactly the total, and never past it", () => {
    const { updates } = runWithProgress(cfg({ selectedGems: [240898, 240890, 240914] }));
    const measured = updates.filter((u) => u.total > 0);

    expect(measured.length).toBeGreaterThan(1);
    measured.forEach((u) => expect(u.done).toBeLessThanOrEqual(u.total));
    measured.reduce((previous, u) => {
      expect(u.done).toBeGreaterThanOrEqual(previous);
      return u.done;
    }, 0);

    const last = measured[measured.length - 1];
    expect(last.done).toEqual(last.total);
  });

  test("the total counts evaluations, so a wider search reports a bigger one", () => {
    const totalFor = (settings) => {
      const measured = runWithProgress(settings).updates.filter((u) => u.total > 0);
      return measured[measured.length - 1].total;
    };
    const wide = { selectedGems: [240898, 240890, 240914], gearVariantLimit: 0 };

    expect(totalFor(cfg(wide))).toBeGreaterThan(totalFor(cfg()));
  });

  test("a run without a callback behaves identically", () => {
    const settings = cfg({ selectedGems: [240898, 240890] });
    expect(runWithProgress(settings).result.itemSet.setHPS).toEqual(run(settings).itemSet.setHPS);
  });
});

/*
  The gem stat split. GEM_MAJOR_STAT / GEM_MINOR_STAT are what the engine's gem lookup searches by, so if they
  ever disagree with the rows in GemDB the lookup silently finds nothing and falls back to a placeholder gem.
  That's exactly how the split sat wrong at 16/9 for a while, so it's pinned here.
*/
const { GEM_MAJOR_STAT, GEM_MINOR_STAT } = require("Databases/GemDB");

describe("Current tier gems are a 16 / 7 split", () => {
  const { GEM_SOLO_STAT } = require("Databases/GemDB");
  const GEM_LOOKUP_FALLBACK = 213482; // What getGemID returns when it can't find a match.

  test("the constants are the split the tier actually grants", () => {
    expect(GEM_MAJOR_STAT).toEqual(16);
    expect(GEM_MINOR_STAT).toEqual(7);
  });

  test("every current stat gem is either the split or a single stat", () => {
    const gems = getCurrentStatGems();
    expect(gems.length).toBeGreaterThan(0);

    gems.forEach((gem) => {
      const amounts = Object.values(gem.stats).sort((a, b) => b - a);
      // A gem is one or the other - a hybrid at 16/7, or the whole budget in one stat.
      if (amounts.length === 1) expect(amounts).toEqual([GEM_SOLO_STAT]);
      else expect(amounts).toEqual([GEM_MAJOR_STAT, GEM_MINOR_STAT]);
    });
  });

  test("the engine's lookup finds real gems, not the fallback", () => {
    // A run socketing the fallback means the constants and the rows have drifted apart.
    const socketed = run(cfg()).itemSet.enchantBreakdown["Gems"];
    expect(socketed.length).toBeGreaterThan(0);
    expect(socketed).not.toContain(GEM_LOOKUP_FALLBACK);
  });
});

/*
  Close alternatives. Expanding a run into variants means most alternatives now differ from the winner by an
  enchant, gem or rune rather than by an item - and a differential that only compared items rendered those as a
  bare score with nothing beside it. Every alternative has to be able to say what it changed.
*/
describe("Every close alternative says what it swapped", () => {
  const swapCount = (d) => d.items.length + d.gems.length + d.enchants.length + d.runes.length;

  test("an enchant-only alternative reports the enchant", () => {
    const result = run(cfg({ enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"] } }));
    const enchantSwaps = result.differentials.filter((d) => d.enchants.length > 0);

    expect(enchantSwaps.length).toBeGreaterThan(0);
    enchantSwaps.forEach((d) => {
      d.enchants.forEach((swap) => {
        expect(swap.slot).toBeTruthy();
        expect(swap.name).toBeTruthy();
      });
    });
  });

  test("a rune-only alternative reports the rune by name, not by ID", () => {
    const result = run(cfg({ folioSlot4: ["Crit", "Haste", "Mastery", "Vers"] }));
    const runeSwaps = result.differentials.filter((d) => d.runes.length > 0);

    expect(runeSwaps.length).toBeGreaterThan(0);
    runeSwaps.forEach((d) => d.runes.forEach((rune) => {
      expect(typeof rune).toEqual("string");
      expect(rune).not.toMatch(/^\d+$/); // A bare ID means the name lookup failed.
    }));
  });

  test("no alternative comes back with nothing to show", () => {
    // This is the bug the fields exist for: a row with a score and no explanation of what changed.
    const wide = {
      selectedGems: [240898, 240890, 240914],
      enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage"] },
      folioSlot4: ["Crit", "Haste"],
      gearVariantLimit: 0,
    };

    const differentials = run(cfg(wide)).differentials;
    expect(differentials.length).toBeGreaterThan(0);
    differentials.forEach((d) => expect(swapCount(d)).toBeGreaterThan(0));
  });

  test("a plain run's alternatives still differ by items", () => {
    run(cfg()).differentials.forEach((d) => expect(swapCount(d)).toBeGreaterThan(0));
  });
});

/*
  Rings are enchanted one at a time. A set wears two and the game enchants each on its own, so they're two
  independent choices rather than one applied to the pair. It matters beyond bookkeeping: secondaries diminish, so
  29 crit and 29 haste can beat 58 of either.
*/
const { RING_SLOTS, enchantSlotSource, getEnchantsForSlot: enchantsForSlot } = require("Databases/EnchantDB");
const { normaliseEnchantChoices } = require("./TopGearEngine");

describe("Each ring is enchanted separately", () => {
  test("both ring slots are selectable, and both draw from the Finger list", () => {
    expect(RING_SLOTS).toEqual(["Finger1", "Finger2"]);
    RING_SLOTS.forEach((slot) => {
      expect(ENCHANTABLE_SLOTS).toContain(slot);
      expect(enchantSlotSource(slot)).toEqual("Finger");
      expect(enchantsForSlot(slot, "Preservation Evoker")).toEqual(enchantsForSlot("Finger", "Preservation Evoker"));
    });
    expect(ENCHANTABLE_SLOTS).not.toContain("Finger");
  });

  test("the two rings can carry different enchants", () => {
    const r = run(cfg({ enchantChoices: { Finger1: ["Nature's Fury"], Finger2: ["Silvermoon's Alacrity"] } }));

    expect(r.itemSet.enchantBreakdown["Finger1"]).toEqual("Nature's Fury");
    expect(r.itemSet.enchantBreakdown["Finger2"]).toEqual("Silvermoon's Alacrity");
  });

  test("both rings' enchants land, rather than one for the pair", () => {
    // Same enchant on both is worth twice one of them. Compared against a mismatched pair, which splits the
    // budget across two stats, so the totals differ in shape rather than amount.
    const both = run(cfg({ enchantChoices: { Finger1: ["Nature's Fury"], Finger2: ["Nature's Fury"] } }));
    const split = run(cfg({ enchantChoices: { Finger1: ["Nature's Fury"], Finger2: ["Silvermoon's Alacrity"] } }));

    expect(both.itemSet.setStats.crit - split.itemSet.setStats.crit).toBeGreaterThan(0);
    expect(split.itemSet.setStats.haste - both.itemSet.setStats.haste).toBeGreaterThan(0);
  });

  test("the rings expand as two axes, not one", () => {
    const pair = ["Nature's Fury", "Silvermoon's Alacrity"];
    // Two choices on each of two rings is four combinations, where one shared choice would only be two.
    expect(countEnchantCombinations(getEnchantSearchSpace(cfg({
      enchantChoices: { Finger1: pair, Finger2: pair },
    }), "Preservation Evoker"))).toEqual(4);
  });

  test("offering every ring enchant on both rings never loses to offering one", () => {
    const options = enchantsForSlot("Finger", "Preservation Evoker").map((e) => e.id);
    const names = enchantsForSlot("Finger", "Preservation Evoker").map((e) => e.name);

    const single = run(cfg({ enchantChoices: { Finger1: [options[0]], Finger2: [options[0]] } }));
    const searched = run(cfg({ enchantChoices: { Finger1: options, Finger2: options }, gearVariantLimit: 0 }));

    expect(searched.itemSet.setHPS).toBeGreaterThanOrEqual(single.itemSet.setHPS);
    // Whatever it settles on, both rings have to end up wearing something that was actually on offer.
    RING_SLOTS.forEach((slot) => expect(names).toContain(searched.itemSet.enchantBreakdown[slot]));
  });

  test("profiles saved before the split still apply their pick to both rings", () => {
    expect(normaliseEnchantChoices({ Finger: ["Nature's Fury"] }))
      .toEqual({ Finger1: ["Nature's Fury"], Finger2: ["Nature's Fury"] });

    // An explicit per-ring choice wins over the old shared one rather than being overwritten by it.
    expect(normaliseEnchantChoices({ Finger: ["Nature's Fury"], Finger1: ["Zul'jin's Mastery"] }))
      .toEqual({ Finger1: ["Zul'jin's Mastery"], Finger2: ["Nature's Fury"] });

    expect(normaliseEnchantChoices({ Head: ["a"] })).toEqual({ Head: ["a"] });
    expect(normaliseEnchantChoices(null)).toEqual({});
  });

  test("close alternatives name which ring changed", () => {
    const options = enchantsForSlot("Finger", "Preservation Evoker").map((e) => e.id);
    const differentials = run(cfg({ enchantChoices: { Finger1: options, Finger2: options }, gearVariantLimit: 0 })).differentials;
    const ringSwaps = differentials.flatMap((d) => d.enchants).filter((e) => RING_SLOTS.includes(e.slot));

    expect(ringSwaps.length).toBeGreaterThan(0);
    ringSwaps.forEach((swap) => expect(["Finger1", "Finger2"]).toContain(swap.slot));
  });
});

/*
  Flasks and food. Both are searchable on the same terms as everything else, but with one difference: leaving them
  empty falls back to the single dropdown in the settings panel rather than to an engine default, so the simple
  path keeps working exactly as it did.
*/
const { getConsumableSearchSpace, countConsumableCombinations, buildConsumableCombinations,
        CONSUMABLE_OPTIONS } = require("./TopGearEngine");

describe("Flasks and food can be multi-selected", () => {
  test("an untouched profile searches neither and expands into nothing", () => {
    expect(getConsumableSearchSpace(cfg())).toEqual({});
    expect(countConsumableCombinations(cfg())).toEqual(0);
    expect(buildConsumableCombinations(cfg())).toEqual([]);
  });

  test("the settings panel's single choice still drives an unpinned run", () => {
    const crit = run(cfg({ flaskChoice: "Crit" })).itemSet;
    const haste = run(cfg({ flaskChoice: "Haste" })).itemSet;

    expect(crit.enchantBreakdown.flask).toEqual("Flask of the Shattered Sun");
    expect(haste.enchantBreakdown.flask).toEqual("Flask of the Blood Knights");
    expect(crit.setStats.crit - haste.setStats.crit).toBeGreaterThan(0);
  });

  test("one pinned flask needs no expansion and is applied directly", () => {
    expect(buildConsumableCombinations(cfg({ flaskChoices: ["Mastery"] })).length).toEqual(1);
    expect(run(cfg({ flaskChoices: ["Mastery"] })).itemSet.enchantBreakdown.flask).toEqual("Flask of the Magisters");
  });

  test("a pinned flask overrides the settings panel's choice", () => {
    const r = run(cfg({ flaskChoice: "Crit", flaskChoices: ["Versatility"] }));
    expect(r.itemSet.enchantBreakdown.flask).toEqual("Flask of Thalassian Resistance");
  });

  test("several pinned flasks expand into one combination each", () => {
    const combos = buildConsumableCombinations(cfg({ flaskChoices: ["Crit", "Haste", "Mastery"] }));
    expect(combos.length).toEqual(3);
    expect(combos.map((c) => c.flask).sort()).toEqual(["Crit", "Haste", "Mastery"]);
  });

  test("flask and food multiply together", () => {
    const settings = cfg({ flaskChoices: ["Crit", "Haste"], foodChoices: ["Intellect Food", "None"] });
    expect(countConsumableCombinations(settings)).toEqual(4);
    expect(buildConsumableCombinations(settings).length).toEqual(4);
    expect(buildConsumableCombinations(settings, 3).length).toEqual(3);
  });

  test("food genuinely changes the set it's on", () => {
    const withFood = run(cfg({ foodChoices: ["Intellect Food"] })).itemSet;
    const without = run(cfg({ foodChoices: ["None"] })).itemSet;

    // Not exactly the flat 50 the food grants - intellect is multiplied by buffs and talents afterwards.
    expect(withFood.setStats.intellect - without.setStats.intellect).toBeGreaterThan(0);
    expect(withFood.enchantBreakdown.food).toEqual("Intellect Food");
    expect(without.enchantBreakdown.food).toBeUndefined();
  });

  test("Amani Cornucopia grants a secondary rather than intellect", () => {
    // 71.5 of the player's best secondary, where the plain food gives 50 intellect. Which secondary depends on
    // the spec's weights, so it's read from the set rather than named here.
    const cornucopia = run(cfg({ foodChoices: ["Amani Cornucopia"] })).itemSet;
    const intellect = run(cfg({ foodChoices: ["Intellect Food"] })).itemSet;
    const none = run(cfg({ foodChoices: ["None"] })).itemSet;

    expect(cornucopia.enchantBreakdown.food).toEqual("Amani Cornucopia");
    expect(cornucopia.setStats.intellect).toEqual(none.setStats.intellect);
    expect(intellect.setStats.intellect).toBeGreaterThan(none.setStats.intellect);

    const secondaries = ["haste", "crit", "mastery", "versatility"];
    const gained = secondaries.filter((stat) => cornucopia.setStats[stat] > none.setStats[stat]);
    expect(gained.length).toEqual(1);
    // Slightly under the raw 71.5 - secondaries pass through diminishing returns on the way into the set.
    const gain = cornucopia.setStats[gained[0]] - none.setStats[gained[0]];
    expect(gain).toBeLessThanOrEqual(71.5);
    expect(gain).toBeGreaterThan(65);
  });

  test("an unrecognised food falls back to the plain intellect one", () => {
    // Stale local storage shouldn't cost the player their food buff entirely.
    const stale = run(cfg({ foodChoices: ["Feast of Nothing"] })).itemSet;
    const intellect = run(cfg({ foodChoices: ["Intellect Food"] })).itemSet;

    expect(stale.enchantBreakdown.food).toEqual("Intellect Food");
    expect(stale.setStats.intellect).toEqual(intellect.setStats.intellect);
  });

  test("searching food finds the better of the two", () => {
    const searched = run(cfg({ foodChoices: ["Intellect Food", "Amani Cornucopia"] }));
    const best = Math.max(run(cfg({ foodChoices: ["Intellect Food"] })).itemSet.setHPS,
                          run(cfg({ foodChoices: ["Amani Cornucopia"] })).itemSet.setHPS);

    expect(searched.itemSet.setHPS).toEqual(best);
    expect(["Intellect Food", "Amani Cornucopia"]).toContain(searched.itemSet.enchantBreakdown.food);
  });

  test("multi-selecting evaluates more sets and picks a flask that was offered", () => {
    const single = run(cfg({ flaskChoices: ["Crit"] }));
    const searched = run(cfg({ flaskChoices: ["Crit", "Haste", "Mastery", "Versatility"] }));

    expect(searched.itemsCompared).toEqual(single.itemsCompared * 4);
    expect(searched.itemSet.setHPS).toBeGreaterThanOrEqual(single.itemSet.setHPS);
    expect(["Flask of the Shattered Sun", "Flask of the Blood Knights",
            "Flask of the Magisters", "Flask of Thalassian Resistance"]).toContain(searched.itemSet.enchantBreakdown.flask);
  });

  test("several pinned but no variant leaves the settings panel's choice standing", () => {
    // There's no single answer without a variant, so it must not silently take the first pick.
    expect(run(cfg({ flaskChoice: "Crit", flaskChoices: ["Haste", "Mastery"] })).itemsCompared).toBeGreaterThan(0);
    expect(buildConsumableCombinations(cfg({ flaskChoices: ["Haste", "Mastery"] })).length).toEqual(2);
  });

  test("the detailed toggle gates them", () => {
    const off = cfg({ flaskChoices: ["Crit", "Haste"], detailedGearOptions: false });
    expect(getConsumableSearchSpace(off)).toEqual({});
    expect(countConsumableCombinations(off)).toEqual(0);
  });

  test("Optimize Everything searches every flask and both food states", () => {
    const all = cfg({ detailedGearOptions: false, optimizeAllGearOptions: true });
    expect(getConsumableSearchSpace(all)).toEqual(CONSUMABLE_OPTIONS);
    expect(countConsumableCombinations(all)).toEqual(CONSUMABLE_OPTIONS.flask.length * CONSUMABLE_OPTIONS.food.length);
  });
});

/*
  The ranking collector. Sets are scored in the millions but only the top few thousand are ever read, so they're
  collected as the run goes rather than sorted at the end. What has to hold is that this keeps the same sets the old
  sort-everything-then-slice kept, since that's the entire basis for doing it.
*/
describe("TopSets keeps what sorting everything would have kept", () => {
  // Scores only - the collector never looks at anything else on a set.
  const scored = (scores) => scores.map((hardScore, id) => ({ id, hardScore }));
  const sortThenSlice = (sets, limit) =>
    [...sets].sort((a, b) => (a.hardScore < b.hardScore ? 1 : -1)).slice(0, limit);
  const collect = (sets, limit) => {
    const top = new TopSets(limit);
    sets.forEach((set) => top.add(set));
    return top.toArray();
  };
  // Ties are unordered either way - the comparator never returns 0 - so the scores kept are the contract, not which
  // of two equally scoring sets fills the last slot.
  const scoresOf = (sets) => sets.map((set) => set.hardScore);

  test("a stream longer than the limit matches sorting the lot", () => {
    const sets = scored(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 5000));
    expect(scoresOf(collect(sets, 100))).toEqual(scoresOf(sortThenSlice(sets, 100)));
  });

  test("arrival order doesn't change what survives", () => {
    const scores = Array.from({ length: 2000 }, (_, i) => (i * 104729) % 1000);
    const ascending = scored([...scores].sort((a, b) => a - b));
    const descending = scored([...scores].sort((a, b) => b - a));
    // Worst-first is the hard case: every set beats the running cut-off and the buffer churns constantly.
    expect(scoresOf(collect(ascending, 50))).toEqual(scoresOf(collect(descending, 50)));
  });

  test("ties at the cut-off don't cost a slot", () => {
    const sets = scored([...Array(200).fill(10), ...Array(200).fill(5)]);
    const kept = collect(sets, 300);
    expect(kept).toHaveLength(300);
    expect(scoresOf(kept)).toEqual(scoresOf(sortThenSlice(sets, 300)));
  });

  test("fewer sets than the limit are all kept, best first", () => {
    const sets = scored([3, 1, 4, 1, 5]);
    expect(scoresOf(collect(sets, 100))).toEqual([5, 4, 3, 1, 1]);
  });

  test("nothing added yields nothing", () => {
    expect(collect([], 100)).toEqual([]);
  });

  test("the buffer never grows without bound", () => {
    const top = new TopSets(10);
    // Fed best-first, so every later set is below the cut-off and must be dropped rather than accumulated.
    for (let i = 100000; i > 0; i--) top.add({ id: i, hardScore: i });
    expect(top.toArray()).toHaveLength(10);
    expect(scoresOf(top.toArray())).toEqual([100000, 99999, 99998, 99997, 99996, 99995, 99994, 99993, 99992, 99991]);
  });
});

/*
  The single-stat gems. They put everything into one stat rather than splitting 16/7, so they're the right pick
  whenever one stat is far enough ahead to be worth giving up the split, and the optimiser can't find that unless
  they're actually in the database.
*/
describe("Single-stat gems are searchable", () => {
  const { getCurrentStatGems, GEM_SOLO_STAT, GEM_MAJOR_STAT, GEM_MINOR_STAT } = require("Databases/GemDB");

  const soloGems = () => getCurrentStatGems().filter((gem) => Object.keys(gem.stats).length === 1);

  test("there is one for each secondary", () => {
    expect(soloGems().map((gem) => Object.keys(gem.stats)[0]).sort()).toEqual(["crit", "haste", "mastery", "versatility"]);
  });

  test("each grants the full amount in that stat and nothing else", () => {
    soloGems().forEach((gem) => {
      expect(Object.values(gem.stats)).toEqual([GEM_SOLO_STAT]);
      // Worth more than a hybrid's major stat, which is the entire reason to consider one.
      expect(GEM_SOLO_STAT).toBeGreaterThan(GEM_MAJOR_STAT);
      expect(GEM_SOLO_STAT).toBeLessThan(GEM_MAJOR_STAT + GEM_MINOR_STAT);
    });
  });

  test("they carry distinct ids and are not mistaken for metas", () => {
    const ids = soloGems().map((gem) => gem.id);
    expect(new Set(ids).size).toEqual(4);
    // getCurrentStatGems already excludes metas, so reaching here at all is the assertion.
    expect(soloGems().length).toEqual(4);
  });

  test("Optimize Everything searches them alongside the hybrids", () => {
    const searched = getGemSearchSpace(cfg({ optimizeAllGearOptions: true }));
    soloGems().forEach((gem) => expect(searched).toContain(gem.id));
    expect(searched.length).toEqual(16); // 12 hybrids + 4 solos.
  });

  test("a set can be gemmed entirely with one of them", () => {
    const solo = soloGems()[0].id;
    const best = run(cfg({ selectedGems: [solo], replaceExistingGems: true })).itemSet;
    // Socket 0 is the meta and is chosen separately, so the stat sockets are the ones that must all be the pick.
    expect(best.enchantBreakdown["Gems"].slice(1).every((gem) => gem === solo)).toBe(true);
  });
});

/*
  Sharding. A run splits across several workers, each evaluating a disjoint slice of the gear sets and keeping its
  own best few thousand. The whole point is that this is a speed change and nothing else, so what has to hold is
  that the merged report matches the one a single thread produces.
*/
describe("A sharded run matches an unsharded one", () => {
  const player = () => {
    const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      p.addActiveItem(item);
    });
    return p;
  };

  const sharded = (settings, count) => {
    const p = player();
    const shards = [];
    for (let index = 0; index < count; index++) {
      shards.push(runTopGearShard(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"),
                                  settings, p.getActiveModel("Raid"), true, undefined, { index, count }));
    }
    return finishTopGear(shards, p, "Raid", p.getActiveModel("Raid"));
  };

  // Enough of a search that the shards actually have to compete, rather than each trivially keeping everything.
  const settings = () => cfg(WIDE_SELECTION);

  test("the winning set is identical however many ways it is split", () => {
    const whole = run(settings());

    [2, 3, 4].forEach((count) => {
      const split = sharded(settings(), count);
      expect(split.itemSet.hardScore).toEqual(whole.itemSet.hardScore);
      expect(split.itemSet.setHPS).toEqual(whole.itemSet.setHPS);
      expect(split.itemSet.itemList.map((i) => i.id).sort()).toEqual(whole.itemSet.itemList.map((i) => i.id).sort());
      expect(split.itemSet.enchantBreakdown["Gems"]).toEqual(whole.itemSet.enchantBreakdown["Gems"]);
    });
  });

  test("every set is evaluated exactly once across the shards", () => {
    const whole = run(settings());
    const split = sharded(settings(), 4);

    // itemsCompared is the kept slice, so it can only match if the shards between them saw the same sets.
    expect(split.itemsCompared).toEqual(whole.itemsCompared);
  });

  test("the shards divide the gear sets between them without overlap", () => {
    const p = player();
    const built = (count) => {
      let total = 0;
      for (let index = 0; index < count; index++) {
        total += runTopGearShard(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"),
                                 cfg(), p.getActiveModel("Raid"), true, undefined, { index, count }).setsBuilt;
      }
      return total;
    };

    const whole = built(1);
    [2, 3, 4, 5].forEach((count) => expect(built(count)).toEqual(whole));
  });

  test("close alternatives survive the merge", () => {
    const whole = run(settings());
    const split = sharded(settings(), 4);

    expect(split.differentials.length).toEqual(whole.differentials.length);
    expect(split.differentials.map((d) => d.scoreDifference)).toEqual(whole.differentials.map((d) => d.scoreDifference));
  });

  test("one shard of one is just the plain run", () => {
    const whole = run(settings());
    const single = sharded(settings(), 1);

    expect(single.itemSet.hardScore).toEqual(whole.itemSet.hardScore);
    expect(single.itemsCompared).toEqual(whole.itemsCompared);
  });
});

/*
  Run size. Sets are built and scored one at a time rather than collected first, so the run's total is worked out
  from the item list before anything is built. That total has to be exact - it's what the bar counts against, and
  a total the run never reaches would leave it stuck short forever.
*/
describe("A run knows its size before it starts", () => {
  const withGear = (extraGear = []) => {
    const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    [...GEAR, ...extraGear].forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      p.addActiveItem(item);
    });
    return p;
  };

  const evaluating = (player, settings = cfg()) => {
    const seen = [];
    const result = runTopGearShard(player.activeItems, buildNewWepCombos(player, true), player, "Raid",
                                   player.getHPS("Raid"), settings, player.getActiveModel("Raid"), true,
                                   (update) => { if (update.stage === "Evaluating sets") seen.push({ ...update }); });
    return { seen, result };
  };

  test("the total is right from the very first report", () => {
    const { seen } = evaluating(withGear());
    expect(seen.length).toBeGreaterThan(0);
    // Not refined as it goes - the first report already knows how much work there is.
    expect(new Set(seen.map((update) => update.total)).size).toEqual(1);
  });

  test("the promised total is the work actually done", () => {
    const player = withGear();
    const { seen, result } = evaluating(player);
    // One variant on an untouched profile, so the evaluation total is exactly the sets built.
    expect(seen[0].total).toEqual(result.setsBuilt);
    expect(seen[0].total).toEqual(countGearSets(player.activeItems, buildNewWepCombos(player, true)));
  });

  test("extra rings and trinkets are counted as pairs, not as a product", () => {
    // The slots that take two items are where a plain product would promise sets the run never builds.
    const player = withGear([[268248, "Finger"], [270174, "Trinket"]]);
    const { seen, result } = evaluating(player);

    expect(seen[0].total).toEqual(result.setsBuilt);
  });

  test("more gear means more work", () => {
    const few = evaluating(withGear()).seen[0].total;
    const more = evaluating(withGear([[268229, "Head"], [268224, "Chest"]])).seen[0].total;

    expect(more).toBeGreaterThan(few);
  });

  test("variants multiply the total", () => {
    const player = withGear();
    const plain = evaluating(player).seen[0].total;
    const wide = evaluating(player, cfg(WIDE_SELECTION)).seen[0].total;

    expect(wide % plain).toEqual(0);
    expect(wide).toBeGreaterThan(plain);
  });
});

/*
  Sizing a run before it starts. A worker costs a full engine and database initialisation - measured at ~0.6s -
  before it evaluates anything, so spending eight of them on a two second run makes it slower. The count only has
  to be good enough to choose how many workers to spend, but it has to be right about the shape.
*/
describe("A run can be sized before it is built", () => {
  const playerWith = (gear) => {
    const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    gear.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      p.addActiveItem(item);
    });
    return p;
  };

  test("the set count matches the sets actually built", () => {
    [GEAR, [...GEAR, [268248, "Finger"], [270174, "Trinket"]], [...GEAR, [268229, "Head"]]].forEach((gear) => {
      const p = playerWith(gear);
      const wepCombos = buildNewWepCombos(p, true);
      const counted = countGearSets(p.activeItems, wepCombos);
      const built = runTopGearShard(p.activeItems, wepCombos, p, "Raid", p.getHPS("Raid"), cfg(),
                                    p.getActiveModel("Raid")).setsBuilt;
      expect(counted).toEqual(built);
    });
  });

  test("an untouched profile is one evaluation per set", () => {
    const p = playerWith(GEAR);
    const wepCombos = buildNewWepCombos(p, true);
    expect(estimateEvaluations(p.activeItems, wepCombos, cfg(), "Preservation Evoker"))
      .toEqual(countGearSets(p.activeItems, wepCombos));
  });

  test("multi-selecting raises the estimate", () => {
    const p = playerWith(GEAR);
    const wepCombos = buildNewWepCombos(p, true);
    const plain = estimateEvaluations(p.activeItems, wepCombos, cfg(), "Preservation Evoker");
    const wide = estimateEvaluations(p.activeItems, wepCombos, cfg(WIDE_SELECTION), "Preservation Evoker");
    const everything = estimateEvaluations(p.activeItems, wepCombos, cfg({ optimizeAllGearOptions: true }), "Preservation Evoker");

    expect(wide).toBeGreaterThan(plain);
    expect(everything).toBeGreaterThan(wide);
  });

  test("a depth cap holds the estimate down", () => {
    const p = playerWith(GEAR);
    const wepCombos = buildNewWepCombos(p, true);
    const capped = estimateEvaluations(p.activeItems, wepCombos, cfg({ ...WIDE_SELECTION, gearVariantLimit: 24 }), "Preservation Evoker");

    // Whatever the search space, a capped run evaluates each set at most that many times.
    expect(capped).toEqual(countGearSets(p.activeItems, wepCombos) * 24);
  });
});

/*
  Enchants that grant "your highest secondary" rather than a named stat. Which stat that is depends on the spec,
  so the database stores a marker and the engine resolves it while evaluating. Rite of the Hash'ey is the weapon
  enchant that works this way; Eyes of the Eagle is the ring one, and used to be hardcoded in the engine.
*/
describe("Enchants that grant your best secondary", () => {
  const { getEnchantById, BEST_SECONDARY } = require("Databases/EnchantDB");
  const SPEC_BEST = "mastery"; // Preservation Evoker's highest weighted secondary, per getHighestWeight.

  test("Rite of the Hash'ey is a weapon enchant granting the marker, not a fixed stat", () => {
    const rite = getEnchantById("Rite of the Hash'ey");

    expect(rite).toBeTruthy();
    expect(rite.slots).toContain("CombinedWeapon");
    expect(rite.procStats).toEqual({ [BEST_SECONDARY]: 139 });
  });

  test("choosing it lands the proc on the spec's best secondary", () => {
    const chosen = run(cfg({ enchantChoices: { CombinedWeapon: ["Rite of the Hash'ey"] } }));
    const other = run(cfg({ enchantChoices: { CombinedWeapon: ["Arcane Mastery"] } }));

    expect(chosen.itemSet.enchantBreakdown["CombinedWeapon"]).toEqual("Rite of the Hash'ey");
    // Budgeted above the 124 fixed enchants, so on the stat the spec values most it has to come out ahead.
    expect(chosen.itemSet.setStats[SPEC_BEST]).toBeGreaterThan(other.itemSet.setStats[SPEC_BEST]);
  });

  test("the marker never leaks into the set's stats as a stat of its own", () => {
    const chosen = run(cfg({ enchantChoices: { CombinedWeapon: ["Rite of the Hash'ey"] } }));

    expect(chosen.itemSet.setStats[BEST_SECONDARY]).toBeUndefined();
  });

  test("searching the weapon slot can pick it over the fixed enchants", () => {
    const searched = run(cfg({
      enchantChoices: { CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Rite of the Hash'ey"] },
    }));

    expect(["Arcane Mastery", "Berserker's Rage", "Rite of the Hash'ey"])
      .toContain(searched.itemSet.enchantBreakdown["CombinedWeapon"]);
  });

  test("Eyes of the Eagle still grants the ring budget to the best stat", () => {
    // It moved from a hardcoded branch in the engine to the same marker, so its value must not have moved with it.
    const eagle = getEnchantById("Eyes of the Eagle");
    expect(eagle.stats).toEqual({ [BEST_SECONDARY]: 29 });
  });
});

/*
  The equipped comparison. The report shows how much of an upgrade the best set is over what the player has on, so
  the baseline has to be their gear as it actually is - their own gems included. Evaluating it with the gems Top
  Gear would socket instead meant a run that changed no gear still reported an upgrade, because the engine had
  re-gemmed the baseline too.
*/
describe("The equipped set is measured wearing the player's own gems", () => {
  const SOCKETED = "240890:240890:240890"; // Deadly Peridot: haste major, crit minor.

  const withGems = (gems) => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      if (gems && item.socket) item.gemString = gems;
      player.addActiveItem(item);
    });
    return player;
  };

  const equippedHPS = (player, settings) =>
    runTopGear(player.activeItems, buildNewWepCombos(player, true), player, "Raid", player.getHPS("Raid"),
               settings, player.getActiveModel("Raid")).equippedHPS;

  test("what the player wears changes the baseline", () => {
    // If the baseline ignored socketed gems these two would be identical, which is the bug.
    const withOut = equippedHPS(withGems(null), cfg());
    const withSome = equippedHPS(withGems(SOCKETED), cfg());

    expect(withOut).toBeGreaterThan(0);
    expect(withSome).not.toEqual(withOut);
  });

  test("the setting to re-gem doesn't move the baseline", () => {
    // replaceExistingGems is about the sets being searched. The baseline is what the player has on either way.
    const player = () => withGems(SOCKETED);
    const replacing = equippedHPS(player(), cfg({ replaceExistingGems: true }));
    const keeping = equippedHPS(player(), cfg({ replaceExistingGems: false }));

    expect(replacing).toEqual(keeping);
  });

  test("an unrecognised socketed gem falls back rather than dropping the socket", () => {
    const nonsense = equippedHPS(withGems("999999:999999:999999"), cfg());

    expect(nonsense).toBeGreaterThan(0);
  });

  test("nothing equipped means no baseline to report", () => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = false;
      player.addActiveItem(item);
    });

    expect(equippedHPS(player, cfg())).toEqual(0);
  });
});

/*
  "Replace existing gems and enchants" as a top level option.

  It answers "am I willing to re-gem and re-enchant", which is a question about the run rather than about pinning
  individual choices, so it has to work without opening the detailed gear panel at all. Off, the gear keeps what
  it already has and Top Gear only decides what's empty.
*/
describe("Keeping the gems and enchants the player already has", () => {
  const { getEnchantByEnchantID } = require("Databases/EnchantDB");
  const SOCKETED = "240890:240890:240890";  // Deadly Peridot.
  const WORN_WEAPON = 7983;                 // Berserker's Rage.
  const WORN_RING = 7969;                   // Zul'jin's Mastery.

  // Deliberately no detailedGearOptions: the point is that this works on a plain run.
  const plain = (replace) => {
    const s = JSON.parse(JSON.stringify(base));
    s.replaceExistingGems = { ...s.replaceExistingGems, value: replace };
    return s;
  };

  const geared = () => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, 330, "");
      item.active = true;
      item.isEquipped = true;
      if (item.socket) item.gemString = SOCKETED;
      if (slot === "2H Weapon") item.enchantID = WORN_WEAPON;
      if (slot === "Finger") item.enchantID = WORN_RING;
      player.addActiveItem(item);
    });
    return player;
  };

  const topSet = (settings) => {
    const p = geared();
    return runTopGear(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"),
                      settings, p.getActiveModel("Raid")).itemSet;
  };

  test("it reads without the detailed panel being open", () => {
    expect(keepsExistingGear(plain(false))).toBe(true);
    expect(keepsExistingGear(plain(true))).toBe(false);
    // The settings panel writes booleans through as strings.
    expect(keepsExistingGear({ replaceExistingGems: { value: "false" } })).toBe(true);
    // An untouched profile replaces, exactly as before this was reachable.
    expect(keepsExistingGear(base)).toBe(false);
    expect(keepsExistingGear({})).toBe(false);
  });

  test("the gems already socketed are kept", () => {
    const kept = topSet(plain(false)).enchantBreakdown["Gems"];
    const replaced = topSet(plain(true)).enchantBreakdown["Gems"];

    // Socket 0 is the meta and is chosen separately either way; the stat sockets are what the setting governs.
    expect(kept.slice(1).every((gem) => gem === 240890)).toBe(true);
    expect(replaced.slice(1).every((gem) => gem === 240890)).toBe(false);
  });

  test("the enchants already applied are kept", () => {
    const kept = topSet(plain(false)).enchantBreakdown;

    expect(kept["CombinedWeapon"]).toEqual(getEnchantByEnchantID(WORN_WEAPON).name);
    expect(kept["Finger1"]).toEqual(getEnchantByEnchantID(WORN_RING).name);
  });

  test("replacing picks the engine's own enchant instead", () => {
    const replaced = topSet(plain(true)).enchantBreakdown;

    // Arcane Mastery is this spec's default, so it should differ from the Berserker's Rage worn above.
    expect(replaced["CombinedWeapon"]).not.toEqual(getEnchantByEnchantID(WORN_WEAPON).name);
  });

  test("a slot with nothing on is still decided by the engine", () => {
    // Head carries no enchantID in this fixture, so keeping has nothing to keep there.
    const kept = topSet(plain(false)).enchantBreakdown;

    expect(kept["Head"]).toBeTruthy();
    expect(kept["Head"]).not.toEqual("");
  });

  test("enchants aren't searched when they're being kept", () => {
    // Every combination would score the same on the slots being kept, so paying for them is pure waste.
    const searching = { ...plain(false), optimizeAllGearOptions: { value: true } };
    expect(enchantSpace(searching, "Preservation Evoker")).toEqual({});
    expect(Object.keys(enchantSpace({ ...plain(true), optimizeAllGearOptions: { value: true } }, "Preservation Evoker")).length)
      .toBeGreaterThan(0);
  });
});
