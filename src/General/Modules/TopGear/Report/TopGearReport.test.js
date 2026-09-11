import { fetchReport } from "./TopGearReport";

/*
  Loading a saved report.

  Landing on /report/ without a code - a refresh after a run, or following the link directly - used to ask the API
  for reportID= and get an empty body back. res.json() turned that into "unexpected end of data", which reached the
  player as an uncaught runtime error on a page that then said "Loading..." forever.
*/
describe("Fetching a report that isn't there", () => {
  const setResult = () => {};
  const setBackground = () => {};

  afterEach(() => { delete global.fetch; });

  const fetchReturning = (body) => {
    const calls = [];
    global.fetch = (url) => {
      calls.push(url);
      return Promise.resolve({ text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) });
    };
    return calls;
  };

  test("an empty report code asks the API for nothing at all", async () => {
    const calls = fetchReturning("");
    let failed = false;

    await fetchReport("", setResult, setBackground, () => { failed = true; });

    expect(calls).toEqual([]);
    expect(failed).toBe(true);
  });

  test("an empty response body is reported, not thrown", async () => {
    fetchReturning("");
    let failed = false;

    await fetchReport("abcd1234", setResult, setBackground, () => { failed = true; });

    expect(failed).toBe(true);
  });

  test("a body that isn't JSON is reported, not thrown", async () => {
    fetchReturning("<html>502 Bad Gateway</html>");
    let failed = false;

    await fetchReport("abcd1234", setResult, setBackground, () => { failed = true; });

    expect(failed).toBe(true);
  });

  test("a request that fails outright is reported, not thrown", async () => {
    global.fetch = () => Promise.reject(new Error("network down"));
    let failed = false;

    await fetchReport("abcd1234", setResult, setBackground, () => { failed = true; });

    expect(failed).toBe(true);
  });

  test("a report the API says is missing is reported, not thrown", async () => {
    fetchReturning(JSON.stringify({ status: "Report not found" }));
    let failed = false;

    await fetchReport("abcd1234", setResult, setBackground, () => { failed = true; });

    expect(failed).toBe(true);
  });

  test("a real report still loads", async () => {
    const report = { player: { name: "T", realm: "R", region: "EU" }, itemSet: { setStats: {}, itemList: [] } };
    // The API double-encodes: a JSON string containing the report's JSON.
    fetchReturning(JSON.stringify(JSON.stringify(report)));
    let loaded = null;
    let failed = false;

    await fetchReport("abcd1234", (result) => { loaded = result; }, setBackground, () => { failed = true; });

    expect(failed).toBe(false);
    expect(loaded).toEqual(report);
  });
});
