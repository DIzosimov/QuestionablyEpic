import { parseUpgradeCurrencies } from "General/Engine/ItemUtilities";

/*
  Reading a character's crests and Valorstones off a SimC export.

  SimC reports them on a commented line, so the app never looked at it. They're the budget any "what should I
  upgrade" question has to be answered within, so reading them is the first thing that has to work.

  The ids are kept as they appear. Which id is which crest tier is game data the app doesn't carry, and
  attributing someone's crests to the wrong tier would be worse than showing them a number with no name.
*/
describe("Reading upgrade currencies from a SimC export", () => {
  // A real line, from the export that prompted this.
  const LINE = "# upgrade_currencies=c:1792:15000/c:3442:328/c:3445:25/c:3443:500/c:3444:100/c:3446:22/i:274476:2/i:232875:6";

  test("every currency is read with its amount", () => {
    expect(parseUpgradeCurrencies(LINE).currencies).toEqual({
      1792: 15000, 3442: 328, 3445: 25, 3443: 500, 3444: 100, 3446: 22,
    });
  });

  test("items are kept apart from currencies", () => {
    // They appear on the same line but aren't spent on upgrades the same way.
    expect(parseUpgradeCurrencies(LINE).items).toEqual({ 274476: 2, 232875: 6 });
  });

  test("the leading comment marker doesn't stop it being read", () => {
    // The line is a comment in the export, which is why it was never parsed before.
    const bare = LINE.replace(/^#\s*/, "");
    expect(parseUpgradeCurrencies(bare)).toEqual(parseUpgradeCurrencies(LINE));
  });

  test("an older export with different currencies still reads", () => {
    // From the sample bundled with the app, a season with a different set entirely.
    const older = "# upgrade_currencies=c:1792:615/c:2122:2/i:204682:1/i:232875:6/i:231767:1/i:231769:1";
    const held = parseUpgradeCurrencies(older);

    expect(held.currencies).toEqual({ 1792: 615, 2122: 2 });
    expect(held.items[204682]).toEqual(1);
  });

  test("a character with none of them reads as empty rather than throwing", () => {
    expect(parseUpgradeCurrencies("")).toEqual({ currencies: {}, items: {} });
    expect(parseUpgradeCurrencies("# upgrade_currencies=")).toEqual({ currencies: {}, items: {} });
  });

  test("a malformed entry is skipped rather than counted as zero", () => {
    const held = parseUpgradeCurrencies("# upgrade_currencies=c:3442:328/c:oops:5/c:3443");

    expect(held.currencies).toEqual({ 3442: 328 });
  });

  test("a currency the character has none of is still reported", () => {
    // Zero is a real answer - it's the difference between "you can't afford this" and "we don't know".
    expect(parseUpgradeCurrencies("# upgrade_currencies=c:3442:0").currencies).toEqual({ 3442: 0 });
  });
});
