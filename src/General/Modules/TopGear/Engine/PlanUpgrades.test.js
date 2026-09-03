/*
  Valuing an upgrade against a real set, rather than by its stat gain on paper. This goes through the same evalSet
  as everything else, so a rank is worth what it does for this character's set.
*/
describe("What an upgrade is worth to a set", () => {
  const Player = require("General/Modules/Player/Player").default;
  const Item = require("General/Items/Item").default;
  const { planUpgrades } = require("./TopGearEngine");
  const rootReducer = require("Redux/Reducers/RootReducer").default;

  const GEAR = [
    [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
    [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
    [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
  ];

  const geared = (level, track) => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    const items = GEAR.map(([id, slot]) => {
      const item = new Item(id, "", slot, 0, "", 0, level, "");
      item.active = true;
      item.isEquipped = true;
      item.upgradeTrack = track;
      player.addActiveItem(item);
      return item;
    });
    return { player, items };
  };

  const plan = (budget, level = 308, track = "Hero") => {
    const { player, items } = geared(level, track);
    const settings = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
    return planUpgrades(items, player, "Raid", player.getHPS("Raid"), settings, player.getActiveModel("Raid"), budget);
  };

  const HERO = 3445;

  test("upgrades are planned, and every one gains healing", () => {
    const bought = plan({ [HERO]: 200 });

    expect(bought.length).toBeGreaterThan(0);
    bought.forEach((purchase) => expect(purchase.gain).toBeGreaterThan(0));
  });

  test("each purchase was the best available when it was made", () => {
    // Not the same as the list being in descending order. Gains are recomputed after every purchase, and stats
    // interact through diminishing returns - buying a crit piece can raise what a haste piece is worth - so a
    // later purchase can come out slightly higher than an earlier one.
    const bought = plan({ [HERO]: 200 });
    const first = plan({ [HERO]: 20 });

    // Compared by which piece it is: each call builds its own gear, so the objects aren't the same ones.
    expect(bought[0].item.id).toEqual(first[0].item.id);
    expect(bought[0].gain).toBeCloseTo(first[0].gain, 3);
  });

  test("it spends no more than the budget allows", () => {
    const { CRESTS_PER_UPGRADE } = require("Databases/CrestDB");
    const budget = CRESTS_PER_UPGRADE * 3;
    const bought = plan({ [HERO]: budget });

    expect(bought).toHaveLength(3);
    expect(bought[bought.length - 1].spent[HERO]).toBeLessThanOrEqual(budget);
  });

  test("no crests means nothing to buy", () => {
    expect(plan({ [HERO]: 0 })).toEqual([]);
    expect(plan({})).toEqual([]);
  });

  test("gear already at its cap is left alone", () => {
    const { CONSTANTS } = require("General/Engine/CONSTANTS");
    // A Hero set at its cap is finished, however many crests are on offer.
    expect(plan({ [HERO]: 999 }, CONSTANTS.itemLevelCaps.Hero)).toEqual([]);
  });

  test("planning doesn't alter the player's own gear", () => {
    const { player, items } = geared(308, "Hero");
    const settings = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
    const levels = items.map((item) => item.level);

    planUpgrades(items, player, "Raid", player.getHPS("Raid"), settings, player.getActiveModel("Raid"), { [HERO]: 200 });

    expect(items.map((item) => item.level)).toEqual(levels);
  });

  test("later upgrades are valued against the ones already bought", () => {
    // Secondaries diminish, so buying the whole set can't be worth the first upgrade times the number bought.
    const bought = plan({ [HERO]: 200 });
    const total = bought.reduce((sum, purchase) => sum + purchase.gain, 0);

    expect(total).toBeLessThan(bought[0].gain * bought.length);
  });
}, 300000);
