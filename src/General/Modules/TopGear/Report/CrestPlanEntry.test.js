import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CrestPlanEntry from "./CrestPlanEntry";

/*
  The crest spending panel.

  react-scripts build doesn't type check - an undefined name in JSX compiles cleanly and only fails in the browser,
  which is how a deleted component shipped earlier in this work. So the panel gets a test that actually renders it.

  It's its own component partly for that: the report it used to live inside can't be rendered from the bundled
  sample any more, which had already drifted past several fields the report reads.
*/

const HERO = 3445;
const PLAN = [
  { id: 268230, slot: "Head", fromLevel: 308, toLevel: 311, crest: "Hero", crests: 20, gain: 2340, spent: { [HERO]: 20 } },
  { id: 268237, slot: "Legs", fromLevel: 308, toLevel: 311, crest: "Hero", crests: 20, gain: 2310, spent: { [HERO]: 40 } },
];

const draw = (plan) => render(
  <ThemeProvider theme={createTheme()}>
    <CrestPlanEntry plan={plan} language="en" gameType="Retail" />
  </ThemeProvider>,
);

/*
  The same plan grouped by piece. The ordered list answers "what next"; this answers "how much does each piece
  cost me in the end", which is what a piece taking two ranks makes hard to read - it appears twice above and
  looks like two separate decisions.
*/
describe("The per piece summary", () => {
  // Peaks takes two ranks; the others take one. Modelled on a real plan.
  const TWO_RANKS = [
    { id: 268230, slot: "Head", fromLevel: 311, toLevel: 315, crest: "Hero", crests: 20, gain: 614, spent: { [HERO]: 20 } },
    { id: 268237, slot: "Legs", fromLevel: 311, toLevel: 315, crest: "Hero", crests: 20, gain: 500, spent: { [HERO]: 40 } },
    { id: 268237, slot: "Legs", fromLevel: 315, toLevel: 318, crest: "Hero", crests: 20, gain: 519, spent: { [HERO]: 60 } },
  ];

  test("a piece taking two ranks is shown once, with both added up", () => {
    const { getByText } = draw(TWO_RANKS);

    expect(getByText(/Per piece/)).toBeTruthy();
    expect(getByText("311 → 318")).toBeTruthy();   // both ranks, as one span
    expect(getByText("40 Hero crests")).toBeTruthy(); // both purchases, as one cost
    expect(getByText("+1,019")).toBeTruthy();      // both gains
  });

  test("the pieces taking one rank are unchanged by the grouping", () => {
    const { getAllByText } = draw(TWO_RANKS);

    // Head appears in the ordered list and again in the summary, identical both times.
    expect(getAllByText("20 Hero crests").length).toBeGreaterThanOrEqual(2);
  });

  test("it isn't drawn when every piece takes a single rank", () => {
    // Nothing to add up, so the summary would just repeat the list above it.
    expect(draw(PLAN).queryByText(/Per piece/)).toBeNull();
  });

  test("the total still counts every purchase", () => {
    expect(draw(TWO_RANKS).getByText(/Total: 60 Hero/)).toBeTruthy();
  });
});

describe("The crest spending panel", () => {
  test("nothing to buy draws nothing, not a bare heading", () => {
    // The common case: the option is off, or every piece is already at its track cap.
    expect(draw([]).queryByText(/Crest spending/)).toBeNull();
    expect(draw(undefined).queryByText(/Crest spending/)).toBeNull();
  });

  test("a plan is numbered in the order it should be bought", () => {
    const { getByText } = draw(PLAN);

    expect(getByText(/Crest spending/)).toBeTruthy();
    expect(getByText(/^1\./)).toBeTruthy();
    expect(getByText(/^2\./)).toBeTruthy();
  });

  test("each line says what it lifts, what it costs and what it gains", () => {
    const { getAllByText, getByText } = draw(PLAN);

    expect(getAllByText("308 → 311")).toHaveLength(2);
    expect(getAllByText("20 Hero crests")).toHaveLength(2);
    expect(getByText("+2,340")).toBeTruthy();
  });

  test("the total is what has been spent by the last purchase", () => {
    // Running totals, so the last line already carries the sum.
    expect(draw(PLAN).getByText(/Total: 40 Hero/)).toBeTruthy();
  });

  test("a currency with no name shows its id rather than breaking", () => {
    const unknown = [{ ...PLAN[0], spent: { 99999: 20 } }];
    expect(draw(unknown).getByText(/Total: 20 99999/)).toBeTruthy();
  });

  test("a purchase with no recorded spend still draws", () => {
    const missing = [{ ...PLAN[0], spent: undefined }];
    expect(draw(missing).getByText(/Crest spending/)).toBeTruthy();
  });
});
