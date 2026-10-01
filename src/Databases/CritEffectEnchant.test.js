/** @jest-environment node */
import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear } from "General/Modules/TopGear/Engine/TopGearEngine";
import { getEnchantsForSlot, getEnchantById } from "./EnchantDB";
import { convertStatPercentages } from "General/Modules/Player/ClassDefaults/Generic/ProfileUtilities";
import { scoreEvokerSet } from "General/Modules/Player/ClassDefaults/PreservationEvoker/PreservationEvokerProfile";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Eyes of the Eagle raises how much a crit heals for, not how often one happens.

  It is the only enchant that isn't a pile of stats, so it is the only one whose value can't be read off its row:
  what 2% more crit effectiveness is worth depends on the spec's crit and on how much of its healing crits at all.
  That also makes it the easiest kind of thing to add and have do nothing - the set simply scores the same - so
  these check it moves a real score rather than only that the database row exists.
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;
const GEAR = [
  [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
  [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
  [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
];

const BARE = { intellect: 1, crit: 0, haste: 0, mastery: 0, versatility: 0 };

const runWith = (spec, ringEnchant) => {
  const player = new Player("T", spec, 1, "EU", "R", "Dracthyr", "default", "Retail");
  GEAR.forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "", "Retail");
    item.active = true;
    item.isEquipped = true;
    player.addActiveItem(item);
  });

  const settings = {
    ...base(),
    detailedGearOptions: { value: true },
    enchantChoices: { value: { Finger1: [ringEnchant], Finger2: [ringEnchant] } },
  };
  return runTopGear(player.activeItems, buildNewWepCombos(player, true), player, "Raid",
                    player.getHPS("Raid"), settings, player.getActiveModel("Raid"));
};

const scoreWith = (spec, ringEnchant) => runWith(spec, ringEnchant).itemSet.hardScore;
const statsOf = (spec, ringEnchant) => runWith(spec, ringEnchant).itemSet.setStats;

describe("The crit effectiveness enchant", () => {
  test("it's in the database as a crit multiplier, not as stats", () => {
    const eagle = getEnchantById("Eyes of the Eagle");

    expect(eagle.critMult).toBe(0.02);
    expect(eagle.stats).toBeUndefined();
  });

  test("every healer is offered it", () => {
    // It used to be restricted to two specs, as the name they saw for a flat stat enchant. It isn't that.
    ["Preservation Evoker", "Holy Priest", "Discipline Priest", "Restoration Druid", "Restoration Shaman",
     "Holy Paladin", "Mistweaver Monk"]
      .forEach((spec) => expect(getEnchantsForSlot("Finger", spec).map((e) => e.id)).toContain("Eyes of the Eagle"));
  });

  test("the set's stats carry the bonus, both rings' worth of it", () => {
    // The hop that silently dropped it: compileStats merges only the keys the set already has, so the enchant
    // granted the bonus, the breakdown showed it, and the stats the spec was scored on never saw it.
    expect(statsOf("Restoration Druid", "Eyes of the Eagle").critMultBonus).toBeCloseTo(0.04);
  });

  test("a spec's crit multiplier moves with it", () => {
    const raised = convertStatPercentages({ ...BARE, critMultBonus: 0.04 }, {}, "Restoration Druid", 1).critMult;
    const plain = convertStatPercentages(BARE, {}, "Restoration Druid", 1).critMult;

    expect(raised - plain).toBeCloseTo(0.04);
  });

  test("it changes what a set scores", () => {
    // Against the same enchant on both rings either way, so the only difference is the crit multiplier.
    expect(scoreWith("Restoration Druid", "Eyes of the Eagle"))
      .not.toBeCloseTo(scoreWith("Restoration Druid", "Silvermoon's Alacrity"));
  });

  test("Preservation Evoker is offered it, and the set's stats carry it", () => {
    expect(getEnchantsForSlot("Finger", "Preservation Evoker").map((e) => e.id)).toContain("Eyes of the Eagle");
    expect(statsOf("Preservation Evoker", "Eyes of the Eagle").critMultBonus).toBeCloseTo(0.04);
  });

  test("Preservation Evoker is scored with the bonus despite overriding the multiplier", () => {
    // The spec replaces the generic crit multiplier with its own figure rather than adjusting it, so the bonus has
    // to be added back on. Scored directly with and without it: comparing two different enchants instead would
    // differ on their stats and pass whether or not the bonus survived.
    const gear = { intellect: 40000, crit: 8000, haste: 6000, mastery: 4000, versatility: 3000, leech: 0,
                   hps: 0, dps: 0, mana: 0, manaPerc: 1, allyStats: 0, bonusHPS: 0, critMultBonus: 0 };
    const playerData = { heroTree: "", masteryEffectiveness: 1, tierSets: [] };

    const plain = scoreEvokerSet({ ...gear }, playerData, {}).healing;
    const raised = scoreEvokerSet({ ...gear, critMultBonus: 0.04 }, playerData, {}).healing;

    expect(raised).toBeGreaterThan(plain);
  });
});
