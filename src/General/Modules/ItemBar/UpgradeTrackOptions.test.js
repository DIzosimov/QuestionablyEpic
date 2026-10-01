import { upgradeTracksFor, UPGRADE_TRACKS, CRAFTED_UPGRADE_TRACKS } from "./ItemBar";
import { UPGRADE_COSTS } from "Databases/CrestDB";

/*
  Which upgrade tracks an item added by hand can be put on.

  The SimC import reads the track from bonus ids; an item added by hand has nothing to read it from, so it is
  asked for. Without a crafted option there was no way to say a piece was crafted at all, so a crafted piece
  offered no upgrades and never appeared in a crest plan - the 80 crests it costs were simply invisible.
*/

// Real ids. A crafted chest and a dropped one, so the branch is decided by the item database rather than by a
// stub that could agree with the code while the database disagrees with both.
const CRAFTED_CHEST = 244578; // The same crafted mail chest the import tests use.
const DROPPED_HEAD = 268230;

describe("The tracks offered for an item", () => {
  test("a crafted item is offered the crafted tracks", () => {
    expect(upgradeTracksFor(CRAFTED_CHEST, "Retail")).toBe(CRAFTED_UPGRADE_TRACKS);
  });

  test("a dropped item is offered the ladder tracks", () => {
    expect(upgradeTracksFor(DROPPED_HEAD, "Retail")).toBe(UPGRADE_TRACKS);
  });

  test("an item that hasn't been chosen yet doesn't claim to be crafted", () => {
    expect(upgradeTracksFor("", "Retail")).toBe(UPGRADE_TRACKS);
  });

  test("every track offered is one the app can actually price", () => {
    // An option that isn't in the cost table would read as a track in the UI and be worth nothing in a plan.
    [...UPGRADE_TRACKS, ...CRAFTED_UPGRADE_TRACKS]
      .filter((track) => track.value !== "")
      .forEach((track) => expect(UPGRADE_COSTS[track.value]).toBeDefined());
  });

  test("the crafted options are the two crafted tracks, and none of the ladder ones", () => {
    expect(CRAFTED_UPGRADE_TRACKS.map((track) => track.value)).toEqual(["", "Hero Crafted", "Myth Crafted"]);
  });

  test("both lists let the track be cleared again", () => {
    expect(UPGRADE_TRACKS[0].value).toBe("");
    expect(CRAFTED_UPGRADE_TRACKS[0].value).toBe("");
  });
});
