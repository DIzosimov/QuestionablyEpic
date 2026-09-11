/**
 * @jest-environment node
 *
 * Node rather than jsdom: this file needs a real structuredClone to stand in for what postMessage does, and a
 * `self` it can replace with a stand-in for the worker global. jsdom supplies neither.
 */
import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import { buildNewWepCombos } from "General/Engine/ItemUtilities";
import { runTopGear, runTopGearShard, finishTopGear } from "./TopGearEngine";
import { aggregateShardProgress } from "./ShardProgress";
import rootReducer from "Redux/Reducers/RootReducer";
import { serialize, deserialize } from "v8";

// What postMessage does to a value: the structured clone algorithm. jest's node environment predates a global
// structuredClone, and v8's serializer implements the same algorithm - prototypes are dropped, functions throw.
const structuredClone = (value) => deserialize(serialize(value));

/*
  The worker path. Everything below the engine's own API - the message the worker answers, what survives the trip
  back across the thread boundary, and how the page adds up what several workers report.

  None of this needs real threads, and none of it was covered: the engine tests call runTopGearShard and
  finishTopGear directly, with live objects, in one thread. That is not what the app does.
*/

const base = rootReducer(undefined, { type: "@@INIT" }).playerSettings;
const cfg = (overrides = {}) => {
  const s = JSON.parse(JSON.stringify(base));
  Object.entries({ detailedGearOptions: true, ...overrides }).forEach(([k, v]) => {
    s[k] = s[k] ? { ...s[k], value: v } : { value: v, options: [], category: "gems", type: "hidden", gameType: "Retail" };
  });
  return s;
};

const GEAR = [
  [268230, "Head"], [268250, "Neck"], [268231, "Shoulder"], [271451, "Back"], [268223, "Chest"],
  [271497, "Wrist"], [271502, "Hands"], [268216, "Waist"], [268237, "Legs"], [268233, "Feet"],
  [268249, "Finger"], [268252, "Finger"], [270175, "Trinket"], [274493, "Trinket"], [268205, "2H Weapon"],
  // A choice in two slots, so there is more than one set to divide between shards.
  [268229, "Head"], [268224, "Chest"],
];

// Enough of a search that the shards have something to disagree about.
const WIDE = {
  selectedGems: [240898, 240890, 240914],
  enchantChoices: {
    CombinedWeapon: ["Arcane Mastery", "Berserker's Rage", "Rite of the Hash'ey"],
    Finger: ["Nature's Fury", "Zul'jin's Mastery", "Silvermoon's Alacrity"],
  },
};

const makePlayer = () => {
  const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
  GEAR.forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "");
    item.active = true;
    item.isEquipped = true;
    player.addActiveItem(item);
  });
  return player;
};

