import { TopGearProgress } from "./TopGearEngine";

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
