import React from "react";
import { Grid, Paper, Typography, Divider, MenuItem, TextField, FormControlLabel, Checkbox, Tooltip, Chip, Switch } from "@mui/material";
import { gemDB } from "Databases/GemDB";
import { getEnchantsForSlot, ENCHANTABLE_SLOTS } from "Databases/EnchantDB";
import { getFolioOptions } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";

/* ---------------------------------------------------------------------------------------------- */
/*        Gem, enchant and Omnium Folio selection. Sits with item selection, not in settings.      */
/* ---------------------------------------------------------------------------------------------- */
// These are choices about the set being built, the same as picking which items to include, so they belong next to
// item selection rather than in the global settings panel. Each Top Gear run uses exactly one configuration.
//
// The whole section is behind a Detailed toggle. Off - which is the default - Top Gear looks and behaves exactly
// as it did before any of this existed, and the engine ignores these settings entirely (see getGearOption), so a
// profile that was configured once can't keep steering later runs from a panel the player has collapsed.

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
  const selectedGems: number[] = value("selectedGems", []) || [];
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

  const detailed = value("detailedGearOptions", false) === true;

  const toggleBar = (
    <Grid item xs={12}>
      <Paper elevation={0} style={{ backgroundColor: "rgba(28,28,28,0.5)", padding: "2px 10px" }}>
        <Tooltip placement="right" title={
          <Typography variant="caption">
            Off, Top Gear picks your gems, enchants and Folio runes for you. On, you can pin them yourself and
            select several per slot to have every combination ranked.
          </Typography>
        }>
          <FormControlLabel
            control={<Switch size="small" checked={detailed}
                             onChange={(e) => updateSetting("detailedGearOptions", e.target.checked)} />}
            label={<Typography variant="body2" color="primary">Detailed: choose gems, enchants and Folio runes</Typography>}
          />
        </Tooltip>
      </Paper>
    </Grid>
  );

  if (!detailed) return <Grid container spacing={1} style={{ marginTop: 4 }}>{toggleBar}</Grid>;

  return (
    <Grid container spacing={1} style={{ marginTop: 4 }}>
      {toggleBar}
      {section("Gems", "Pick the gems you want socketed. Select several and each combination is ranked as its own set. Automatic uses the default for your spec.", (
        <>
          {dropdown("Meta Gem", value("selectedMetaGem", 0), (v) => updateSetting("selectedMetaGem", Number(v)),
            [{ value: 0, label: "Automatic" }].concat(dedupe(metas).map((g) => ({ value: g.id, label: gemLabel(g) }))))}
          <Grid item xs={12} sm={8} md={6}>
            <TextField
              select fullWidth size="small" variant="outlined" label="Gems"
              SelectProps={{
                multiple: true,
                renderValue: (selected: any) =>
                  (selected as number[]).length === 0
                    ? "Automatic"
                    : (selected as number[]).map((id) => {
                        const g = gemDB.find((x) => x.id === id);
                        return g ? g.name.replace("Flawless ", "") : id;
                      }).join(", "),
              }}
              value={selectedGems}
              onChange={(e) => updateSetting("selectedGems", (e.target.value as unknown as number[]).filter((v) => v))}
              helperText="Pick more than one and Top Gear ranks each combination as its own set."
            >
              {dedupe(stat).map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  <Checkbox size="small" checked={selectedGems.indexOf(g.id) > -1} />
                  {gemLabel(g)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" style={{ color: "#f0c674", display: "block", marginBottom: 4 }}>
              Selecting several gems and enchants multiplies the sets evaluated. The expansion is capped, so past a
              point extra selections are ignored rather than making the run crawl.
            </Typography>
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

      {section("Enchants", "Pick one or more per slot. Selecting several ranks each combination as its own set.", (
        ENCHANTABLE_SLOTS.map((slot) => {
          const options = getEnchantsForSlot(slot, spec);
          if (options.length === 0) return null;
          const chosen: string[] = Array.isArray(enchantChoices[slot]) ? enchantChoices[slot] : (enchantChoices[slot] ? [enchantChoices[slot]] : []);
          const toggle = (id: string) =>
            setEnchant(slot, chosen.indexOf(id) > -1 ? chosen.filter((c) => c !== id) : chosen.concat([id]));

          return (
            <Grid item xs={12} sm={6} md={4} key={slot}>
              <Paper elevation={0} style={{ backgroundColor: "rgba(20,20,20,0.6)", padding: 8, height: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="subtitle2" style={{ color: "goldenrod" }}>{SLOT_LABELS[slot] || slot}</Typography>
                  <div>
                    {/* Default clears the selection and lets the engine pick; None turns the slot off entirely. */}
                    <Chip size="small" label="DEFAULT" onClick={() => setEnchant(slot, [])}
                          variant={chosen.length === 0 ? "filled" : "outlined"} style={{ marginRight: 4 }} />
                    <Chip size="small" label="NONE" onClick={() => setEnchant(slot, ["None"])}
                          variant={chosen.indexOf("None") > -1 ? "filled" : "outlined"} />
                  </div>
                </div>
                <Typography variant="caption" style={{ color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>
                  {chosen.length === 0 ? "Automatic" : chosen.length + " selected"}
                </Typography>
                <Divider style={{ borderColor: "rgba(255,255,255,0.1)", marginBottom: 4 }} />
                {options.map((e) => (
                  <div key={e.id} onClick={() => toggle(e.id)}
                       style={{
                         display: "flex", alignItems: "center", cursor: "pointer", padding: "1px 2px", borderRadius: 3,
                         border: chosen.indexOf(e.id) > -1 ? "1px solid rgba(255,200,80,0.55)" : "1px solid transparent",
                       }}>
                    <Checkbox size="small" checked={chosen.indexOf(e.id) > -1} style={{ padding: 3 }} />
                    <Typography variant="caption" style={{ color: chosen.indexOf(e.id) > -1 ? "goldenrod" : "rgba(255,255,255,0.8)" }}>
                      {e.name}
                    </Typography>
                  </div>
                ))}
              </Paper>
            </Grid>
          );
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
