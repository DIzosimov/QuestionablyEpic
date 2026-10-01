import { TopGearProgress } from "./TopGearEngine";

/* ---------------------------------------------------------------------------------------------- */
/*                              How a run is divided, and how it reports                          */
/* ---------------------------------------------------------------------------------------------- */
// Kept out of TopGear.tsx so it can be tested: that file can't be imported under jest, since the worker factory
// it pulls in uses import.meta.url, which only the webpack build can parse.


// The stages a run moves through, in order. Used to work out which shards are far enough along to be summed.
export const STAGE_ORDER = ["Preparing", "Evaluating sets", "Ranking results"];

/**
 * Combines what each worker has reported into one figure for the bar.
 *
 * Only shards in the same stage are summed: a shard counts different things in different stages, so adding one
 * worker's set count to another's evaluation count produces a number that means nothing. The run is only as far
 * along as its slowest worker, so that's the stage reported, and shards that have moved past it are left out
 * rather than mixed in. Shards that haven't reported yet are simply absent.
 */
export function aggregateShardProgress(reports: (TopGearProgress | undefined)[]): TopGearProgress | null {
  const reported = reports.filter(Boolean) as TopGearProgress[];
  if (reported.length === 0) return null;

  const slowest = Math.min(...reported.map((one) => Math.max(0, STAGE_ORDER.indexOf(one.stage))));
  const inStage = reported.filter((one) => one.stage === STAGE_ORDER[slowest]);

  return {
    stage: STAGE_ORDER[slowest],
    done: inStage.reduce((total, one) => total + one.done, 0),
    total: inStage.reduce((total, one) => total + one.total, 0),
  };
}

/**
 * How many workers a run of this size is worth.
 *
 * Adding the Nth worker takes the run from W/(N-1) to W/N, so it saves W/(N(N-1)) - the saving shrinks as workers
 * are added, while each one has to clear the same fixed startup. Worth having while that saving beats startup,
 * which settles N around sqrt(W / startup).
 *
 * Charging every worker a flat slice of the work instead left mid sized runs single threaded - a 60k evaluation
 * run got one worker where three would have cut it to a third - and that reads as the run time going back to
 * being linear in the size of the search rather than roughly flat.
 */
export function workersWorthSpending(estimatedEvaluations: number, maxWorkers: number,
                                     evaluationsPerSecond = 10000, startupSeconds = 0.6): number {
  const soloSeconds = estimatedEvaluations / evaluationsPerSecond;
  return Math.max(1, Math.min(maxWorkers, Math.floor(Math.sqrt(soloSeconds / startupSeconds))));
}
