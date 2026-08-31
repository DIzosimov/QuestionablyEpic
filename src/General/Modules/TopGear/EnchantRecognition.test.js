import { getEnchantByEnchantID, getEnchantById, enchantDB } from "Databases/EnchantDB";

/*
  Recognising the enchants an imported character is already wearing.

  SimC reports enchant_id for every enchanted slot, and the importer parsed it into a local variable and threw it
  away - so there was no record of what the player had on, and no way to tell an enchant being recommended apart
  from one already applied. Rows now carry that id where it's known.
*/
describe("Enchants an imported character is wearing", () => {
  // Taken from a real SimC export, with the slot each id appeared in.
  const KNOWN = {
    7961: "Empowered Hex of Leeching",
    8031: "Silvermoon's Mending",
    7937: "Arcanoweave Spellthread",
    7993: "Shaladrassil's Roots",
    8013: "Mark of the Magister",
    7997: "Nature's Fury",
    8025: "Silvermoon's Alacrity",
    8689: "Rite of the Hash'ey",
  };

  test("each known id resolves to the enchant it belongs to", () => {
    Object.entries(KNOWN).forEach(([enchantID, name]) => {
      expect(getEnchantByEnchantID(Number(enchantID)).name).toEqual(name);
    });
  });

  test("the ids are the enchantment ids, not item or spell ids", () => {
    // Empowered Hex of Leeching is itemID 243951 and spellID 1236056; neither is what SimC reports.
    expect(getEnchantByEnchantID(243951)).toBeUndefined();
    expect(getEnchantByEnchantID(1236056)).toBeUndefined();
    expect(getEnchantById("Empowered Hex of Leeching").enchantID).toEqual(7961);
  });

  test("an id we don't know is unknown rather than a wrong match", () => {
    // The report treats this as "can't tell" and leaves the enchant unmarked.
    expect(getEnchantByEnchantID(99999)).toBeUndefined();
  });

  test("an unenchanted slot is unknown too", () => {
    expect(getEnchantByEnchantID(0)).toBeUndefined();
  });

  test("no two enchants claim the same id", () => {
    const ids = enchantDB.map((enchant) => enchant.enchantID).filter(Boolean);
    expect(new Set(ids).size).toEqual(ids.length);
  });
});
