
import makeStyles from "@mui/styles/makeStyles";
import { Accordion, AccordionDetails, AccordionSummary, Typography, Switch, FormControlLabel, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import SettingsIcon from "@mui/icons-material/Settings";
import SettingsComponent from "./SettingsComponent";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "Redux/Reducers/RootReducer";
import { togglePlayerSettings } from "Redux/Actions";
import { isOptimizeAllGear } from "General/Engine/ItemUtilities";

const useStyles = makeStyles((theme: any) => ({
  root: {
    width: "100%",
  },
  heading: {
    fontSize: theme.typography.pxToRem(15),
    marginRight: 4,
  },
  details: {
    alignItems: "center",
    padding: 0,
    marginTop: 8,
    marginBottom: 8,
  },
  column: {
    // flexBasis: "33.33%",
    display: "inline-flex",
  },
}));

export default function Settings(props : any) {
  const classes = useStyles();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  /* --------------------------------- Determine current GameType --------------------------------- */
  const gameType = useSelector((state: RootState) => state.gameType);
  const playerSettings = useSelector((state: RootState) => state.playerSettings);

  /* ------------------------------- Burning Crusade Settings Shown ------------------------------- */

  /* ---------------------------------------------------------------------------------------------- */
  /*                                       Optimize Everything                                      */
  /* ---------------------------------------------------------------------------------------------- */
  // It rides on the settings header rather than inside the panel: it changes what a whole run does, and buried in
  // a collapsed accordion nobody would find it - or notice it was still on. `optimizeToggle` keeps it to the pages
  // where it means something, since this panel is shared with Quick Compare, Trinkets and the rest.
  const optimizeAll = isOptimizeAllGear(playerSettings);
  const setOptimizeAll = (on: boolean) =>
    dispatch(togglePlayerSettings({ ...playerSettings, optimizeAllGearOptions: { ...playerSettings.optimizeAllGearOptions, value: on } }));

  const optimizeSwitch = (
    <Tooltip placement="top" title={<Typography variant="caption">{t("Settings.Retail.optimizeAllGearOptions.tooltip")}</Typography>}>
      <FormControlLabel
        style={{ marginLeft: "auto", marginRight: 8 }}
        // The switch sits inside the accordion header, so its clicks mustn't also expand the panel beneath it.
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        control={<Switch size="small" checked={optimizeAll} onChange={(e) => setOptimizeAll(e.target.checked)} />}
        label={<Typography variant="body2" color={optimizeAll ? "primary" : "textSecondary"}>
          {t("Settings.Retail.optimizeAllGearOptions.title")}
        </Typography>}
      />
    </Tooltip>
  );

  return (
    <div className={classes.root}>
      <Accordion defaultExpanded={false} disabled={false} elevation={0}>
        <AccordionSummary style={{ padding: 0 }} expandIcon={<ExpandMoreIcon />} aria-controls="panel1c-content" id="panel1c-header">
          <div className={classes.column}>
            <SettingsIcon style={{ marginRight: 4, width: 22, height: 22 }} />
            <Typography className={classes.heading}>{t("Settings.SettingsTitle")}</Typography>
          </div>
          {props.optimizeToggle && gameType === "Retail" ? optimizeSwitch : null}
        </AccordionSummary>
        <AccordionDetails className={classes.details}>
          {/* ---- If gameType = "Retail" show Retail Settings, otherwise show Burning Crusade Settings ---- */}
            <SettingsComponent
              player={props.player}
              contentType={props.contentType}
              singleUpdate={props.singleUpdate}
            />


        </AccordionDetails>
      </Accordion>
    </div>
  );
}
