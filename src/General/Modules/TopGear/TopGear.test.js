import React from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import "jest-canvas-mock";

import Player from "General/Modules/Player/Player";
import Item from "General/Items/Item";
import rootReducer from "Redux/Reducers/RootReducer";
import TopGear from "./TopGear";

/*
  A smoke test for the Top Gear page.

  There was no test that rendered this component, so a reference to something that had been deleted compiled
  cleanly, passed the whole suite, and only failed in the browser. react-scripts build does not type check - it is
  Babel transpilation, so an undefined component is not an error to it - and the repo's pinned TypeScript is too
  old to parse the project's own source, so nothing else was checking either.

  This does not assert what the page looks like. It asserts that it renders at all, which is the failure that got
  through.
*/

// Worker construction uses import.meta.url, which only the webpack build can parse.
jest.mock("General/Modules/TopGear/Engine/TopGearWorkerFactory", () => ({
  createTopGearWorker: jest.fn(),
}));

const mockStore = configureStore([]);

// CharacterPanel asks the character list for the active character; the page won't mount without one.
const makeChars = (player) => ({ allChar: [player], getActiveChar: () => player, getAllChar: () => [player] });

const makePlayer = () => {
  const player = new Player("T", "Preservation Evoker", 1, "EU", "R", "Dracthyr", "default", "Retail");
  [[268230, "Head"], [268250, "Neck"], [268223, "Chest"], [268205, "2H Weapon"]].forEach(([id, slot]) => {
    const item = new Item(id, "", slot, 0, "", 0, 330, "");
    item.active = true;
    item.isEquipped = true;
    player.addActiveItem(item);
  });
  return player;
};

const renderPage = (settings) => {
  const player = makePlayer();
  const store = mockStore({ playerSettings: settings, gameType: "Retail" });
  return render(
    <Provider store={store}>
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
        <TopGear player={player} allChars={makeChars(player)} patronStatus="Enthusiast"
                 setTopResult={() => {}} simcSnack={{}} singleUpdate={() => {}} />
        </MemoryRouter>
      </ThemeProvider>
    </Provider>,
  );
};

const defaults = () => rootReducer(undefined, { type: "@@INIT" }).playerSettings;

const on = (settings, key) => ({ ...settings, [key]: { ...settings[key], value: true } });

describe("The Top Gear page renders", () => {
  test("with an untouched profile", () => {
    expect(() => renderPage(defaults())).not.toThrow();
  });

  test("with the detailed gear panel open", () => {
    // The panel is a separate component doing its own search space maths, and it only mounts when opened.
    expect(() => renderPage(on(defaults(), "detailedGearOptions"))).not.toThrow();
  });

  test("with Optimize Everything on", () => {
    expect(() => renderPage(on(defaults(), "optimizeAllGearOptions"))).not.toThrow();
  });

  test("it draws the button that starts a run", () => {
    const { container } = renderPage(defaults());
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });
});
