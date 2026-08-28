import React from "react";
import { Grid, Paper, Typography, Divider, MenuItem, TextField, FormControlLabel, Checkbox, Tooltip } from "@mui/material";
import { gemDB } from "Databases/GemDB";
import { getEnchantsForSlot, ENCHANTABLE_SLOTS } from "Databases/EnchantDB";
import { getFolioOptions } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";

/* ---------------------------------------------------------------------------------------------- */
/*        Gem, enchant and Omnium Folio selection. Sits with item selection, not in settings.      */
/* ---------------------------------------------------------------------------------------------- */
// These are choices about the set being built, the same as picking which items to include, so they belong next to
// item selection rather than in the global settings panel. Each Top Gear run uses exactly one configuration.

const SLOT_LABELS: { [key: string]: string } = {
  Head: "Head", Shoulder: "Shoulder", Chest: "Chest", Legs: "Legs",
  Feet: "Feet", Finger: "Rings", CombinedWeapon: "Weapon",
};

// Current-expansion gems. Metas are chosen separately since they aren't interchangeable with the stat gems.
const isMeta = (gem: any) => (gem.element === "Meta") || gem.name.includes("Diamond");
const currentGems = () => gemDB.filter((g) => g.id >= 240000 && g.id < 250000);

const gemLabel = (gem: any) => {
  const stats = Object.entries(gem.stats || {})
    .filter(([k]) => k !== "manaPerc")
    .map(([k, v]) => `${v} ${k}`)
    .join(" / ");
  return `${gem.name}${stats ? " (" + stats + ")" : ""}`;
};

export default function GearOptionsSelector(props: any) {
  const { playerSettings, updateSetting, spec } = props;

  const value = (key: string, fallback: any) =>
    playerSettings && playerSettings[key] !== undefined ? playerSettings[key].value : fallback;

  const enchantChoices = value("enchantChoices", {}) || {};
  const setEnchant = (slot: string, id: string) =>
    updateSetting("enchantChoices", { ...enchantChoices, [slot]: id });

  const stat = currentGems().filter((g) => !isMeta(g));
  const metas = currentGems().filter(isMeta);
  // GemDB has a couple of duplicated rows; de-dupe so the dropdown doesn't show the same gem twice.
  const dedupe = (list: any[]) => list.filter((g, i) => list.findIndex((o) => o.id === g.id) === i);

  const section = (title: string, hint: string, children: any) => (
    <Grid item xs={12}>
      <Paper elevation={0} style={{ backgroundColor: "rgba(28,28,28,0.5)", padding: 10 }}>
        <Typography variant="subtitle1" color="primary">{title}</Typography>
        <Typography variant="caption" style={{ color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 6 }}>{hint}</Typography>
        <Divider style={{ borderColor: "rgba(255,255,255,0.12)", marginBottom: 10 }} />
        <Grid container spacing={1}>{children}</Grid>
      </Paper>
    </Grid>
  );

  const dropdown = (label: string, val: any, onChange: (v: any) => void, options: { value: any; label: string }[]) => (
    <Grid item xs={12} sm={6} md={4} lg={3} key={label}>
      <TextField select fullWidth size="small" variant="outlined" label={label} value={val}
                 onChange={(e) => onChange(e.target.value)} style={{ minWidth: 150 }}>
        {options.map((o) => (
          <MenuItem key={String(o.value)} value={o.value}>{o.label}</MenuItem>
        ))}
      </TextField>
    </Grid>
  );

  return (
    <Grid container spacing={1} style={{ marginTop: 4 }}>
      {section("Gems", "Pick the gem you want socketed. Automatic uses the default for your spec.", (
        <>
          {dropdown("Meta Gem", value("selectedMetaGem", 0), (v) => updateSetting("selectedMetaGem", Number(v)),
            [{ value: 0, label: "Automatic" }].concat(dedupe(metas).map((g) => ({ value: g.id, label: gemLabel(g) }))))}
          {dropdown("Gem", value("selectedGem", 0), (v) => updateSetting("selectedGem", Number(v)),
            [{ value: 0, label: "Automatic" }].concat(dedupe(stat).map((g) => ({ value: g.id, label: gemLabel(g) }))))}
          <Grid item xs={12}>
            <Tooltip placement="right" title={
              <Typography variant="caption">
                Unticked, gems you already have socketed are kept and only empty sockets get filled — so the result
                is what you'd get without re-gemming. Ticked, every socket uses the gem above.
              </Typography>
            }>
              <FormControlLabel
                control={<Checkbox size="small" checked={value("replaceExistingGems", true) !== false}
                                   onChange={(e) => updateSetting("replaceExistingGems", e.target.checked)} />}
                label={<Typography variant="body2">Replace gems I already have socketed</Typography>}
              />
            </Tooltip>
          </Grid>
        </>
      ))}

      {section("Enchants", "Pick an enchant per slot. Automatic uses the default for your spec.", (
        ENCHANTABLE_SLOTS.map((slot) => {
          const options = getEnchantsForSlot(slot, spec);
          if (options.length === 0) return null;
          return dropdown(SLOT_LABELS[slot] || slot, enchantChoices[slot] || "Automatic",
            (v) => setEnchant(slot, v),
            [{ value: "Automatic", label: "Automatic" }].concat(options.map((e) => ({ value: e.id, label: e.name }))));
        })
      ))}

      {section("Omnium Folio", "Slots 2 and 3 have a single rune each, so only these are selectable.", (
        <>
          {dropdown("Slot 1", value("folioSlot1", "Automatic"), (v) => updateSetting("folioSlot1", v),
            ["Automatic"].concat(getFolioOptions(1)).map((o) => ({ value: o, label: o })))}
          {dropdown("Slot 4", value("folioSlot4", "Automatic"), (v) => updateSetting("folioSlot4", v),
            ["Automatic"].concat(getFolioOptions(4)).map((o) => ({ value: o, label: o })))}
          {dropdown("Slot 5", value("folioSlot5", "Automatic"), (v) => updateSetting("folioSlot5", v),
            ["Automatic"].concat(getFolioOptions(5)).map((o) => ({ value: o, label: o })))}
        </>
      ))}
    </Grid>
  );
}