describe("A shard's result survives the trip back from a worker", () => {
  /*
    postMessage structured-clones whatever the worker returns, which strips every prototype: the ItemSets and Items
    the engine handed back arrive on the main thread as plain objects with no methods. finishTopGear then runs on
    those, not on the live objects every other test gives it.
  */
  const runSharded = (settings, count, clone) => {
    const player = makePlayer();
    const shards = [];
    for (let index = 0; index < count; index++) {
      const shard = runTopGearShard(player.activeItems, buildNewWepCombos(player, true), player, "Raid",
                                    player.getHPS("Raid"), settings, player.getActiveModel("Raid"), true,
                                    undefined, { index, count });
      shards.push(clone ? structuredClone(shard) : shard);
    }
    return finishTopGear(shards, player, "Raid", player.getActiveModel("Raid"));
  };

  test("a shard result is cloneable at all", () => {
    // A function anywhere on a returned set - an effect's runFunc, say - would make postMessage throw
    // DataCloneError at the end of a long run, with nothing to show for it.
    const player = makePlayer();
    const shard = runTopGearShard(player.activeItems, buildNewWepCombos(player, true), player, "Raid",
                                  player.getHPS("Raid"), cfg(WIDE), player.getActiveModel("Raid"));

    expect(() => structuredClone(shard)).not.toThrow();
  });

  test("merging cloned shards gives the same report as merging live ones", () => {
    const live = runSharded(cfg(WIDE), 4, false);
    const cloned = runSharded(cfg(WIDE), 4, true);

    expect(cloned.itemSet.hardScore).toEqual(live.itemSet.hardScore);
    expect(cloned.itemSet.setHPS).toEqual(live.itemSet.setHPS);
    expect(cloned.itemsCompared).toEqual(live.itemsCompared);
    expect(cloned.itemSet.enchantBreakdown).toEqual(live.itemSet.enchantBreakdown);
  });

  test("and the same report as never sharding at all", () => {
    const player = makePlayer();
    const whole = runTopGear(player.activeItems, buildNewWepCombos(player, true), player, "Raid",
                             player.getHPS("Raid"), cfg(WIDE), player.getActiveModel("Raid"));
    const cloned = runSharded(cfg(WIDE), 4, true);

    expect(cloned.itemSet.hardScore).toEqual(whole.itemSet.hardScore);
    expect(cloned.itemsCompared).toEqual(whole.itemsCompared);
  });

  test("close alternatives still describe their swaps after cloning", () => {
    const cloned = runSharded(cfg(WIDE), 4, true);

    expect(cloned.differentials.length).toBeGreaterThan(0);
    cloned.differentials.forEach((differential) => {
      // The report renders these; an empty row is the bug this guards.
      const swaps = differential.items.length + differential.gems.length +
                    differential.enchants.length + differential.runes.length;
      expect(swaps).toBeGreaterThan(0);
    });
  });
});

describe("The worker answers the message the page sends", () => {
  /*
    Driven through a stand-in for the worker global rather than a real thread. What matters here is the contract -
    that it reads the fields the page sends, forwards the shard, streams progress and reports failure - none of
    which needs threading to check.
  */
  const runWorker = (data) => {
    const posted = [];
    global.self = { postMessage: (message) => posted.push(message) };
    jest.isolateModules(() => require("./TopGearWorker"));
    return Promise.resolve(global.self.onmessage({ data })).then(() => posted);
  };

  const resultIn = (posted) => posted.find((message) => "success" in message);

  const payload = (extra = {}) => {
    const player = makePlayer();
    return {
      gameType: "Retail",
      itemList: player.activeItems,
      wepCombos: buildNewWepCombos(player, true),
      strippedPlayer: player,
      contentType: "Raid",
      baseHPS: player.getHPS("Raid"),
      playerSettings: cfg(),
      strippedCastModel: player.getActiveModel("Raid"),
      ...extra,
    };
  };

  afterEach(() => { delete global.self; });

  test("it returns a shard result, not a finished report", () => {
    return runWorker(payload()).then((posted) => {
      const done = posted.filter((message) => "success" in message);

      expect(done).toHaveLength(1);
      expect(done[0].success).toBe(true);
      // The page merges these itself, so the shape it gets back has to be the shard's, not a TopGearResult.
      expect(Object.keys(done[0].result).sort())
        .toEqual(["embellishedSelected", "equippedHPS", "rankedSets", "setsBuilt"]);
    });
  });

  test("it reports progress as it goes", () => {
    return runWorker(payload()).then((posted) => {
      const progress = posted.filter((message) => message.progress).map((message) => message.progress);

      expect(progress.length).toBeGreaterThan(1);
      expect(progress[0].stage).toEqual("Preparing");
      expect(progress[progress.length - 1].stage).toEqual("Ranking results");
    });
  });

  test("it evaluates only the shard it was given", () => {
    return runWorker(payload({ shard: { index: 0, count: 1 } })).then((whole) =>
      runWorker(payload({ shard: { index: 0, count: 2 } })).then((half) => {
        expect(resultIn(half).result.setsBuilt).toBeGreaterThan(0);
        expect(resultIn(half).result.setsBuilt).toBeLessThan(resultIn(whole).result.setsBuilt);
      }));
  });

  test("a missing shard is treated as the whole run", () => {
    return runWorker(payload()).then((without) =>
      runWorker(payload({ shard: { index: 0, count: 1 } })).then((withOne) => {
        expect(resultIn(without).result.setsBuilt).toEqual(resultIn(withOne).result.setsBuilt);
      }));
  });

  test("a crash comes back as a failure rather than silence", () => {
    // No item list at all: the engine can't build a set from it, and the page needs to be told.
    return runWorker(payload({ itemList: null, wepCombos: null })).then((posted) => {
      const done = posted.filter((message) => "success" in message);

      expect(done).toHaveLength(1);
      expect(done[0].success).toBe(false);
      expect(done[0].error).toBeTruthy();
    });
  });
});

