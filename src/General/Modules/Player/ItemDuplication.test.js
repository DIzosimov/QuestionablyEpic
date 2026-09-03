import Player from "General/Modules/Player/Player";
import { createItem } from "General/Modules/ItemBar/ItemBar";
import { craftedStatLabel, CRAFTED_STAT_CHOICES } from "General/Engine/ItemUtilities";

/*
  Duplicating an item with different crafted stats or a different embellishment.

  Trying a second stat combination or embellishment used to mean building the whole item again in the add form.
  Both now add a copy alongside the original, so the two compete in Top Gear rather than one replacing the other.
*/

// A crafted item whose two secondaries are unallocated until it's made.
const CRAFTED_ID = 245770;

const makePlayer = () => new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");

const addCrafted = (player, missives) => {
  const item = createItem(CRAFTED_ID, "", 330, 0, "", missives, "Retail");
  item.active = true;
  player.addActiveItem(item);
  return item;
};

describe("Copying an item with different crafted stats", () => {
  test("the original is kept and the copy is added alongside it", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");

    player.recraftItem(original, "Crit / Mastery");

    expect(player.activeItems).toHaveLength(2);
    expect(player.activeItems[0]).toBe(original);
  });

  test("the copy carries the stats it was asked for", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");

    const copy = player.recraftItem(original, "Crit / Mastery");

    expect(craftedStatLabel(copy)).toEqual("Crit / Mastery");
    // The original is untouched, which is the whole point of copying rather than editing.
    expect(craftedStatLabel(original)).toEqual("Haste / Versatility");
  });

  test("the copy's stats are actually different, not just its label", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");

    const copy = player.recraftItem(original, "Crit / Mastery");

    expect(original.stats.haste).toBeGreaterThan(0);
    expect(copy.stats.crit).toBeGreaterThan(0);
    expect(copy.stats.haste || 0).toEqual(0);
    expect(original.stats.crit || 0).toEqual(0);
  });

  test("item level, socket and tertiary come across unchanged", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");
    original.socket = 1;

    const copy = player.recraftItem(original, "Haste / Mastery");

    expect(copy.level).toEqual(original.level);
    expect(copy.socket).toEqual(original.socket);
    expect(copy.id).toEqual(original.id);
    expect(copy.active).toBe(true);
  });

  test("every offered combination produces a distinct item", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");

    const labels = CRAFTED_STAT_CHOICES.map((choice) => craftedStatLabel(player.recraftItem(original, choice)));

    expect(new Set(labels).size).toEqual(CRAFTED_STAT_CHOICES.length);
  });
});

describe("Copying an item with a different embellishment", () => {
  test("embellishing adds a copy rather than changing the original", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");

    player.embellishItem(original, "Dawnthread Lining");

    expect(player.activeItems).toHaveLength(2);
    expect(original.effect).toEqual("");
    expect(player.activeItems[1].effect.name).toEqual("Dawnthread Lining");
  });

  test("an already embellished item can be copied with a different one", () => {
    const player = makePlayer();
    const original = addCrafted(player, "Haste / Versatility");
    player.embellishItem(original, "Dawnthread Lining");
    const embellished = player.activeItems[1];

    player.embellishItem(embellished, "Duskthread Lining");

    expect(player.activeItems).toHaveLength(3);
    expect(embellished.effect.name).toEqual("Dawnthread Lining");
    expect(player.activeItems[2].effect.name).toEqual("Duskthread Lining");
    // The stats it was crafted with survive the swap.
    expect(craftedStatLabel(player.activeItems[2])).toEqual("Haste / Versatility");
  });
});
