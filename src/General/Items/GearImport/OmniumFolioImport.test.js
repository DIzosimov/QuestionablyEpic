import { parseOmniumTalents, getFolioGems, FOLIO_STAT_SLOT } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";
import rootReducer from "Redux/Reducers/RootReducer";

/*
  Reading the Omnium Folio off a SimC export.

  SimC reports it as omnium_talents, which the importer ignored entirely - so the app assumed the automatic runes
  and the report diffed against that assumption rather than against what the character has.

  The entry ids are a different numbering to the rune spell ids, and only the ones we've confirmed can be read.
  Anything else is ignored so the slot falls back to automatic, which is what happened before any of this.
*/
describe("Reading the Folio from a SimC export", () => {
  // The same character exported once per rune. Only the second entry ever moved, which is what identifies it as
  // the stat slot - the other four stayed put across all four exports.
  const EXPORTS = {
    crit: { line: "omnium_talents=136814:1/136815:1/136817:1/136819:1/136822:1", rune: 1279609 },
    haste: { line: "omnium_talents=136814:1/136821:1/136817:1/136819:1/136822:1", rune: 1279610 },
    mastery: { line: "omnium_talents=136814:1/136818:1/136817:1/136819:1/136822:1", rune: 1279612 },
    versatility: { line: "omnium_talents=136814:1/136820:1/136817:1/136819:1/136822:1", rune: 1279613 },
  };
  const CRIT_RUNE = EXPORTS.crit.rune;
  const LINE = EXPORTS.crit.line;

  const settings = (replace) => {
    const s = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
    return { ...s, replaceExistingGems: { ...s.replaceExistingGems, value: replace } };
  };

  test("every stat rune is read from a real export", () => {
    Object.values(EXPORTS).forEach(({ line, rune }) => {
      expect(parseOmniumTalents(line)).toEqual({ [FOLIO_STAT_SLOT]: rune });
    });
  });

  test("the entries that never moved aren't mistaken for the stat rune", () => {
    // 136814, 136817, 136819 and 136822 were identical across all four exports, so none of them is the choice.
    [136814, 136817, 136819, 136822].forEach((fixed) => {
      expect(parseOmniumTalents("omnium_talents=" + fixed + ":1")).toEqual({});
    });
  });

  test("entries we can't identify are ignored rather than guessed at", () => {
    expect(parseOmniumTalents("omnium_talents=999991:1/999992:1")).toEqual({});
  });

  test("a character with no Folio line reads as nothing", () => {
    expect(parseOmniumTalents("")).toEqual({});
    expect(parseOmniumTalents("omnium_talents=")).toEqual({});
  });

  test("keeping what you have puts your own rune in the set", () => {
    const worn = parseOmniumTalents(LINE);
    const runes = getFolioGems(settings(false), "haste", undefined, worn);

    // Even though haste is the best stat here, the crit rune is what the character actually has on.
    expect(runes[FOLIO_STAT_SLOT - 1]).toEqual(CRIT_RUNE);
  });

  test("replacing ignores it and picks for the best stat", () => {
    const worn = parseOmniumTalents(LINE);
    const runes = getFolioGems(settings(true), "haste", undefined, worn);

    expect(runes[FOLIO_STAT_SLOT - 1]).not.toEqual(CRIT_RUNE);
  });

  test("a character we can't read still gets the automatic pick", () => {
    const withOut = getFolioGems(settings(false), "haste", undefined, {});
    const replacing = getFolioGems(settings(true), "haste", undefined, {});

    expect(withOut).toEqual(replacing);
  });
});
