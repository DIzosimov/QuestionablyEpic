import { enchantDB, getEnchantsForSlot, getDefaultEnchant, getEnchantById, ENCHANTABLE_SLOTS, WEAPON_ENCHANT_PPM, WEAPON_ENCHANT_DURATION } from "./EnchantDB";
import { convertPPMToUptime } from "Retail/Engine/EffectFormulas/EffectUtilities";

/*
  These pin the exact stat values the engine applied before enchants were moved out of TopGearEngine and into this
  table. If a refactor changes what an enchant grants, these fail rather than silently shifting everyone's results.
*/

const uptime = convertPPMToUptime(WEAPON_ENCHANT_PPM, WEAPON_ENCHANT_DURATION);

describe("Enchant values match what the engine applied before extraction", () => {
  test("ring enchants all grant 29 of their stat", () => {
    [["Silvermoon's Alacrity", "haste"], ["Nature's Fury", "crit"],
     ["Zul'jin's Mastery", "mastery"], ["Silvermoon's Tenacity", "versatility"]].forEach(([id, stat]) => {
      expect(getEnchantById(id).stats[stat]).toEqual(29);
    });
  });

  test("armour slot values are unchanged", () => {
    expect(getEnchantById("Empowered Hex of Leeching").stats.leech).toEqual(55);
    expect(getEnchantById("Silvermoon's Mending").stats.leech).toEqual(166);
    expect(getEnchantById("Shaladrassil's Roots").stats.leech).toEqual(28);
    expect(getEnchantById("Mark of the Worldsoul").stats.intellect).toEqual(50);
    expect(getEnchantById("Mark of the Magister").stats.intellect).toEqual(40);
    expect(getEnchantById("Mark of the Magister").manaPerc).toEqual(1.05);
    expect(getEnchantById("Arcanoweave Spellthread").stats.intellect).toEqual(41);
    expect(getEnchantById("Arcanoweave Spellthread").manaPerc).toEqual(1.04);
  });

  test("weapon enchants keep their proc budgets and uptime", () => {
    expect(getEnchantById("Acuity of the Ren'dorei").procStats.intellect).toEqual(67);
    expect(getEnchantById("Berserker's Rage").procStats.haste).toEqual(124);
    expect(getEnchantById("Arcane Mastery").procStats.mastery).toEqual(124);
    expect(uptime).toBeGreaterThan(0);
    expect(uptime).toBeLessThanOrEqual(1);
  });
});

describe("Per-spec defaults match the old hardcoded branches", () => {
  test("Restoration Shaman still gets Mark of the Magister on chest", () => {
    expect(getDefaultEnchant("Chest", "Restoration Shaman").id).toEqual("Mark of the Magister");
  });

  test("every other spec still gets Mark of the Worldsoul", () => {
    ["Preservation Evoker", "Holy Priest", "Discipline Priest", "Restoration Druid", "Holy Paladin", "Mistweaver Monk"]
      .forEach((spec) => expect(getDefaultEnchant("Chest", spec).id).toEqual("Mark of the Worldsoul"));
  });

  test("weapon defaults match the old spec branches", () => {
    expect(getDefaultEnchant("CombinedWeapon", "Discipline Priest").id).toEqual("Berserker's Rage");
    expect(getDefaultEnchant("CombinedWeapon", "Restoration Druid").id).toEqual("Berserker's Rage");
    expect(getDefaultEnchant("CombinedWeapon", "Preservation Evoker").id).toEqual("Arcane Mastery");
    expect(getDefaultEnchant("CombinedWeapon", "Holy Paladin").id).toEqual("Acuity of the Ren'dorei");
  });

  test("Eyes of the Eagle is offered only to the two specs that use it", () => {
    ["Holy Priest", "Restoration Shaman"].forEach((spec) => {
      expect(getEnchantsForSlot("Finger", spec).map((e) => e.id)).toContain("Eyes of the Eagle");
      expect(getDefaultEnchant("Finger", spec).id).toEqual("Eyes of the Eagle");
    });
    expect(getEnchantsForSlot("Finger", "Preservation Evoker").map((e) => e.id)).not.toContain("Eyes of the Eagle");
  });
});

describe("The table is well formed", () => {
  test("every enchantable slot has at least one option for every spec", () => {
    const specs = ["Preservation Evoker", "Holy Priest", "Discipline Priest", "Restoration Druid", "Holy Paladin", "Mistweaver Monk", "Restoration Shaman"];
    ENCHANTABLE_SLOTS.forEach((slot) => {
      specs.forEach((spec) => {
        expect(getEnchantsForSlot(slot, spec).length).toBeGreaterThan(0);
        expect(getDefaultEnchant(slot, spec)).toBeTruthy();
      });
    });
  });

  test("ids are unique and every enchant grants something", () => {
    const ids = enchantDB.map((e) => e.id);
    expect(new Set(ids).size).toEqual(ids.length);
    enchantDB.forEach((e) => {
      const grantsSomething = !!e.stats || !!e.procStats || !!e.manaPerc || e.id === "Eyes of the Eagle";
      expect(grantsSomething).toBe(true);
    });
  });
});
