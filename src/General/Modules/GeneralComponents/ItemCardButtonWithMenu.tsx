import React, { MouseEvent, useState } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import { useTranslation } from "react-i18next";
import SettingsIcon from "@mui/icons-material/Settings";
import { CONSTANTS } from "General/Engine/CONSTANTS";
import { getItemEffectOptions, getItemProp, hasUnallocatedStats, craftedStatLabel,
         CRAFTED_STAT_CHOICES, CRAFTED_STAT_CHOICES_RANDOM } from "General/Engine/ItemUtilities";
import CatalyzedFromIndicator from "./CatalyzedFromIndicator";

interface MenuItemType {
  id: number;
  ilvlMinimum: number;
  label: string;
  effectName?: string;
  type: string;
}

interface ItemCardButtonWithMenuProps {
  key: number;
  deleteActive: boolean;
  deleteItem: () => void;
  canBeCatalyzed: boolean;
  catalyseItemCard: () => void;
  itemLevel: number;
  upgradeItem: (item: any, ilvlMinimum: number, socketFlag: boolean, vaultFlag: boolean) => void;
  embellishItem: (item: any, embellishmentName: string) => void;
  setCustomItemOptions: (item: any, selectedOption: number[]) => void;
  recraftItem?: (item: any, missives: string) => void;
  item: any;
  gameType?: gameTypes;
}

const getMenuItems = (item: any): MenuItemType[] => {
  const itemLevel = item.level;
  let items: MenuItemType[] = []; 
  
  // Create a shallow copy so we don't mutate the global CONSTANTS array
  const fullItemLevels = [...CONSTANTS.fullItemLevels];
  const itemLevelCap = {...CONSTANTS.itemLevelCaps};
  
  /*if (item.slot.includes("Weapon") || item.slot === "Offhand" || item.slot === "Shield" || item.slot === "Trinket") {
    // Voidcores 
    if (item.upgradeTrack === "Myth") itemLevelCap["Myth"] = 298;
    else if (item.upgradeTrack === "Gilded Crafted") itemLevelCap["Gilded Crafted"] = 295;
    else if (item.upgradeTrack === "Hero") itemLevelCap["Hero"] = 285;
    else if (item.upgradeTrack === "Runed Crafted") itemLevelCap["Runed Crafted"] = 282;
  }*/

  const itemLevelCaps: { [key: string]: number } = itemLevelCap;
  if (item.upgradeTrack !== "" && item.upgradeTrack in itemLevelCaps) {
    fullItemLevels.forEach((level) => {
      if (level > itemLevel && level <= itemLevelCaps[item.upgradeTrack]) {
        items.push({ id: items.length + 1, ilvlMinimum: level, type: "ilvl", label: "Upgrade to " + level });
      }
    });
  }

  return items;
};

/** Whether the item's secondaries were chosen when it was made, and so can be chosen differently. */
const isRecraftable = (item: any): boolean =>
  Boolean((getItemProp(item.id, "crafted") && hasUnallocatedStats(item.id, "Retail")) ||
          getItemProp(item.id, "randomStats", "Retail"));

const getExtraMenuItems = (item: any, gameType: gameTypes): MenuItemType[] => {
  const items: MenuItemType[] = [];

  if (CONSTANTS.socketSlots.includes(item.slot) && gameType === "Retail") {
    // If the item is in a compatible slot, add an option to add or remove a socket.
    // Note that necks are hard coded to have three sockets so we won't offer the option there.
    if (item.id !== 228411 && (!item.socket || (item.socket < 2 && (item.slot === "Neck" || item.slot === "Finger")))) items.push({id: items.length + 1, ilvlMinimum: 0, type: "socket", label: "Add Socket(s)"})
    //else items.push({id: items.length + 1, ilvlMinimum: 0, label: "Remove Socket"})

  }
  if (!item.vaultItem && gameType === "Retail") items.push({id: items.length + 1, type: "vault", ilvlMinimum: 0, label: "Convert to Vault"})

  // Embellishments are offered whether or not the item already carries one: picking one adds a copy of the item
  // with that embellishment rather than changing this one, so swapping is just adding a differently embellished
  // twin. The one it already has is left out, since copying it would produce a duplicate.
  const currentEffect = item.effect ? item.effect.name : "";
  getItemEffectOptions(item.id)
    .filter((option: {effectName: string}) => option.effectName !== currentEffect)
    .forEach((option: {type: string, label: string, effectName: string}) => {
      items.push({
        id: items.length + 1, ilvlMinimum: 0, type: option.type,
        label: (currentEffect ? "Copy with " : "Add ") + option.type + ": " + option.label,
        effectName: option.effectName,
      });
    });

  // The same for the two secondaries a crafted item is made with - a copy carrying a different pair, rather than
  // rebuilding the item from scratch in the add form to try one.
  if (gameType === "Retail" && isRecraftable(item)) {
    const current = craftedStatLabel(item);
    const choices = getItemProp(item.id, "randomStats", gameType) ? CRAFTED_STAT_CHOICES_RANDOM : CRAFTED_STAT_CHOICES;
    choices
      .filter((choice) => choice !== current)
      .forEach((choice) => {
        items.push({ id: items.length + 1, ilvlMinimum: 0, type: "recraft", label: "Copy with: " + choice, effectName: choice });
      });
  }

  /*
  if (item.effect === "" && getItemProp(item.id, "crafted") && (item.slot.includes("Weapon") || item.slot === "Offhand")) {
    items.push({id: items.length + 1, ilvlMinimum: 0, type: "embellishment", label: "Add Embellishment: Darkmoon Sigil: Ascension", effectName: "Darkmoon Sigil: Ascension"})
    items.push({id: items.length + 1, ilvlMinimum: 0, type: "embellishment", label: "Add Embellishment: Darkmoon Sigil: Symbiosis", effectName: "Darkmoon Sigil: Symbiosis"})
  }
  if (item.effect === "" &&  item.slot !== "Finger" && item.slot !== "Neck" && !item.slot.includes("Weapon") && getItemProp(item.id, "crafted")) {
    items.push({id: items.length + 1, ilvlMinimum: 0, type: "embellishment", label: "Add Embellishment: Writhing Armor Banding", effectName: "Writhing Armor Banding"})
    items.push({id: items.length + 1, ilvlMinimum: 0, type: "embellishment", label: "Add Embellishment: Dawnthread Lining", effectName: "Dawnthread Lining"})
    items.push({id: items.length + 1, ilvlMinimum: 0, type: "embellishment", label: "Add Embellishment: Duskthread Lining", effectName: "Duskthread Lining"})
  }*/
  // Add embellishment options.

  if (item.customOptions) {
    item.customOptions.forEach((option: {label: string, id: number}) => {
      items.push({id: items.length + 1, ilvlMinimum: 0, type: "custom", label: option.label, effectName: option.id})
    })
  }
  
  
  return items;

}

