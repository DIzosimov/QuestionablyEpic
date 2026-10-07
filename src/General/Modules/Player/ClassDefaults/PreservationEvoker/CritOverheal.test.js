/** @jest-environment node */
import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear } from "General/Modules/TopGear/Engine/TopGearEngine";
import { getSpellThroughput } from "../Generic/ProfileUtilities";
import { scoreEvokerSet } from "./PreservationEvokerProfile";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Crits overheal more than normal heals.

  A crit heals for 2.6x, so it is far more likely to top a target off and waste the rest. Paired full and crit-only
  breakdowns from 14 Flameshaper Preservation Evokers on Mythic Ula'tek put crits a median 8.7 points of overheal
  above normal heals (range 7.2-9.5) at the same 2.6x crit size the model already used - which leaves crit worth about
  83% of what a single flat overheal rate credits it with. That is the gap a top player pointed at by telling a
  Preservation player they were overvaluing crit while the sim recommended it.
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;

// A plain crittable heal and the stat percentages it is scored against.
const HEAL = { spellType: "heal", aura: 1, coeff: 1, secondaries: ["crit", "versatility", "mastery"], expectedOverheal: 0.25, targets: 1 };
const STATS = { intellect: 1000, crit: 1.4, critMult: 2.6, mastery: 0.2, versatility: 1.1, haste: 1.2, genericHealingMult: 1, genericDamageMult: 1, leech: 0 };
const heal = (spell, premium = 0, flags = {}) =>
  getSpellThroughput({ ...spell }, { ...STATS, critOverhealPremium: premium }, "Preservation Evoker", {}, flags);

describe("The extra overheal on crits", () => {
  test("it's a Preservation setting, defaulting to what the logs measured", () => {
    const setting = base().critOverhealEvoker;

    expect(setting.value).toBe(8.7);
    expect(setting.spec).toBe("Preservation Evoker");
    expect(setting.category).toBe("specSpecific");
  });

  test("with no premium a heal scores exactly as before", () => {
    expect(heal(HEAL, 0)).toBe(getSpellThroughput({ ...HEAL }, { ...STATS }, "Preservation Evoker", {}, {}));
  });

  test("with one, only the crit share pays the higher overheal", () => {
    // 40% crit at 2.6x, normal heals overhealing 25% and crits 25% + 8.7.
    const p = 0.4, m = 2.6, o = 0.25, prem = 0.087;
    const expected = ((1 - p) * (1 - o) + p * m * (1 - o - prem)) / (((1 - p) + p * m) * (1 - o));

    expect(heal(HEAL, prem) / heal(HEAL, 0)).toBeCloseTo(expected, 10);
  });

  test("an override overheal is the rate the premium sits on top of", () => {
    const p = 0.4, m = 2.6, o = 0.4, prem = 0.087;
    const expected = ((1 - p) * (1 - o) + p * m * (1 - o - prem)) / (((1 - p) + p * m) * (1 - o));

    expect(heal(HEAL, prem, { overrideOverhealing: 0.4 }) / heal(HEAL, 0, { overrideOverhealing: 0.4 })).toBeCloseTo(expected, 10);
  });

  test("a heal that can't crit is untouched", () => {
    const noCrit = { ...HEAL, secondaries: ["versatility", "mastery"] };
    expect(heal(noCrit, 0.087)).toBe(heal(noCrit, 0));
  });

  test("absorbs are untouched - a shield doesn't overheal the way a heal does", () => {
    const shield = { ...HEAL, specialFields: { absorb: true } };
    expect(heal(shield, 0.087)).toBe(heal(shield, 0));
  });

  test("damage is untouched", () => {
    const hit = { ...HEAL, spellType: "damage" };
    expect(heal(hit, 0.087)).toBe(heal(hit, 0));
  });

  test("a premium can't push a crit past wasting all of it", () => {
    expect(heal({ ...HEAL, expectedOverheal: 0.95 }, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe("What it does to Preservation", () => {
  const GEAR = [
    [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
    [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
    [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
  ];
  const playerData = { heroTree: "Flameshaper", masteryEffectiveness: 0.9, tierSets: [] };
  let stats;

  beforeAll(() => {
    const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    GEAR.forEach(([id, slot]) => { const it = new Item(id, "", slot, 0, "", 0, 330, "", "Retail"); it.active = true; it.isEquipped = true; p.addActiveItem(it); });
    stats = runTopGear(p.activeItems, buildNewWepCombos(p, true), p, "Raid", p.getHPS("Raid"), base(), p.getActiveModel("Raid")).itemSet.setStats;
  });

  const healing = (premium, over = {}) =>
    scoreEvokerSet({ ...stats, ...over }, { ...playerData }, { critOverhealEvoker: { value: premium } }).healing;
  const gainOf = (stat, premium) => healing(premium, { [stat]: stats[stat] + 500 }) - healing(premium);

  test("no settings at all scores exactly as before", () => {
    // Every caller that passes nothing - and every existing test - is unaffected.
    expect(scoreEvokerSet({ ...stats }, { ...playerData }, {}).healing).toBe(healing(0));
  });

  test("the panel's string form is read like a number", () => {
    expect(scoreEvokerSet({ ...stats }, { ...playerData }, { critOverhealEvoker: { value: "8.7" } }).healing).toBe(healing(8.7));
  });

  test("crit loses value against haste", () => {
    // Haste's healing shrinks a little too, since more of every cast's crits now overheal - so the comparison is
    // crit against haste, rather than crit against itself.
    const before = gainOf("crit", 0) / gainOf("haste", 0);
    const after = gainOf("crit", 8.7) / gainOf("haste", 8.7);

    expect(after).toBeLessThan(before);
  });

  test("by roughly what the logs measured", () => {
    // Crit's own gain, as a fraction of what it was. The logs put crit at a median 83% of its old credit.
    const kept = gainOf("crit", 8.7) / gainOf("crit", 0);

    expect(kept).toBeGreaterThan(0.7);
    expect(kept).toBeLessThan(0.95);
  });
});
