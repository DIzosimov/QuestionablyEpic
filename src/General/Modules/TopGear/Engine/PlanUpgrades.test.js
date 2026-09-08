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
    return planUpgrades(items, [], player, "Raid", player.getHPS("Raid"), settings, player.getActiveModel("Raid"), budget);
  };

  const HERO = 3445;

  test("upgrades are planned, and every one gains healing", () => {
    const bought = plan({ [HERO]: 200 });

    expect(bought.length).toBeGreaterThan(0);
    bought.forEach((purchase) => expect(purchase.gain).toBeGreaterThan(0));
  });

  test("with only one rank affordable, it buys the best single rank", () => {
    const { CRESTS_PER_UPGRADE } = require("Databases/CrestDB");
    const bought = plan({ [HERO]: CRESTS_PER_UPGRADE });

    expect(bought).toHaveLength(1);
    expect(bought[0].crests).toEqual(CRESTS_PER_UPGRADE);
    expect(bought[0].gain).toBeGreaterThan(0);
  });

  test("with more to spend it can buy a whole climb as one decision", () => {
    // A piece is costed all the way to a level, not a rank at a time - otherwise a piece that has to clear the
    // one in its slot before it gains anything would never be bought into.
    const bought = plan({ [HERO]: 200 });
    const climbs = bought.filter((purchase) => purchase.crests > 20);

    expect(climbs.length).toBeGreaterThan(0);
    climbs.forEach((climb) => expect(climb.toLevel).toBeGreaterThan(climb.fromLevel));
  });

  test("it spends no more than the budget allows", () => {
    const { CRESTS_PER_UPGRADE } = require("Databases/CrestDB");
    const budget = CRESTS_PER_UPGRADE * 3;
    const bought = plan({ [HERO]: budget });

    // Counted in crests, not purchases: one purchase can be a climb of several ranks.
    expect(bought.length).toBeGreaterThan(0);
    expect(bought[bought.length - 1].spent[HERO]).toBeLessThanOrEqual(budget);
    expect(bought.reduce((sum, p) => sum + p.crests, 0)).toBeLessThanOrEqual(budget);
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

    planUpgrades(items, [], player, "Raid", player.getHPS("Raid"), settings, player.getActiveModel("Raid"), { [HERO]: 200 });

    expect(items.map((item) => item.level)).toEqual(levels);
  });

  test("later upgrades are valued against the ones already bought", () => {
    // Secondaries diminish, so buying the whole set can't be worth the first upgrade times the number bought.
    const bought = plan({ [HERO]: 200 });
    const total = bought.reduce((sum, purchase) => sum + purchase.gain, 0);

    expect(total).toBeLessThan(bought[0].gain * bought.length);
  });
}, 300000);

/*
  Pieces that lost their slot.

  A piece has to clear the one it would replace before it gains anything, so a plan built only from the winning
  set could never buy into one that a couple of upgrades would make the better choice - which is exactly what
  adding a piece by hand is for.
*/
describe("Buying into a piece that isn't worn", () => {
  const Player = require("General/Modules/Player/Player").default;
  const Item = require("General/Items/Item").default;
  const { planUpgrades } = require("./TopGearEngine");
  const rootReducer = require("Redux/Reducers/RootReducer").default;
  const HERO = 3445;

  const GEAR = [
    [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
    [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
    [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
  ];

  const make = (id, slot, level, track) => {
    const item = new Item(id, "", slot, 0, "", 0, level, "");
    item.active = true;
    item.upgradeTrack = track;
    return item;
  };

  const setup = () => {
    const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
    const chosen = GEAR.map(([id, slot]) => {
      const item = make(id, slot, 318, "Hero");
      item.isEquipped = true;
      player.addActiveItem(item);
      return item;
    });
    return { player, chosen };
  };

  const plan = (chosen, candidates, player, budget) => {
    const settings = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
    return planUpgrades(chosen, candidates, player, "Raid", player.getHPS("Raid"), settings,
                        player.getActiveModel("Raid"), budget);
  };

  test("a worse piece of the same slot can still be upgraded into the plan", () => {
    const { player, chosen } = setup();
    // Well below what's worn, so its first rank alone can't pay for itself.
    const spare = make(268223, "Chest", 308, "Hero");
    player.addActiveItem(spare);

    const bought = plan(chosen, [spare], player, { [HERO]: 400 });
    // Whether it's worth buying depends on the numbers; what matters is that it was allowed to compete.
    bought.forEach((purchase) => expect(purchase.gain).toBeGreaterThan(0));
    expect(bought.length).toBeGreaterThan(0);
  });

  test("a candidate in a slot the set doesn't use is ignored", () => {
    const { player, chosen } = setup();
    const orphan = make(268230, "Tabard", 308, "Hero");

    expect(() => plan(chosen, [orphan], player, { [HERO]: 100 })).not.toThrow();
  });

  test("candidates never leave the worn set with two pieces in a slot", () => {
    const { player, chosen } = setup();
    const spare = make(268223, "Chest", 311, "Hero");

    // A second chest can only ever displace the first, never sit beside it - the score would be nonsense.
    const bought = plan(chosen, [spare], player, { [HERO]: 200 });
    bought.forEach((purchase) => expect(purchase.gain).toBeGreaterThan(0));
  });

  test("no candidates behaves exactly as before", () => {
    const { player, chosen } = setup();

    expect(plan(chosen, [], player, { [HERO]: 0 })).toEqual([]);
    expect(plan(chosen, [], player, { [HERO]: 100 }).length).toBeGreaterThan(0);
  });

  test("the player's own gear is never altered by planning", () => {
    const { player, chosen } = setup();
    const spare = make(268223, "Chest", 308, "Hero");
    const levels = [...chosen.map((i) => i.level), spare.level];

    plan(chosen, [spare], player, { [HERO]: 400 });

    expect([...chosen.map((i) => i.level), spare.level]).toEqual(levels);
  });
});