const ItemCardButtonWithMenu: React.FC<ItemCardButtonWithMenuProps> = ({ key, deleteActive, deleteItem, canBeCatalyzed, catalyseItemCard, itemLevel, upgradeItem, setCustomItemOptions, embellishItem, recraftItem, item, gameType }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { t } = useTranslation();

  const menuItems = getMenuItems(item);
  const extraMenuItems = getExtraMenuItems(item, gameType);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Function to execute when menu item is clicked
  const handleMenuItemClick = (menuItem: MenuItemType) => {
    upgradeItem(item, menuItem.ilvlMinimum, false, false);
    handleClose();
  };

  const handleExtraMenuItemClick = (menuItem: MenuItemType) => {
    if (menuItem.type === "socket") upgradeItem(item, 0, true, false);
    else if (menuItem.type === "vault") upgradeItem(item, 0, false, true);
    else if (menuItem.type === "embellishment") embellishItem(item, menuItem.effectName);
    else if (menuItem.type === "recraft") { if (recraftItem) recraftItem(item, menuItem.effectName as unknown as string); }
    else if (menuItem.type === "custom") setCustomItemOptions(item, menuItem.effectName);
    handleClose();

  }

  const handlecatalyseItemCard = () => {
    catalyseItemCard();
    handleClose();
  };

  const handledeleteItem = () => {
    deleteItem();
    handleClose();
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <CatalyzedFromIndicator catalyzedID={item?.catalyzedID} gameType={gameType} />
      <IconButton sx={{ padding: 0 }} color="primary" onClick={handleClick} aria-label={"buttonMenu" + key} size="small">
        <SettingsIcon style={{ fontSize: "18px" }} fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              backgroundColor: "#2b2b2b",
              border: "1px solid #DAA520",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
              color: "#f1f1f1",
            },
          },
        }}
        MenuListProps={{
          sx: {
            padding: 0,
            "& .MuiMenuItem-divider": {
              borderBottomColor: "rgba(218, 165, 32, 0.3)",
            },
          },
        }}
      >
        {canBeCatalyzed ? (
          <MenuItem
            sx={{
              fontSize: "12px",
              color: "plum",
              minHeight: 28,
              "&:hover": { backgroundColor: "rgba(218, 165, 32, 0.14)" },
            }}
            onClick={handlecatalyseItemCard}
            divider
          >
            {t("Catalyst")}
          </MenuItem>
        ) : null}
        {menuItems
          .filter((filter) => filter.ilvlMinimum > itemLevel)
          .map((item) => (
            <MenuItem
              sx={{
                color: "plum",
                fontSize: "12px",
                minHeight: 28,
                "&:hover": { backgroundColor: "rgba(218, 165, 32, 0.14)" },
              }}
              key={item.id}
              onClick={() => handleMenuItemClick(item)}
              divider
            >
              {item.label}
            </MenuItem>
        ))}
        {extraMenuItems
          .map((item) => (
            <MenuItem
              sx={{
                fontSize: "12px",
                minHeight: 28,
                "&:hover": { backgroundColor: "rgba(218, 165, 32, 0.14)" },
              }}
              key={item.id}
              onClick={() => handleExtraMenuItemClick(item)}
              divider
            >
              {item.label}
            </MenuItem>
          ))}

        {deleteActive ? (
          <MenuItem
            sx={{
              fontSize: "12px",
              color: "#ff1744",
              minHeight: 28,
              "&:hover": { backgroundColor: "rgba(255, 23, 68, 0.12)" },
            }}
            onClick={handledeleteItem}
          >
            {t("Delete")}
          </MenuItem>
        ) : null}
      </Menu>
    </div>
  );
};

export default ItemCardButtonWithMenu;
