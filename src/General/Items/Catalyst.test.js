import Player from "General/Modules/Player/Player";
import { Item, CATALYZABLE_SLOTS } from "./Item";
import { CONSTANTS } from "General/Engine/CONSTANTS";
import { getItemDB } from "General/Engine/ItemUtilities";

/*
  The catalyst turns a piece into the spec's tier equivalent for that slot, keeping the piece you already had.

  Eligibility used to also require the SimC import to have tagged the item with the current season's
  item_conversion field. Anything added by hand, imported without that field, or carried over from an earlier
  season had no catalyst option at all - the button simply never appeared. Slot is the only thing that decides it
  now, so these tests are mostly about what that widening must NOT let through.
*/

const SPEC = "Preservation Evoker";
const gear = (slot, overrides = {}) => {
  const item = new Item(268230, "", slot, 0, "", 0, 330, "");
  return Object.assign(item, overrides);
};

describe("Anything in a tier slot can be catalyzed", () => {
  test("the five tier slots qualify", () => {
    expect(CATALYZABLE_SLOTS).toEqual(["Head", "Chest", "Shoulder", "Legs", "Hands"]);
    CATALYZABLE_SLOTS.forEach((slot) => expect(gear(slot).canBeCatalyzed()).toBe(true));
  });

  test("origin no longer matters", () => {
    // itemConversion is what the import sets, and 0 is what everything else has. Both are eligible now.
    expect(gear("Head", { itemConversion: 0 }).canBeCatalyzed()).toBe(true);
    expect(gear("Head", { itemConversion: 6 }).canBeCatalyzed()).toBe(true);
    expect(gear("Head", { itemConversion: CONSTANTS.seasonalItemConversion }).canBeCatalyzed()).toBe(true);
  });

  test("slots with no tier piece don't qualify", () => {
    ["Back", "Wrist", "Waist", "Feet", "Neck", "Finger", "Trinket", "2H Weapon", "Offhand"]
      .forEach((slot) => expect(gear(slot).canBeCatalyzed()).toBe(false));
  });

  test("something that's already tier can't be converted again", () => {
    expect(gear("Head", { setID: 2058 }).canBeCatalyzed()).toBe(false);
    expect(gear("Head", { isCatalystItem: true }).canBeCatalyzed()).toBe(false);
  });
});

describe("Converting keeps the piece you had", () => {
  test("only the item's identity changes", () => {
    const item = gear("Chest", { level: 311, socket: 1, tertiary: "Leech" });
    item.stats = { intellect: 1234, haste: 567, crit: 89 };
    const before = { ...item.stats };
    const originalID = item.id;

    expect(item.convertToTier(SPEC)).toBe(true);

    expect(item.stats).toEqual(before);
    expect(item.level).toEqual(311);
    expect(item.socket).toEqual(1);
    expect(item.tertiary).toEqual("Leech");

    expect(item.id).not.toEqual(originalID);
    expect(item.catalyzedID).toEqual(originalID);
    expect(item.setID).toEqual(CONSTANTS.tierSetIDs[SPEC]);
    expect(item.isCatalystItem).toBe(true);
  });

  test("every spec has a tier piece in every catalyzable slot", () => {
    // A missing one converts to nothing, so the player would tick catalyze and see no change.
    Object.keys(CONSTANTS.tierSetIDs).forEach((spec) => {
      CATALYZABLE_SLOTS.forEach((slot) => {
        const pieces = getItemDB("Retail").filter((i) => i.slot === slot && i.itemSetId === CONSTANTS.tierSetIDs[spec]);
        expect(`${spec} ${slot}: ${pieces.length}`).not.toEqual(`${spec} ${slot}: 0`);
      });
    });
  });

  test("a slot with no tier piece leaves the item untouched", () => {
    const item = gear("Back");
    const originalID = item.id;

    expect(item.convertToTier(SPEC)).toBe(false);
    expect(item.id).toEqual(originalID);
    expect(item.catalyzedID).toBeUndefined();
    expect(item.setID).toBeFalsy();
  });
});

describe("Catalyzing on the player adds a copy", () => {
  const playerWith = (item) => {
    const player = new Player("T", SPEC, 1, "EU", "R", "Dracthyr", "default", "Retail");
    player.addActiveItem(item);
    return player;
  };

  test("the original survives and the copy carries its stats", () => {
    const original = gear("Legs", { level: 308, tertiary: "Avoidance" });
    original.stats = { intellect: 999, mastery: 321 };
    const player = playerWith(original);

    player.catalyzeItem(original);

    expect(player.activeItems.length).toEqual(2);
    const copy = player.activeItems[1];

    expect(copy.stats).toEqual(original.stats);
    expect(copy.level).toEqual(308);
    expect(copy.tertiary).toEqual("Avoidance");
    expect(copy.catalyzedID).toEqual(original.id);
    expect(copy.isCatalystItem).toBe(true);
    expect(copy.setID).toBeTruthy();

    // The original is still there, unconverted, so Top Gear can weigh one against the other.
    expect(player.activeItems[0].id).toEqual(original.id);
    expect(player.activeItems[0].isCatalystItem).toBeFalsy();
  });

  test("the two items don't share a stats object", () => {
    // They were assigned by reference, so an in-place edit to one reached into the other.
    const original = gear("Head");
    original.stats = { intellect: 100 };
    const player = playerWith(original);

    player.catalyzeItem(original);
    player.activeItems[1].addStats({ intellect: 50 });

    expect(original.stats.intellect).toEqual(100);
    expect(player.activeItems[1].stats.intellect).toEqual(150);
  });

  test("a slot with no tier piece adds nothing rather than a broken item", () => {
    const original = gear("Back");
    const player = playerWith(original);

    player.catalyzeItem(original);
    expect(player.activeItems.length).toEqual(1);
  });
});
