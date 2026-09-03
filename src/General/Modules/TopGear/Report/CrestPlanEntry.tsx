import { Grid, Paper, Typography, Divider } from "@mui/material";
import { getTranslatedItemName } from "General/Engine/ItemUtilities";
import { CREST_CURRENCIES } from "Databases/CrestDB";

type Purchase = {
  id: number;
  slot: string;
  fromLevel: number;
  toLevel: number;
  crest: string;
  crests: number;
  gain: number;
  spent: { [currencyID: number]: number };
};

interface CrestPlanEntryProps {
  plan?: Purchase[];
  language?: string;
  gameType?: gameTypes;
}

/**
 * What to spend crests on, in the order to spend it.
 *
 * A list rather than a single target set: the answer to "what do I buy next" is more useful than a set that might
 * be several weeks of crests away, and each line is priced against what's left after the ones above it.
 *
 * Drawn only when there's a plan. The option is off by default, and a character whose gear is all at its track cap
 * has nothing to buy, so an empty list is the common case and shouldn't leave a bare heading behind.
 */
export default function CrestPlanEntry({ plan = [], language = "en", gameType = "Retail" }: CrestPlanEntryProps) {
  if (plan.length === 0) return null;

  const total = Object.entries(plan[plan.length - 1].spent || {})
    .map(([currencyID, amount]) => amount + " " + (CREST_CURRENCIES[Number(currencyID)] || currencyID))
    .join(", ");

  // The same plan by piece rather than by purchase. The ordered list says what to buy next; this says how much
  // each piece ends up costing, which is the question once you've decided to follow the whole thing - a piece
  // taking two ranks appears twice above and is easy to read as two separate decisions.
  const byItem: { id: number; from: number; to: number; crest: string; crests: number; gain: number }[] = [];
  plan.forEach((purchase) => {
    const existing = byItem.find((entry) => entry.id === purchase.id && entry.crest === purchase.crest);
    if (existing) {
      existing.to = Math.max(existing.to, purchase.toLevel);
      existing.from = Math.min(existing.from, purchase.fromLevel);
      existing.crests += purchase.crests;
      existing.gain += purchase.gain;
    } else {
      byItem.push({ id: purchase.id, from: purchase.fromLevel, to: purchase.toLevel,
                    crest: purchase.crest, crests: purchase.crests, gain: purchase.gain });
    }
  });

  return (
    <Grid item xs={12}>
      <Paper elevation={0} style={{ backgroundColor: "rgba(28,28,28,0.5)", padding: 10, marginBottom: 8 }}>
        <Typography variant="subtitle1" color="primary">Crest spending</Typography>
        <Typography variant="caption" style={{ color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 6 }}>
          {"What to buy next, in order. Each upgrade is worth what it gives this set, priced against what you'd have after the ones above it."}
        </Typography>
        <Divider style={{ borderColor: "rgba(255,255,255,0.12)", marginBottom: 8 }} />

        {plan.map((purchase, index) => (
          <Grid container key={index} spacing={1} alignItems="center" style={{ marginBottom: 2 }}>
            <Grid item xs={12} sm={5}>
              <Typography variant="body2" style={{ color: "#f0c674" }}>
                {(index + 1) + ". " + getTranslatedItemName(purchase.id, language, "", gameType)}
              </Typography>
            </Grid>
            <Grid item xs={4} sm={2}>
              <Typography variant="caption">{purchase.fromLevel + " → " + purchase.toLevel}</Typography>
            </Grid>
            <Grid item xs={4} sm={3}>
              <Typography variant="caption">{purchase.crests + " " + purchase.crest + " crests"}</Typography>
            </Grid>
            <Grid item xs={4} sm={2}>
              <Typography variant="caption" style={{ color: "#8fbf6f" }}>{"+" + purchase.gain.toLocaleString()}</Typography>
            </Grid>
          </Grid>
        ))}

        <Divider style={{ borderColor: "rgba(255,255,255,0.12)", margin: "8px 0" }} />

        {byItem.length < plan.length ? (
          <>
            <Typography variant="caption" style={{ color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 4 }}>
              {"Per piece, if you follow the whole plan"}
            </Typography>
            {byItem.map((entry, index) => (
              <Grid container key={index} spacing={1} alignItems="center" style={{ marginBottom: 2 }}>
                <Grid item xs={12} sm={5}>
                  <Typography variant="caption" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {getTranslatedItemName(entry.id, language, "", gameType)}
                  </Typography>
                </Grid>
                <Grid item xs={4} sm={2}>
                  <Typography variant="caption">{entry.from + " → " + entry.to}</Typography>
                </Grid>
                <Grid item xs={4} sm={3}>
                  <Typography variant="caption">{entry.crests + " " + entry.crest + " crests"}</Typography>
                </Grid>
                <Grid item xs={4} sm={2}>
                  <Typography variant="caption" style={{ color: "#8fbf6f" }}>{"+" + entry.gain.toLocaleString()}</Typography>
                </Grid>
              </Grid>
            ))}
            <Divider style={{ borderColor: "rgba(255,255,255,0.12)", margin: "8px 0" }} />
          </>
        ) : null}

        <Typography variant="caption" style={{ color: "rgba(255,255,255,0.75)" }}>{"Total: " + total}</Typography>
      </Paper>
    </Grid>
  );
}
