export const MODULE_ID = "fameosity";

export const CONFIG_REMEMBER = {
  displayDuration: 3500,
  fadeInDuration: 600,
  fadeOutDuration: 400,
  positionTop: "80px",
  positionLeft: "120px",
  sound: null,
  soundVolume: 0.5
};

export const DEFAULT_TIER_KEYS = [
  { nameKey: "tiers.hatred", minValue: -100, color: "#a82020" },
  { nameKey: "tiers.hostility", minValue: -60, color: "#c45a2a" },
  { nameKey: "tiers.distrust", minValue: -30, color: "#b89a3a" },
  { nameKey: "tiers.neutral", minValue: -10, color: "#6a6a6a" },
  { nameKey: "tiers.sympathy", minValue: 10, color: "#88be8b" },
  { nameKey: "tiers.trust", minValue: 30, color: "#50cd67" },
  { nameKey: "tiers.friendship", minValue: 60, color: "#00961b" },
  { nameKey: "tiers.alliance", minValue: 80, color: "#3a6a9a" }
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  displayMode: "show",
  min: -100,
  max: 100
};

export const DEFAULT_DATA = {
  actors: {},
  factions: [],
  trackedActors: [],
  individualRelations: {},
  factionRelations: {},
  hiddenItems: {},
  autoFlags: {},
  hybridFlags: {},
  actorNames: {},
  personalVisibility: {},
  locations: [],
  entityInfo: {}
};