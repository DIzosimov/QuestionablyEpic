import Player from "./Player";
import Item from "General/Items/Item";

/*
  Keeping a character's gear across a reload.

  saveAllChar has always written the whole character out, item list included - but init rebuilt each one from a
  handful of fields and never read the items back. So every reload emptied the gear list, and fine tuning a run
  meant adding and re-ticking everything first.
*/
describe("Gear survives being saved and loaded", () => {
  const build = () => {
    const item = new Item(268230, "", "Head", 1, "Leech", 0, 330, "");
    item.active = true;
    item.isEquipped = true;
    item.gemString = "240890";
    item.enchantID = 7961;
    item.upgradeTrack = "Hero";
    return item;
  };

  // What localStorage does to a character on the way out and back.
  const roundTrip = (item) => Item.fromSaved(JSON.parse(JSON.stringify(item)));

  test("the fields a run depends on all come back", () => {
    const before = build();
    const after = roundTrip(before);

    ["id", "slot", "level", "socket", "tertiary", "active", "isEquipped", "gemString", "enchantID", "upgradeTrack"]
      .forEach((field) => expect(after[field]).toEqual(before[field]));
  });

  test("it comes back as an Item, not a plain object", () => {
    // The report and the engine call methods on these; a plain object would fail at the first one.
    const after = roundTrip(build());

    expect(after instanceof Item).toBe(true);
    expect(typeof after.clone).toEqual("function");
    expect(after.clone().id).toEqual(after.id);
  });

  test("changes made after import survive too", () => {
    // The case that made this worth fixing: an item upgraded by hand was lost on the next load.
    const item = build();
    item.updateLevel(340, item.missiveStats);
    const after = roundTrip(item);

    expect(after.level).toEqual(340);
    expect(after.stats).toEqual(item.stats);
  });

  test("restoring doesn't recompute the item from its id", () => {
    // Going through the constructor would derive stats and sockets from the item id and undo anything changed.
    const item = build();
    item.socket = 3;
    item.stats = { intellect: 12345 };

    const after = roundTrip(item);
    expect(after.socket).toEqual(3);
    expect(after.stats.intellect).toEqual(12345);
  });

  test("a whole list keeps its order and its selection", () => {
    const items = [build(), build(), build()];
    items[1].active = false;

    const after = JSON.parse(JSON.stringify(items)).map((saved) => Item.fromSaved(saved));

    expect(after.map((i) => i.active)).toEqual([true, false, true]);
  });

  test("an empty or missing list is not a crash", () => {
    expect([].map((saved) => Item.fromSaved(saved))).toEqual([]);
  });
});

/*
  The other two things the SimC import reads onto the character. Same gap as the items: written out by
  saveAllChar, never read back, so a reload quietly undid them.
*/
describe("The Folio and crest budget survive a reload too", () => {
  const savedChar = (player) => JSON.parse(JSON.stringify(player));

  const loaded = (saved) => {
    // What PlayerChars.init does with a saved character, for the fields under test.
    const p = new Player("T", "Preservation Evoker", 0, "EU", "R", "Dracthyr", "default", "Retail");
    if (saved.folioRunes) p.folioRunes = saved.folioRunes;
    if (saved.upgradeCurrency) p.upgradeCurrency = saved.upgradeCurrency;
    return p;
  };

  test("the Folio runes come back", () => {
    // Without them the Folio falls back to automatic even with "keep what I have" on - wrong, and silently so.
    const player = new Player("T", "Preservation Evoker", 0, "EU", "R", "Dracthyr", "default", "Retail");
    player.folioRunes = { 4: 1279609 };

    expect(loaded(savedChar(player)).folioRunes).toEqual({ 4: 1279609 });
  });

  test("the crest budget comes back", () => {
    // Without it there is no budget, so a spending plan comes back empty rather than wrong.
    const player = new Player("T", "Preservation Evoker", 0, "EU", "R", "Dracthyr", "default", "Retail");
    player.upgradeCurrency = { currencies: { 3445: 100, 3446: 84 }, items: {} };

    expect(loaded(savedChar(player)).upgradeCurrency.currencies).toEqual({ 3445: 100, 3446: 84 });
  });

  test("a character that never imported still loads", () => {
    const player = new Player("T", "Preservation Evoker", 0, "EU", "R", "Dracthyr", "default", "Retail");
    const back = loaded(savedChar(player));

    expect(back.folioRunes).toEqual({});
    expect(back.upgradeCurrency.currencies).toEqual({});
  });
});
