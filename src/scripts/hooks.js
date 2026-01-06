import { MODULE_ID, DEFAULT_SETTINGS, DEFAULT_DATA } from './constants.js';
import { getSettings, invalidateCache, getDefaultTiers, flushData, getTiers, getTier, handleSocketMessage } from './data.js';
import { ReputationEvents } from './events.js';
import {
  getActorRep, setActorRep, getDisplayName, getCustomName, setCustomName,
  getTracked, setTracked, isActorAuto, toggleActorAuto, calcAutoActorRep,
  getEffectiveActorRep, getPCs, ensureImportant, addTracked, removeTracked,
  getActorMode, setActorMode, isActorHybrid, toggleActorHybrid, calcHybridActorRep
} from './core/actors.js';
import {
  getIndRel, setIndRel, adjustIndRels,
  getFactionRel, setFactionRel,
  getPersonalVis, setPersonalVis, togglePersonalVis
} from './core/relations.js';
import {
  isHidden, toggleHidden, setHidden, filterVisible, getHiddenItems
} from './core/visibility.js';
import {
  getFactions, getFaction, setFactions, addFaction, updateFaction, deleteFaction,
  addFactionMember, removeFactionMember,
  getFactionRep, setFactionRep, changeFactionRep,
  getFactionMode, setFactionMode, calcAutoFactionRep, calcHybridFactionRep,
  getFactionRank, setMemberRank, addFactionRank, updateFactionRank, removeFactionRank
} from './core/factions.js';

import {
  getLocations, getLocation, setLocations, addLocation, updateLocation, deleteLocation,
  addActorToLocation, removeActorFromLocation,
  addFactionToLocation, removeFactionFromLocation,
  getLocationWanted, setLocationWanted, removeWanted, toggleWantedVisibility
} from './core/locations.js';
import {
  showNotification, changeReputation, changeFactionRepWithNotify, showRelationChangeNotification
} from './core/notifications.js';
import { confirmDelete } from './core/index.js';
import { ReputationSettingsApp } from './apps/ReputationSettingsApp.js';
import { ReputationViewerApp } from './apps/ReputationViewerApp.js';
import { RelationsViewerApp } from './apps/RelationsViewerApp.js';
import { InfoPopupApp } from './apps/InfoPopupApp.js';
import { PickerApp } from './apps/PickerApp.js';

