/** @jest-environment node */
import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { countGearSets } from "./TopGearEngine";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Two crafted rings.

  Crafted rings aren't unique-equipped in game: a character can wear two of the same one, made with different stats
  or carrying different embellishments. Copying a ring from its cogwheel to try a second stat pair produces exactly
  that - two items sharing an id - and the pairing rule threw the combination away, so the copy could be added and
  then never appear in a set. A dropped ring genuinely is one-per-character, and still is.
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;

// Real ids: a crafted ring, and one that drops.
const CRAFTED_RING = 215133;
const DROPPED_RING = 268249;

const ring = (id, level = 331) => {
  const item = new Item(id, "", "Finger", 0, "", 0, level, "", "Retail");
  item.active = true;
  return item;
};

// A full set of gear with two ring slots to fill, so countGearSets reports pairs rather than zero.
const FILLER = [
  [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
  [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
  [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
];

const setsWith = (rings) => {
  const p = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
  FILLER.forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "", "Retail");
    item.active = true;
    p.addActiveItem(item);
  });
  rings.forEach((r) => p.addActiveItem(r));
  return countGearSets(p.activeItems, buildNewWepCombos(p, true));
};

describe("Wearing two of the same ring", () => {
  test("two copies of a crafted ring make a set", () => {
    // The copies differ in their stats, which is why both are on the bar; the engine only sees a shared id.
    expect(setsWith([ring(CRAFTED_RING), ring(CRAFTED_RING)])).toBe(1);
  });

  test("two copies of a dropped ring make none - that one really is one per character", () => {
    expect(setsWith([ring(DROPPED_RING), ring(DROPPED_RING)])).toBe(0);
  });

  test("two different rings pair whatever they are", () => {
    expect(setsWith([ring(CRAFTED_RING), ring(DROPPED_RING)])).toBe(1);
  });

  test("three copies of a crafted ring give three pairs", () => {
    // Unordered pairs of three, so the count has to come from the pairing rule rather than from a special case.
    expect(setsWith([ring(CRAFTED_RING), ring(CRAFTED_RING), ring(CRAFTED_RING)])).toBe(3);
  });
});
