/* ---------------------------------------------------------------------------------------------- */
/*                                          Enchant DB                                            */
/* ---------------------------------------------------------------------------------------------- */
// Every enchant the app models, extracted from the values that were previously inlined in
// TopGearEngine.enchantItems. This is now the single source of truth: the engine applies from here, and the
// selection UI offers from here, so the two can't drift apart the way the embellishment lists did.
//
// `stats` are flat additions. `procStats` are applied at the enchant's uptime rather than in full, which is how
// the weapon enchants behave. `manaPerc` is multiplicative.

export type EnchantEntry = {
  id: string; // stable key, used as the setting value
  name: string;
  slots: string[]; // which item slots this enchant can go on
  stats?: { [key: string]: number };
  procStats?: { [key: string]: number }; // scaled by the enchant's proc uptime
  manaPerc?: number;
  specRestriction?: string[]; // only offered / defaulted for these specs
  isDefaultFor?: string[]; // specs this is the automatic pick for
};

// Some enchants have no stat of their own - they grant their budget to whichever secondary the spec values most.
// Use this as the stat key and the engine resolves it per spec at evaluation time.
export const BEST_SECONDARY = "bestSecondary";

// Weapon enchants proc, and the engine has always valued them at 3 PPM over a 15s window.
export const WEAPON_ENCHANT_PPM = 3;
export const WEAPON_ENCHANT_DURATION = 15;

export const enchantDB: EnchantEntry[] = [
  /* ------------------------------------------- Rings ------------------------------------------- */
  // All ring enchants grant the same amount; the only difference is which stat. This is the value for ONE ring -
  // a set wears two and each is applied separately, so a set running the same enchant on both gets twice this.
  { id: "Silvermoon's Alacrity", name: "Silvermoon's Alacrity", slots: ["Finger"], stats: { haste: 29 } },
  { id: "Nature's Fury", name: "Nature's Fury", slots: ["Finger"], stats: { crit: 29 } },
  { id: "Zul'jin's Mastery", name: "Zul'jin's Mastery", slots: ["Finger"], stats: { mastery: 29 } },
  { id: "Silvermoon's Tenacity", name: "Silvermoon's Tenacity", slots: ["Finger"], stats: { versatility: 29 } },
  // Eyes of the Eagle is the name these two specs see. It grants the same budget as the others, applied to their
  // best stat rather than a fixed one.
  { id: "Eyes of the Eagle", name: "Eyes of the Eagle", slots: ["Finger"], stats: { [BEST_SECONDARY]: 29 },
    specRestriction: ["Holy Priest", "Restoration Shaman"], isDefaultFor: ["Holy Priest", "Restoration Shaman"] },

  /* -------------------------------------------- Head ------------------------------------------- */
  { id: "Empowered Hex of Leeching", name: "Empowered Hex of Leeching", slots: ["Head"], stats: { leech: 55 } },

  /* ------------------------------------------- Chest ------------------------------------------- */
  { id: "Mark of the Worldsoul", name: "Mark of the Worldsoul", slots: ["Chest"], stats: { intellect: 50 } },
  { id: "Mark of the Magister", name: "Mark of the Magister", slots: ["Chest"], stats: { intellect: 40 }, manaPerc: 1.05,
    isDefaultFor: ["Restoration Shaman"] },

  /* ----------------------------------------- Shoulder ------------------------------------------ */
  { id: "Silvermoon's Mending", name: "Silvermoon's Mending", slots: ["Shoulder"], stats: { leech: 166 } },

  /* -------------------------------------------- Legs ------------------------------------------- */
  { id: "Arcanoweave Spellthread", name: "Arcanoweave Spellthread", slots: ["Legs"], stats: { intellect: 41 }, manaPerc: 1.04 },

  /* -------------------------------------------- Feet ------------------------------------------- */
  { id: "Shaladrassil's Roots", name: "Shaladrassil's Roots", slots: ["Feet"], stats: { leech: 28 } },

  /* ------------------------------------------ Weapon ------------------------------------------- */
  { id: "Acuity of the Ren'dorei", name: "Acuity of the Ren'dorei", slots: ["1H Weapon", "2H Weapon", "CombinedWeapon"],
    procStats: { intellect: 67 } },
  { id: "Berserker's Rage", name: "Berserker's Rage", slots: ["1H Weapon", "2H Weapon", "CombinedWeapon"],
    procStats: { haste: 124 }, isDefaultFor: ["Discipline Priest", "Restoration Druid"] },
  { id: "Arcane Mastery", name: "Arcane Mastery", slots: ["1H Weapon", "2H Weapon", "CombinedWeapon"],
    procStats: { mastery: 124 }, isDefaultFor: ["Preservation Evoker"] },
  { id: "Worldsoul Tenacity", name: "Worldsoul Tenacity", slots: ["1H Weapon", "2H Weapon", "CombinedWeapon"],
    procStats: { versatility: 124 } },
  // Grants a random secondary, favouring the highest while above 80% health. Healers sit above that nearly all
  // the time, so it's valued as landing on the best secondary every proc.
  { id: "Rite of the Hash'ey", name: "Rite of the Hash'ey", slots: ["1H Weapon", "2H Weapon", "CombinedWeapon"],
    procStats: { [BEST_SECONDARY]: 139 } },
];

/**
 * The two ring slots. A set wears two rings and each is enchanted on its own, so they're separate choices - but
 * they draw from one list, since the game has no notion of a left-ring enchant.
 */
export const RING_SLOTS = ["Finger1", "Finger2"];

/** The slot an enchant list is keyed under. Both ring slots share the Finger list. */
export const enchantSlotSource = (slot: string): string => (RING_SLOTS.includes(slot) ? "Finger" : slot);

/** Every enchant legal on a slot, filtered to the ones this spec can use. */
export const getEnchantsForSlot = (slot: string, spec: string): EnchantEntry[] => {
  const source = enchantSlotSource(slot);
  return enchantDB.filter((e) => e.slots.includes(source) && (!e.specRestriction || e.specRestriction.includes(spec)));
};

/** The enchant the engine picks automatically for a slot, or undefined when the choice is stat-driven. */
export const getDefaultEnchant = (slot: string, spec: string): EnchantEntry | undefined => {
  const candidates = getEnchantsForSlot(slot, spec);
  return candidates.find((e) => e.isDefaultFor && e.isDefaultFor.includes(spec)) ||
         candidates.find((e) => !e.isDefaultFor && !e.specRestriction);
};

export const getEnchantById = (id: string): EnchantEntry | undefined => enchantDB.find((e) => e.id === id);

/** Slots the player can choose an enchant for, in the order they're shown. */
export const ENCHANTABLE_SLOTS = ["Head", "Shoulder", "Chest", "Legs", "Feet", ...RING_SLOTS, "CombinedWeapon"];
