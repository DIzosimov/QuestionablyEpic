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
