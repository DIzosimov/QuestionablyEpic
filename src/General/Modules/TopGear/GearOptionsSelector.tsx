import React from "react";
import { Grid, Paper, Typography, Divider, MenuItem, TextField, FormControlLabel, Checkbox, Tooltip, Chip, Switch } from "@mui/material";
import { getCurrentStatGems, getCurrentMetaGems } from "Databases/GemDB";
import { getEnchantsForSlot, ENCHANTABLE_SLOTS } from "Databases/EnchantDB";
import { getFolioOptions, getFolioChoices, countFolioCombinations, FOLIO_SLOT_SETTINGS, FOLIO_STAT_SLOT } from "Retail/Engine/EffectFormulas/Generic/PatchEffectItems/OmniumFolioData";
import { countGemLoadouts, countEnchantCombinations, getGemSearchSpace, getEnchantSearchSpace, normaliseEnchantChoices,
         countConsumableCombinations, CONSUMABLE_OPTIONS } from "./Engine/TopGearEngine";

/* ---------------------------------------------------------------------------------------------- */
/*        Gem, enchant and Omnium Folio selection. Sits with item selection, not in settings.      */
/* ---------------------------------------------------------------------------------------------- */
// These are choices about the set being built, the same as picking which items to include, so they belong next to
// item selection rather than in the global settings panel.
//
// Everything here is behind a Detailed toggle, off by default, and the engine ignores these settings while it's
// off (see getGearOption) - a profile configured once can't keep steering runs from a panel that's collapsed.
//
// Pinning several options per slot expands a run into one variant per combination. The total is multiplicative, so
// it's capped, and the cap is a setting: "No limit" is the full combinatorics you want when hunting the genuinely
// optimal setup. That's easy to make unrunnable by accident, hence the projection in the Search depth section.

// Rings are two independent choices, so they're labelled as two.
const SLOT_LABELS: { [key: string]: string } = {
  Head: "Head", Shoulder: "Shoulder", Chest: "Chest", Legs: "Legs",
  Feet: "Feet", Finger1: "Ring 1", Finger2: "Ring 2", CombinedWeapon: "Weapon",
};

// Slots that appear twice in a set, so both of their sockets count toward the total.
const DOUBLE_SLOTS = ["Finger", "Trinket"];

const VARIANT_LIMITS = [24, 60, 150, 500, 2000, 0].map((limit) => ({
  value: limit,
  label: limit === 0 ? "No limit - every combination" : `${limit}${limit === 24 ? " (default)" : ""}`,
}));

const gemLabel = (gem: any) => {
  const stats = Object.entries(gem.stats || {})
    .filter(([stat]) => stat !== "manaPerc")
    .map(([stat, amount]) => `${amount} ${stat}`)
    .join(" / ");
  return `${gem.name}${stats ? " (" + stats + ")" : ""}`;
};

const STAT_GEM_OPTIONS = getCurrentStatGems()
  .map((gem) => ({ value: gem.id, label: gemLabel(gem), chip: gem.name.replace("Flawless ", "") }));
const META_GEM_OPTIONS = [{ value: 0, label: "Automatic" }]
  .concat(getCurrentMetaGems().map((gem) => ({ value: gem.id, label: gemLabel(gem) })));

/**
 * Upper bound on the sockets a built set can have, from the items the player has selected.
 *
 * The engine works this out per set; here we can only take the best-socketed item in each slot. It feeds the
 * projection below and nothing else - the run itself never uses it.
 */
const estimateSockets = (selectedItems: any[]) => {
  const socketsBySlot: { [slot: string]: number[] } = {};
  (selectedItems || []).forEach((item: any) => {
    if (item && item.socket) (socketsBySlot[item.slot] = socketsBySlot[item.slot] || []).push(item.socket);
  });

  return Object.entries(socketsBySlot).reduce((total, [slot, sockets]) => {
    const best = sockets.sort((a, b) => b - a).slice(0, DOUBLE_SLOTS.includes(slot) ? 2 : 1);
    return total + best.reduce((sum, n) => sum + n, 0);
  }, 0);
};

type SelectOption = { value: any; label: string; chip?: string };

