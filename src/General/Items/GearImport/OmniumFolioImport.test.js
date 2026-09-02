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
  const CRIT_RUNE = 1279609;
  // A real line, from the export that prompted this.
  const LINE = "omnium_talents=136814:1/136815:1/136817:1/136819:1/136822:1";

  const settings = (replace) => {
    const s = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
    return { ...s, replaceExistingGems: { ...s.replaceExistingGems, value: replace } };
  };

  test("the rune we can identify is read into its slot", () => {
    expect(parseOmniumTalents(LINE)).toEqual({ [FOLIO_STAT_SLOT]: CRIT_RUNE });
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
