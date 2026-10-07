import ItemSet from "./ItemSet";
import Item from "General/Items/Item";
import { crestSettingKey } from "./Engine/CrestSpending";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  A set can only wear the crafted pieces the character can pay for.

  Sets are ranked on healing, and a crafted piece typed in to try it reads as gear the player has - so a set wearing
  two of them won on the strength of 160 Myth crests nobody had spent. Adding a second crafted piece to compare it
  against the first produced a winner wearing both, which answers a question nobody asked.

  Only while crest spending is on. With it off a crest isn't a constraint the run knows about, and sets rank exactly
  as they did before.
*/

const base = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;

const withCrests = (myth, on = true) => ({
  ...base(),
  crestSpending: { value: on },
  [crestSettingKey("Myth")]: { value: myth },
});

const craftedPiece = (slot, level = 331) => {
  const item = new Item(244578, "", slot, 0, "", 0, level, "");
  item.upgradeTrack = "Myth Crafted";
  return item;
};

const owned = (slot, level = 331) => {
  const item = craftedPiece(slot, level);
  item.isEquipped = true;
  return item;
};

const setOf = (items) => new ItemSet(1, items, 0, "Preservation Evoker");

describe("Wearing crafted pieces within a crest budget", () => {
  test("one crafted piece is fine at 80 crests", () => {
    expect(setOf([craftedPiece("Chest")]).verifySet(withCrests(80))).toBe(true);
  });

  test("two need 160, so 100 isn't enough", () => {
    expect(setOf([craftedPiece("Chest"), craftedPiece("Legs")]).verifySet(withCrests(100))).toBe(false);
  });

  test("two are fine once the crests are there", () => {
    expect(setOf([craftedPiece("Chest"), craftedPiece("Legs")]).verifySet(withCrests(160))).toBe(true);
  });

  test("one crafted piece is rejected when even that can't be paid for", () => {
    expect(setOf([craftedPiece("Chest")]).verifySet(withCrests(0))).toBe(false);
    expect(setOf([craftedPiece("Chest")]).verifySet(withCrests(79))).toBe(false);
  });

  test("pieces the player already wears are free, however many", () => {
    // They're paid for. A character wearing two crafted pieces isn't made unwearable by having no crests left.
    expect(setOf([owned("Chest"), owned("Legs")]).verifySet(withCrests(0))).toBe(true);
  });

  test("a crafted piece at its base level is free, since it can be crafted for nothing", () => {
    expect(setOf([craftedPiece("Chest", 305), craftedPiece("Legs", 305)]).verifySet(withCrests(0))).toBe(true);
  });

  test("with crest spending off, nothing is rejected on cost", () => {
    expect(setOf([craftedPiece("Chest"), craftedPiece("Legs")]).verifySet(withCrests(0, false))).toBe(true);
  });

  test("no settings at all behaves as off", () => {
    // verifySet is called without settings elsewhere in the engine, and from Classic.
    expect(setOf([craftedPiece("Chest"), craftedPiece("Legs")]).verifySet()).toBe(true);
    expect(setOf([craftedPiece("Chest"), craftedPiece("Legs")]).verifySet({})).toBe(true);
  });

  test("a set with no crafted gear is unaffected by the budget", () => {
    const dropped = new Item(268230, "", "Head", 0, "", 0, 321, "");
    dropped.upgradeTrack = "Hero";

    expect(setOf([dropped]).verifySet(withCrests(0))).toBe(true);
  });

  test("the rule doesn't override the other wearability rules", () => {
    // Affordability is checked first, so it has to not swallow the cases that came before it. Those read `uniques`,
    // which compileStats fills - the engine compiles a set before verifying it.
    const vault = new Item(268230, "", "Head", 0, "", 0, 321, "");
    vault.uniqueEquip = "vault";
    const secondVault = new Item(268237, "", "Legs", 0, "", 0, 321, "");
    secondVault.uniqueEquip = "vault";

    const set = setOf([vault, secondVault]);
    set.compileStats("Retail", withCrests(160));

    expect(set.verifySet(withCrests(160))).toBe(false);
  });

  test("affordability holds on a compiled set too", () => {
    // It reads the item list rather than the compiled uniques, so it has to work either side of compileStats.
    const set = setOf([craftedPiece("Chest"), craftedPiece("Legs")]);
    set.compileStats("Retail", withCrests(100));

    expect(set.verifySet(withCrests(100))).toBe(false);
  });
});