describe("The page adds up what the workers report", () => {
  const at = (stage, done, total) => ({ stage, done, total });

  test("shards in the same stage are summed", () => {
    expect(aggregateShardProgress([at("Evaluating sets", 10, 100), at("Evaluating sets", 30, 100)]))
      .toEqual(at("Evaluating sets", 40, 200));
  });

  test("nothing reported yet is nothing to show", () => {
    expect(aggregateShardProgress([])).toBeNull();
    expect(aggregateShardProgress([undefined, undefined])).toBeNull();
  });

  test("a shard that hasn't reported is left out rather than counted as zero of nothing", () => {
    expect(aggregateShardProgress([at("Evaluating sets", 10, 100), undefined]))
      .toEqual(at("Evaluating sets", 10, 100));
  });

  test("the run is only as far along as its slowest worker", () => {
    // Mixing a preparing shard's numbers into an evaluating one's would add counts of different things.
    expect(aggregateShardProgress([at("Ranking results", 100, 100), at("Preparing", 0, 0)]))
      .toEqual(at("Preparing", 0, 0));
  });

  test("shards that have moved on are excluded, not mixed in", () => {
    expect(aggregateShardProgress([at("Evaluating sets", 50, 100), at("Ranking results", 100, 100), at("Evaluating sets", 20, 100)]))
      .toEqual(at("Evaluating sets", 70, 200));
  });

  test("an unknown stage doesn't break the ordering", () => {
    const combined = aggregateShardProgress([at("Something new", 1, 2), at("Evaluating sets", 5, 10)]);
    expect(combined).toBeTruthy();
  });
});

/*
  How many workers a run is worth.

  Each one costs a fixed startup - the engine bundle parsed and every database built, measured at ~0.6s - before
  it evaluates anything. Eight of those on a two second run made every run share the same floor. But charging each
  worker a flat slice of the work went too far the other way and left mid sized runs single threaded, which shows
  up as run time going back to being linear in the size of the search rather than roughly flat.
*/
describe("Spending workers on a run", () => {
  const { workersWorthSpending } = require("./ShardProgress");
  const workers = (evaluations) => workersWorthSpending(evaluations, 8);

  test("a run too small to pay for a second worker gets one", () => {
    // A second worker has to save more than its own startup, and there isn't that much work here.
    expect(workers(5000)).toEqual(1);
    expect(workers(0)).toEqual(1);
  });

  test("a mid sized run is shared out rather than left on one thread", () => {
    // The case the flat slice rule got wrong: a 60k run is six seconds alone and two with three workers.
    expect(workers(60000)).toBeGreaterThan(1);
    expect(workers(100000)).toBeGreaterThan(2);
  });

  test("more work means more workers, never fewer", () => {
    const sizes = [1000, 25000, 60000, 150000, 400000, 2000000];
    const counts = sizes.map(workers);

    counts.slice(1).forEach((count, i) => expect(count).toBeGreaterThanOrEqual(counts[i]));
  });

  test("a big run uses everything it's allowed", () => {
    expect(workers(400000)).toEqual(8);
    expect(workers(50000000)).toEqual(8);
  });

  test("it never asks for more workers than the machine allows", () => {
    expect(workersWorthSpending(50000000, 3)).toEqual(3);
    expect(workersWorthSpending(50000000, 1)).toEqual(1);
  });

  test("workers are added as the square root of the work, not in proportion to it", () => {
    // The saving from each extra worker shrinks - the fourth is worth far less than the second - so the count
    // grows far more slowly than the work does.
    const small = workers(100000);
    const hundredTimesBigger = workersWorthSpending(10000000, 1000);

    expect(hundredTimesBigger / small).toBeLessThan(20);
  });
});
