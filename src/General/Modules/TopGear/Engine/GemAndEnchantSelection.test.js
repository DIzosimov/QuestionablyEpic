import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos, getGearOption, isDetailedGearOptions } from "General/Engine/ItemUtilities";
import { runTopGear } from "./TopGearEngine";
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
    expect(getFolioGems({}, "mastery")).toEqual([1279599, 1279603, 1287555, 1287771, 1279614]);
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
    expect(buildSetVariants(gems, enchants, [], 100).length).toEqual(6);
    expect(buildSetVariants(gems, enchants, [], 4).length).toEqual(4);
  });

  test("Folio combinations are a third axis, multiplied in with the rest", () => {
    const gems = [[1, 1], [2, 2]];
    const enchants = [{ Chest: "a" }, { Chest: "b" }, { Chest: "c" }];
    const folios = [{ 4: "Crit" }, { 4: "Haste" }];
    expect(buildSetVariants(gems, enchants, folios, 100).length).toEqual(12);
    expect(buildSetVariants([], [], folios, 100).length).toEqual(2);
  });

  test("neither selected still yields exactly one variant", () => {
    expect(buildSetVariants([], [], [], 10)).toEqual([{ gemLoadout: null, enchantOverride: null, folioOverride: null }]);
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

describe("Search depth is configurable", () => {
  const A = 240898, B = 240890, C = 240914;

  test("an untouched profile keeps the old default", () => {
    expect(base.gearVariantLimit.value).toEqual(24);
    expect(resolveVariantLimit(cfg())).toEqual(24);
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
    expect(buildSetVariants([[A], [B]], buildEnchantCombinations(many, Infinity), [], Infinity).length).toEqual(48);
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

  // Enough selections that the default cap genuinely bites: 24 enchant combinations times a handful of gem
  // loadouts is far past 24 variants, so the capped run is searching a fraction of the space.
  const wide = {
    selectedGems: [A, B, C],
    enchantChoices: {
      Chest: ["Mark of the Worldsoul", "Mark of the Magister"],
      CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Acuity of the Ren'dorei"],
      Finger: ["Nature's Fury", "Zul'jin's Mastery", "Silvermoon's Alacrity", "Silvermoon's Tenacity"],
    },
  };

  test("raising the limit evaluates strictly more sets, and no limit the most of all", () => {
    const capped = run(cfg(wide)).itemsCompared;
    const wider = run(cfg({ ...wide, gearVariantLimit: 150 })).itemsCompared;
    const unlimited = run(cfg({ ...wide, gearVariantLimit: 0 })).itemsCompared;

    expect(wider).toBeGreaterThan(capped);
    // Only >= here: this gear has few enough sockets that 150 already covers the whole space, so lifting the
    // limit entirely has nothing left to add.
    expect(unlimited).toBeGreaterThanOrEqual(wider);
  });

  test("a wider search never returns a worse set than the capped one", () => {
    // The point of paying for the extra variants: the winner can only improve.
    const capped = run(cfg(wide)).itemSet.setHPS;
    const unlimited = run(cfg({ ...wide, gearVariantLimit: 0 })).itemSet.setHPS;

    expect(unlimited).toBeGreaterThanOrEqual(capped);
  });

  test("the default run is unchanged by the limit existing", () => {
    // The old behaviour was a gem cap of 12 inside a total cap of 24. Leaving the setting alone has to reproduce it.
    expect(run(cfg(wide)).itemsCompared).toEqual(24);
  });
});

/*
  Folio runes are multi-selectable on the same terms as gems and enchants: pin several in a slot and every
  combination is ranked as its own set. Slots used to hold a single shortName, and profiles saved before this
  still do, so the single-string form has to keep working.
*/
describe("Omnium Folio runes can be multi-selected", () => {
  const CRIT = 1279609, HASTE = 1287774, VERS = 1279613;
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
    expect([CRIT, HASTE, 1287771, VERS]).toContain(multi.itemSet.folioGems[3]);
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

  test("a run evaluates far more sets than a plain one, up to the search depth", () => {
    const plain = run(cfg()).itemsCompared;

    expect(run(all()).itemsCompared).toEqual(plain * 24); // The default limit, saturated.
    expect(run(all({ gearVariantLimit: 150 })).itemsCompared).toEqual(plain * 150);
  });

  test("the winner is a real set, wearing real gems and enchants", () => {
    const best = run(all({ gearVariantLimit: 60 })).itemSet;

    expect(best).toBeTruthy();
    expect(best.setHPS).toBeGreaterThan(0);
    best.enchantBreakdown["Gems"].slice(1).forEach((gem) => {
      expect(getCurrentStatGems().map((g) => g.id)).toContain(gem);
    });
  });

  test("it never returns a worse set than the plain run", () => {
    // A capped search keeps the first N combinations, not the best N, so the engine's automatic pick is entered as
    // a candidate too. Without that this genuinely loses to the plain run at some limits.
    [24, 150, 0].forEach((gearVariantLimit) => {
      expect(run(all({ gearVariantLimit })).itemSet.setHPS).toBeGreaterThanOrEqual(run(cfg()).itemSet.setHPS);
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

  test("it reports set building first, then evaluation, then ranking", () => {
    const { updates } = runWithProgress(cfg());
    const stages = [...new Set(updates.map((u) => u.stage))];

    expect(stages[0]).toEqual("Building gear sets");
    expect(stages[stages.length - 1]).toEqual("Ranking results");
    expect(updates[0].total).toEqual(0); // No total until the sets exist to count.
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
  const GEM_LOOKUP_FALLBACK = 213482; // What getGemID returns when it can't find a match.

  test("the constants are the split the tier actually grants", () => {
    expect(GEM_MAJOR_STAT).toEqual(16);
    expect(GEM_MINOR_STAT).toEqual(7);
  });

  test("every current stat gem grants exactly that split", () => {
    const gems = getCurrentStatGems();
    expect(gems.length).toBeGreaterThan(0);

    gems.forEach((gem) => {
      const amounts = Object.values(gem.stats);
      expect(amounts.length).toEqual(2);
      expect(amounts.sort((a, b) => b - a)).toEqual([GEM_MAJOR_STAT, GEM_MINOR_STAT]);
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
