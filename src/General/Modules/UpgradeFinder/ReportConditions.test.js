import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import ReportConditions from "./ReportConditions";

/*
  The conditions stamp on an Upgrade Finder report.

  react-scripts build doesn't type check, so an undefined name in JSX compiles cleanly and fails only in the
  browser. The stamp gets a test that actually renders it.

  What it prints is the whole point of it: WoWAudit rejects a report run under the wrong conditions, and the
  number on the page is no evidence either way. If the stamp said something the run didn't do it would be worse
  than not having one.
*/

const draw = (ufSettings) => render(
  <ThemeProvider theme={createTheme()}>
    <ReportConditions ufSettings={ufSettings} />
  </ThemeProvider>,
);

describe("The conditions an Upgrade Finder report was run under", () => {
  test("an ordinary report gets no stamp", () => {
    expect(draw({ maxCurrentGear: true }).container.innerHTML).toBe("");
  });

  test("a report saved before the toggle existed gets no stamp", () => {
    expect(draw(undefined).container.innerHTML).toBe("");
    expect(draw({}).container.innerHTML).toBe("");
  });

  test("a WoWAudit report says so", () => {
    expect(draw({ wowAudit: true }).getByText("Run under WoWAudit conditions")).toBeTruthy();
  });

  test("it prints every condition on the list, with what it was set to", () => {
    const { getByText } = draw({ wowAudit: true });

    ["Fight style", "Fight length", "Targets", "Power Infusion", "Vault sockets", "Equipped gear", "Candidates"]
      .forEach((condition) => expect(getByText(condition)).toBeTruthy());

    expect(getByText("Patchwerk")).toBeTruthy();
    expect(getByText("5 minutes")).toBeTruthy();
    expect(getByText("1 boss")).toBeTruthy();
  });
});