export default function GearOptionsSelector(props: any) {
  const { playerSettings, updateSetting, spec, selectedItems } = props;

  const settingValue = (key: string, fallback: any) =>
    playerSettings && playerSettings[key] !== undefined ? playerSettings[key].value : fallback;

  const enchantChoices = normaliseEnchantChoices(settingValue("enchantChoices", {}));
  const pinnedGems: number[] = settingValue("selectedGems", []) || [];
  const setEnchant = (slot: string, ids: string[]) =>
    updateSetting("enchantChoices", { ...enchantChoices, [slot]: ids });

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

  /**
   * One dropdown. `multiple` makes it a checkbox multi-select reading "Automatic" when empty, which is how gems
   * and Folio runes are pinned; picking several there expands the run into one variant per combination.
   */
  const select = (label: string, chosen: any, onChange: (v: any) => void, options: SelectOption[],
                  opts: { multiple?: boolean; helper?: string; grid?: any } = {}) => {
    const chipFor = (value: any) => {
      const option = options.find((o) => o.value === value);
      return option ? (option.chip || option.label) : value;
    };

    return (
      <Grid item {...(opts.grid || { xs: 12, sm: 6, md: 4, lg: 3 })} key={label}>
        <TextField
          select fullWidth size="small" variant="outlined" label={label} value={chosen} helperText={opts.helper}
          style={{ minWidth: 150 }}
          SelectProps={opts.multiple ? {
            multiple: true,
            renderValue: (selected: any) => (selected.length === 0 ? "Automatic" : selected.map(chipFor).join(", ")),
          } : undefined}
          onChange={(e) => onChange(opts.multiple ? (e.target.value as unknown as any[]).filter((v) => v) : e.target.value)}
        >
          {options.map((option) => (
            <MenuItem key={String(option.value)} value={option.value}>
              {opts.multiple ? <Checkbox size="small" checked={chosen.indexOf(option.value) > -1} /> : null}
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
    );
  };

  const detailed = settingValue("detailedGearOptions", false) === true;

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

  // Optimize Everything lives in the settings panel and supersedes the pins below, so the section has to open for
  // it too - otherwise the search depth it desperately needs would be unreachable.
  const optimizeAll = settingValue("optimizeAllGearOptions", false) === true || settingValue("optimizeAllGearOptions", false) === "true";
  if (!detailed && !optimizeAll) return <Grid container spacing={1} style={{ marginTop: 4 }}>{toggleBar}</Grid>;

  const optimizeAllBanner = optimizeAll ? (
    <Grid item xs={12}>
      <Paper elevation={0} style={{ backgroundColor: "rgba(60,45,20,0.6)", padding: "6px 10px" }}>
        <Typography variant="body2" style={{ color: "#f0c674" }}>
          Optimize Everything is on, so Top Gear searches every gem, enchant and Folio rune itself. The picks below
          are ignored while it's on - switch it off above to go back to choosing them. Check the search depth.
        </Typography>
      </Paper>
    </Grid>
  ) : null;

  /* ------------------------------- Search depth and its projection ------------------------------ */
  // Built from the same search spaces the engine uses, so the number shown is the number that will actually run.
  const variantLimit = Number(settingValue("gearVariantLimit", 24));
  const sockets = estimateSockets(selectedItems);
  const searchedGems = getGemSearchSpace(playerSettings);
  const gemLoadoutCount = searchedGems.length > 1 ? countGemLoadouts(searchedGems.length, sockets) : 1;
  const enchantComboCount = Math.max(1, countEnchantCombinations(getEnchantSearchSpace(playerSettings, spec)));
  const folioComboCount = Math.max(1, countFolioCombinations(playerSettings));
  const consumableComboCount = Math.max(1, countConsumableCombinations(playerSettings));
  const projected = gemLoadoutCount * enchantComboCount * folioComboCount * consumableComboCount;
  const evaluated = variantLimit === 0 ? projected : Math.min(projected, variantLimit);
  // Past a few thousand every gear set is re-evaluated that many times over, which is where runs stop being slow
  // and start being unusable. Worth saying out loud before the player presses the button.
  const heavy = evaluated > 2000;

  const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

  const searchDepth = (
    <Grid item xs={12}>
      <Paper elevation={0} style={{ backgroundColor: "rgba(28,28,28,0.5)", padding: 10 }}>
        <Typography variant="subtitle1" color="primary">Search depth</Typography>
        <Typography variant="caption" style={{ color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 6 }}>
          How many combinations a run is allowed to evaluate. No limit is a full, exhaustive search.
        </Typography>
        <Divider style={{ borderColor: "rgba(255,255,255,0.12)", marginBottom: 10 }} />
        <Grid container spacing={1} alignItems="center">
          {select("Combinations evaluated", variantLimit, (v) => updateSetting("gearVariantLimit", Number(v)), VARIANT_LIMITS)}
          <Grid item xs={12} md={8}>
            <Typography variant="caption" style={{ color: "rgba(255,255,255,0.75)", display: "block" }}>
              {searchedGems.length > 1
                ? `${searchedGems.length} gems across ${sockets || "?"} sockets = ${plural(gemLoadoutCount, "loadout")}`
                : "1 gem loadout"}
              {` x ${plural(enchantComboCount, "enchant combination")}`}
              {` x ${plural(folioComboCount, "Folio combination")}`}
              {` x ${plural(consumableComboCount, "consumable combination")} = `}
              <strong>{projected.toLocaleString()}</strong> variants, each evaluated against every gear set.
            </Typography>
            <Typography variant="caption" style={{ color: projected > evaluated ? "#f0c674" : "#8fbf6f", display: "block" }}>
              {projected > evaluated
                ? `Only ${evaluated.toLocaleString()} of them will run - raise the limit to search all ${projected.toLocaleString()}.`
                : `All ${projected.toLocaleString()} will run.`}
            </Typography>
            {heavy ? (
              <Typography variant="caption" style={{ color: "#e06c6c", display: "block" }}>
                That is a very large search and can take a long time, or hang the page. Consider narrowing the item
                list first, then widening the search on the shortlist.
              </Typography>
            ) : null}
          </Grid>
        </Grid>
      </Paper>
    </Grid>
  );

  return (
    <Grid container spacing={1} style={{ marginTop: 4 }}>
      {toggleBar}
      {optimizeAllBanner}
      {searchDepth}
      {!detailed ? null : section("Gems", "Pick the gems you want socketed. Select several and each combination is ranked as its own set. Automatic uses the default for your spec.", (
        <>
          {select("Meta Gem", settingValue("selectedMetaGem", 0), (v) => updateSetting("selectedMetaGem", Number(v)), META_GEM_OPTIONS)}
          {select("Gems", pinnedGems, (v) => updateSetting("selectedGems", v), STAT_GEM_OPTIONS,
                  { multiple: true, grid: { xs: 12, sm: 8, md: 6 },
                    helper: "Pick more than one and Top Gear ranks each combination as its own set." })}
          <Grid item xs={12}>
            <Tooltip placement="right" title={
              <Typography variant="caption">
                Unticked, gems you already have socketed are kept and only empty sockets get filled — so the result
                is what you'd get without re-gemming. Ticked, every socket uses the gem above.
              </Typography>
            }>
              <FormControlLabel
                control={<Checkbox size="small" checked={settingValue("replaceExistingGems", true) !== false}
                                   onChange={(e) => updateSetting("replaceExistingGems", e.target.checked)} />}
                label={<Typography variant="body2">Replace gems I already have socketed</Typography>}
              />
            </Tooltip>
          </Grid>
        </>
      ))}

      {!detailed ? null : section("Enchants", "Pick one or more per slot. Selecting several ranks each combination as its own set.", (
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
                {options.map((enchant) => {
                  const picked = chosen.indexOf(enchant.id) > -1;
                  return (
                    <div key={enchant.id} onClick={() => toggle(enchant.id)}
                         style={{
                           display: "flex", alignItems: "center", cursor: "pointer", padding: "1px 2px", borderRadius: 3,
                           border: picked ? "1px solid rgba(255,200,80,0.55)" : "1px solid transparent",
                         }}>
                      <Checkbox size="small" checked={picked} style={{ padding: 3 }} />
                      <Typography variant="caption" style={{ color: picked ? "goldenrod" : "rgba(255,255,255,0.8)" }}>
                        {enchant.name}
                      </Typography>
                    </div>
                  );
                })}
              </Paper>
            </Grid>
          );
        })
      ))}

      {!detailed ? null : section("Consumables", "Pick one or more and each is ranked as its own set. Leave empty to use the single choice in Settings.", (
        <>
          {select("Flask", settingValue("flaskChoices", []) || [], (v) => updateSetting("flaskChoices", v),
                  CONSUMABLE_OPTIONS.flask.map((flask) => ({ value: flask, label: flask })),
                  { multiple: true, grid: { xs: 12, sm: 6, md: 4 }, helper: "Every flask grants the same amount, so only the stat differs." })}
          {select("Food", settingValue("foodChoices", []) || [], (v) => updateSetting("foodChoices", v),
                  CONSUMABLE_OPTIONS.food.map((food) => ({ value: food, label: food })),
                  { multiple: true, grid: { xs: 12, sm: 6, md: 4 }, helper: "Only Intellect Food is modelled so far." })}
        </>
      ))}

      {!detailed ? null : section("Omnium Folio", "The secondary stat rune is the only one worth choosing - the rest are picked for you. Select several and each is ranked as its own set.", (
        select("Secondary Stat Rune", getFolioChoices(playerSettings, FOLIO_STAT_SLOT),
               (v) => updateSetting(FOLIO_SLOT_SETTINGS[FOLIO_STAT_SLOT], v),
               getFolioOptions(FOLIO_STAT_SLOT).map((rune) => ({ value: rune, label: rune })),
               { multiple: true, grid: { xs: 12, sm: 6, md: 4 }, helper: "Leave empty for Automatic." })
      ))}
    </Grid>
  );
}