export function openReputationViewer(actor) {
  if (!getSettings().enabled) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.reputation.disabled`));
    return;
  }
  ReputationViewerApp.open(actor);
}

export function openRelationsViewer() {
  new RelationsViewerApp().render(true);
}

export function openReputationSettings() {
  new ReputationSettingsApp().render(true);
}

function createModuleAPI() {
  return {
    showNotification,
    changeReputation,
    changeFactionRepWithNotify,
    confirmDelete,
    
    getActorRep,
    setActorRep,
    getDisplayName,
    getCustomName,
    setCustomName,
    getTracked,
    setTracked,
    addTracked,
    removeTracked,
    isActorAuto,
    toggleActorAuto,
    calcAutoActorRep,
    getEffectiveActorRep,
    getPCs,
    ensureImportant,
    
    getIndRel,
    setIndRel,
    adjustIndRels,
    getFactionRel,
    setFactionRel,
    getPersonalVis,
    setPersonalVis,
    togglePersonalVis,
    
    isHidden,
    toggleHidden,
    setHidden,
    filterVisible,
    getHiddenItems,
    
    getFactions,
    getFaction,
    setFactions,
    addFaction,
    updateFaction,
    deleteFaction,
    addFactionMember,
    removeFactionMember,
    getFactionRep,
    setFactionRep,
    changeFactionRep,
    getFactionMode,
    setFactionMode,
    calcAutoFactionRep,
    calcHybridFactionRep,
    getFactionRank,
    setMemberRank,
    addFactionRank,
    updateFactionRank,
    removeFactionRank,
    
    getLocations,
    getLocation,
    setLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    addActorToLocation,
    removeActorFromLocation,
    addFactionToLocation,
    removeFactionFromLocation,
    getLocationWanted,
    setLocationWanted,
    removeWanted,
    toggleWantedVisibility,
    
    getTiers,
    getTier,
    invalidateCache,
    flushData,
    
    ReputationEvents,
    ReputationViewerApp,
    RelationsViewerApp,
    ReputationSettingsApp,
    InfoPopupApp,
    PickerApp,
    
    openReputationViewer,
    openRelationsViewer,
    openReputationSettings,
    
    getReputation: getActorRep,
    isAuto: isActorAuto,
    toggleAuto: toggleActorAuto,

    getActorMode,
    setActorMode,
    isActorHybrid,
    toggleActorHybrid,
    calcHybridActorRep,
    showRelationChangeNotification,
  };
}

export function registerSettings() {
  game.settings.register(MODULE_ID, "reputationSettings", {
    scope: "world",
    config: false,
    type: Object,
    default: { ...DEFAULT_SETTINGS }
  });

  game.settings.register(MODULE_ID, "reputationData", {
    scope: "world",
    config: false,
    type: Object,
    default: { ...DEFAULT_DATA }
  });

  game.settings.register(MODULE_ID, "relationTiers", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "relationsViewerPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu(MODULE_ID, "reputationSettingsMenu", {
    name: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.name`),
    label: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.label`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.hint`),
    icon: "fa-solid fa-star",
    type: ReputationSettingsApp,
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "increaseReputation", {
    name: game.i18n.localize(`${MODULE_ID}.keybindings.increase.name`),
    hint: game.i18n.localize(`${MODULE_ID}.keybindings.increase.hint`),
    editable: [{ key: "Digit1", modifiers: ["Shift"] }],
    onDown: () => {
      changeReputation(1);
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "decreaseReputation", {
    name: game.i18n.localize(`${MODULE_ID}.keybindings.decrease.name`),
    hint: game.i18n.localize(`${MODULE_ID}.keybindings.decrease.hint`),
    editable: [{ key: "Digit2", modifiers: ["Shift"] }],
    onDown: () => {
      changeReputation(-1);
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

export function registerHooks() {
  Hooks.once('init', () => {
    registerSettings();
    
    // Register Handlebars helpers
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('gte', (a, b) => a >= b);
    Handlebars.registerHelper('lt', (a, b) => a < b);
    Handlebars.registerHelper('lte', (a, b) => a <= b);
    Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('not', a => !a);
    Handlebars.registerHelper('concat', (...args) => args.slice(0, -1).join(''));
    
    Handlebars.registerHelper('percentage', (value, min, max) => {
      return ((value - min) / (max - min)) * 100;
    });
    
    Handlebars.registerHelper('fillLeft', (value, min, max) => {
      const percentage = ((value - min) / (max - min)) * 100;
      const midPercentage = ((0 - min) / (max - min)) * 100;
      return Math.min(midPercentage, percentage);
    });
    
    Handlebars.registerHelper('fillWidth', (value, min, max) => {
      const percentage = ((value - min) / (max - min)) * 100;
      const midPercentage = ((0 - min) / (max - min)) * 100;
      return Math.abs(percentage - midPercentage);
    });
    
    Handlebars.registerHelper('filterMemberFactions', (factions, actorId) => {
      if (!factions || !actorId) return [];
      return factions.filter(f => f.members && f.members.some(m => m.id === actorId));
    });
    
    Handlebars.registerHelper('findMemberRank', (faction, actorId) => {
      if (!faction || !faction.members) return null;
      const member = faction.members.find(m => m.id === actorId);
      return member?.rank || null;
    });
    
    Handlebars.registerHelper('tierBadge', (tier, small) => {
      if (!tier) return '';
      const cls = small === true ? 'fame-tier-badge small' : 'fame-tier-badge';
      const len = tier.name ? tier.name.length : 0;
      return new Handlebars.SafeString(
        `<span class="${cls}" style="--text-length:${len};background:${tier.color}">${Handlebars.Utils.escapeExpression(tier.name)}</span>`
      );
    });
    
    Handlebars.registerHelper('wantedStars', (stars, options) => {
      if (!stars || !Array.isArray(stars)) return '';
      const hash = options.hash || {};
      const editable = hash.editable === true;
      const action = hash.action || '';
      const entityType = hash.entityType || '';
      const entityId = hash.entityId || '';
      const pcId = hash.pcId || '';
      
      let html = '<div class="fame-wanted-stars">';
      stars.forEach((star, i) => {
        if (editable) {
          html += `<i class="fa-solid fa-star fame-wanted-star-btn ${star.active ? 'active' : ''}" 
                      data-action="${action}" data-${entityType}="${entityId}" data-pc="${pcId}" data-value="${star.value}"></i>`;
        } else {
          html += `<i class="fa-solid fa-star fame-wanted-star ${star.active ? 'active' : ''}"></i>`;
        }
      });
      html += '</div>';
      return new Handlebars.SafeString(html);
    });

    loadTemplates([
      `modules/${MODULE_ID}/templates/relations/main.hbs`
    ]);

    const moduleApi = createModuleAPI();
    game.modules.get(MODULE_ID).api = {
      ...(game.modules.get(MODULE_ID).api || {}),
      ...moduleApi
    };
  });

  Hooks.once('ready', () => {
    const savedTiers = game.settings.get(MODULE_ID, "relationTiers");
    if (!savedTiers || savedTiers.length === 0 || savedTiers.some(t => t.name?.startsWith('FAMEOCITY.'))) {
      game.settings.set(MODULE_ID, "relationTiers", getDefaultTiers());
    }

    game.socket.on(`module.${MODULE_ID}`, data => {
      handleSocketMessage(data);
    });

    window.SweetyUtilities = {
      ...(window.SweetyUtilities || {}),
      ...createModuleAPI()
    };
  });

  Hooks.on('updateSetting', setting => {
    if (setting.key?.startsWith(`${MODULE_ID}.`)) {
      invalidateCache();
    }
  });

  Hooks.on('getSceneControlButtons', controls => {
    if (!getSettings().enabled) return;

    const tokenControls = controls.tokens;
    if (!tokenControls?.tools) return;

    tokenControls.tools["sweety-relations"] = {
      name: "sweety-relations",
      title: game.i18n.localize(`${MODULE_ID}.relations.viewer-title`),
      icon: "fa-solid fa-users",
      visible: true,
      onClick: openRelationsViewer,
      button: true
    };
  });
}