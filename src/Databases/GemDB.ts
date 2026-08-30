

type GemEntry = {
    id: number; // The gems ID
    element?: string; // Gems element
    name: string; // The English name for the gem.
    icon: string; // The icon to use for the gem.
    stats: { [key: string]: number };
  }

// The current tier's stat gems grant this split: the major stat at GEM_MAJOR_STAT, the minor at GEM_MINOR_STAT.
// Kept here so the engine's gem lookup and any future tier update only have to change in one place.
export const GEM_MAJOR_STAT = 16;
export const GEM_MINOR_STAT = 9;

// Current-expansion gems. Metas are kept apart from the stat gems because they aren't interchangeable with them:
// a set has exactly one meta socket, and it's the only socket a meta can go in.
const isCurrentGem = (gem: GemEntry) => gem.id >= 240000 && gem.id < 250000;
export const isMetaGem = (gem: GemEntry) => gem.element === "Meta" || gem.name.includes("Diamond");

// GemDB has a couple of duplicated rows, so de-dupe before either list is offered to the player or searched.
const uniqueById = (gems: GemEntry[]) => gems.filter((gem, i) => gems.findIndex((other) => other.id === gem.id) === i);

export const getCurrentStatGems = (): GemEntry[] => uniqueById(gemDB.filter((gem) => isCurrentGem(gem) && !isMetaGem(gem)));
export const getCurrentMetaGems = (): GemEntry[] => uniqueById(gemDB.filter((gem) => isCurrentGem(gem) && isMetaGem(gem)));

export const gemDB: GemEntry[] = [
    {
      id: 240969,
      element: "Meta",
      name: "Telluric Eversong Diamond",
      icon: "inv_12_profession_jewelcrafting_epic_gem_cut_blue",
      stats: { intellect: 23, manaPerc: 1.04 },
    },
      {
      id: 240983,
      element: "Meta",
      name: "Indecipherable Eversong Diamond",
      icon: "inv_12_profession_jewelcrafting_epic_gem_cut_green",
      stats: { intellect: 32 },
    },
     {
      id: 240914,
      element: "Lapis",
      name: "Flawless Deadly Lapis",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_fire_blue",
      stats: { versatility: 16, crit: 9 },
    },
    {
      id: 240918,
      element: "Lapis",
      name: "Flawless Masterful Lapis",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_void_blue",
      stats: { versatility: 16, mastery: 9 },
    },
    {
      id: 240916,
      element: "Lapis",
      name: "Flawless Quick Lapis",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_nature_blue",
      stats: { versatility: 16, haste: 9 },
    },
    {
      id: 240910,
      element: "Garnet",
      name: "Flawless Versatile Garnet",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_frost_red",
      stats: { crit: 16, versatility: 9 },
    },
    {
      id: 240906,
      element: "Garnet",
      name: "Flawless Quick Garnet",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_nature_red",
      stats: { crit: 16, haste: 9 },
    },
    {
      id: 240908,
      element: "Garnet",
      name: "Flawless Masterful Garnet",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_void_red",
      stats: { crit: 16, mastery: 9 },
    },
    {
      id: 240902,
      element: "Amethyst",
      name: "Flawless Versatile Amethyst",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_frost_purple",
      stats: { mastery: 16, versatility: 9 },
    },
    {
      id: 240900,
      element: "Amethyst",
      name: "Flawless Quick Amethyst",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_nature_purple",
      stats: { mastery: 16, haste: 9 },
    },
    {
      id: 240898,
      element: "Amethyst",
      name: "Flawless Deadly Amethyst",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_fire_purple",
      stats: { mastery: 16, crit: 9 },
    },
    {
      id: 240894,
      element: "Peridot",
      name: "Flawless Versatile Peridot",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_frost_green",
      stats: { haste: 16, versatility: 9 },
    },
     {
      id: 240892,
      element: "Peridot",
      name: "Flawless Masterful Peridot",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_void_green",
      stats: { haste: 16, mastery: 9 },
    },
      {
      id: 240890,
      element: "Peridot",
      name: "Flawless Deadly Peridot",
      icon: "inv_12_profession_jewelcrafting_rare_gem_cut_fire_green",
      stats: { haste: 16, crit: 9 },
    },
    {
      id: 213488,
      element: "Emerald",
      name: "Quick Emerald",
      icon: "inv_jewelcrafting_cut-standart-gem_color2",
      stats: { haste: 7 },
    },
    {
      id: 213482,
      element: "Emerald",
      name: "Masterful Emerald",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color1_3",
      stats: { haste: 10, mastery: 3 },
    },
    {
      id: 213479,
      element: "Emerald",
      name: "Deadly Emerald",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color1_2",
      stats: { haste: 10, crit: 3 },
    },
    {
      id: 213485,
      element: "Emerald",
      name: "Versatile Emerald",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color1_1",
      stats: { haste: 10, versatility: 3 },
    },
    {
      id: 21334,
      element: "Onyx",
      name: "Quick Onyx",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color2_3",
      stats: { mastery: 10, haste: 3 },
    },
    {
      id: 21331,
      element: "Onyx",
      name: "Deadly Onyx",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color2_2",
      stats: { mastery: 10, crit: 3 },
    },
    {
      id: 21337,
      element: "Onyx",
      name: "Versatile Onyx",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color2_1",
      stats: { mastery: 10, versatility: 3 },
    },
    {
      id: 213500,
      element: "Onyx",
      name: "Masterful Onyx",
      icon: "inv_jewelcrafting_cut-standart-gem_color1",
      stats: { mastery: 7 },
    },
    {
      id: 213458,
      element: "Ruby",
      name: "Masterful Ruby",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color4_1",
      stats: { crit: 10, mastery: 3 },
    },
    {
      id: 213455,
      element: "Ruby",
      name: "Quick Ruby",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color4_3",
      stats: { crit: 10, haste: 3 },
    },
    {
      id: 213461,
      element: "Ruby",
      name: "Versatile Ruby",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color4_2",
      stats: { crit: 10, versatility: 3 },
    },
    {
      id: 213464,
      element: "Ruby",
      name: "Deadly Ruby",
      icon: "inv_jewelcrafting_cut-standart-gem_color5",
      stats: { crit: 7 },
    },
    {
      id: 213470,
      element: "Sapphire",
      name: "Quick Sapphire",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color5_3",
      stats: { versatility: 10, haste: 3 },
    },
    {
      id: 213473,
      element: "Sapphire",
      name: "Masterful Sapphire",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color5_1",
      stats: { versatility: 10, mastery: 3 },
    },
    {
      id: 213467,
      element: "Sapphire",
      name: "Deadly Sapphire",
      icon: "inv_jewelcrafting_cut-standart-gem-hybrid_color5_2",
      stats: { versatility: 10, crit: 3 },
    },
    {
      id: 213476,
      element: "Sapphire",
      name: "Versatile Sapphire",
      icon: "inv_jewelcrafting_cut-standart-gem_color3",
      stats: { versatility: 7 },
    },
    {
      id: 213743,
      element: "Meta",
      name: "Culminating Blasphemite",
      icon: "item_cutmetagemb",
      stats: { intellect: 12 },
    },
    {
      id: 213746,
      element: "Meta",
      name: "Elusive Blasphemite",
      icon: "inv_misc_gem_x4_metagem_cut",
      stats: { intellect: 12 },
    },
];
  