/** @jest-environment node */
import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear, cornucopiaStat, FOOD_BUFFS } from "./TopGearEngine";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Which secondary Amani Cornucopia lands on.

  It used to go to the spec's best-weighted stat unconditionally - what a player gets only if they swap gear before
  eating to steer it. Simply eating gives it to your highest secondary rating out of combat, before any procs.
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;
const RATINGS = { crit: 1421, haste: 714, mastery: 900, versatility: 410, intellect: 3600 };

describe("Choosing the stat", () => {
  test("by default it follows the game: the highest rating", () => {
    expect(base().cornucopiaStat.value).toBe("Out-of-Combat Highest");
    expect(cornucopiaStat(base().cornucopiaStat, RATINGS, "mastery")).toBe("crit");
  });

  test("it ignores intellect, which is not a secondary", () => {
    expect(cornucopiaStat({ value: "Out-of-Combat Highest" }, RATINGS, "mastery")).not.toBe("intellect");
  });

  test("Best for the Set gives it to the best-weighted stat, as before", () => {
    expect(cornucopiaStat({ value: "Best for the Set" }, RATINGS, "mastery")).toBe("mastery");
  });

  test("a pinned stat is used as is", () => {
    ["Crit", "Haste", "Mastery", "Versatility"].forEach((stat) =>
      expect(cornucopiaStat({ value: stat }, RATINGS, "mastery")).toBe(stat.toLowerCase()));
  });

  test("a profile without the setting behaves as the default", () => {
    expect(cornucopiaStat(undefined, RATINGS, "mastery")).toBe("crit");
  });
});

describe("In a real evaluation", () => {
  const GEAR = [
    [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
    [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
    [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
  ];
  // Weapon oil and the rune add to the same stats, so the food is found by comparing against the same run without it.
  const run = (food, choice) => {
    const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => { const it = new Item(id, "", slot, 0, "", 0, 330, "", "Retail"); it.active = true; it.isEquipped = true; p.addActiveItem(it); });
    const settings = { ...base(), foodBuff: { value: food }, flaskChoice: { value: "None" },
                       potionChoice: { value: "None" }, cornucopiaStat: { value: choice } };
    return runTopGear(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"), settings, p.getActiveModel("Raid")).itemSet.statBreakdown;
  };
  const foodOn = (choice) => {
    const fed = run("Amani Cornucopia", choice), hungry = run("None", choice);
    const stat = Object.keys(fed.consumables).find((k) =>
      Math.abs((fed.consumables[k] || 0) - (hungry.consumables[k] || 0) - FOOD_BUFFS["Amani Cornucopia"].amount) < 1e-9);
    return { stat, breakdown: fed };
  };

  test("a pinned stat is the one that gets the food", () => {
    expect(foodOn("Haste").stat).toBe("haste");
    expect(foodOn("Versatility").stat).toBe("versatility");
  });

  test("by default it lands on the highest rating out of combat - gear, enchants and gems together", () => {
    // On this gear crit leads on gear alone (1019 vs 917) but the enchants add 132 mastery, so mastery is what the
    // character actually has most of when they eat. Gear alone would have picked the wrong one.
    const { stat, breakdown } = foodOn("Out-of-Combat Highest");
    const total = (k) => ["gear", "enchants", "gems"].reduce((sum, part) => sum + ((breakdown[part] || {})[k] || 0), 0);
    const highest = ["crit", "haste", "mastery", "versatility"].reduce((a, b) => (total(a) >= total(b) ? a : b));

    expect(stat).toBe(highest);
    expect(stat).toBe("mastery");
  });
});
