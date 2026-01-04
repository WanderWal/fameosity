import { MODULE_ID, DEFAULT_DATA, DEFAULT_SETTINGS, DEFAULT_TIER_KEYS } from './constants.js';
import { ReputationEvents } from './events.js';

let _dataCache = null;
let _settingsCache = null;
let _tiersCache = null;
let _saveTimeout = null;
let _pendingResolvers = [];
let _isSaving = false;
const SAVE_DELAY = 300;

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getData() {
  if (!_dataCache) {
    _dataCache = foundry.utils.deepClone(game.settings.get(MODULE_ID, "reputationData")) || { ...DEFAULT_DATA };
  }
  return _dataCache;
}

export async function setData(data) {
  _dataCache = data;
  
  return new Promise(resolve => {
    _pendingResolvers.push(resolve);
    
    if (_saveTimeout) clearTimeout(_saveTimeout);
    
    _saveTimeout = setTimeout(async () => {
      if (_isSaving) return;
      
      _isSaving = true;
      _saveTimeout = null;
      
      const resolvers = [..._pendingResolvers];
      _pendingResolvers = [];
      
      try {
        await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
        ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
      } catch (e) {
        console.error(`${MODULE_ID} | Save error:`, e);
        ui.notifications.error(game.i18n.localize(`${MODULE_ID}.errors.saveFailed`));
      } finally {
        _isSaving = false;
        resolvers.forEach(r => r());
      }
    }, SAVE_DELAY);
  });
}

export async function flushData() {
  if (_saveTimeout && _dataCache) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
    
    const resolvers = [..._pendingResolvers];
    _pendingResolvers = [];
    
    try {
      await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    } catch (e) {
      console.error(`${MODULE_ID} | Flush error:`, e);
    }
    
    resolvers.forEach(r => r());
  }
}

export function getSettings() {
  if (!_settingsCache) {
    _settingsCache = game.settings.get(MODULE_ID, "reputationSettings") || { ...DEFAULT_SETTINGS };
  }
  return _settingsCache;
}

export async function setSettings(settings) {
  _settingsCache = settings;
  await game.settings.set(MODULE_ID, "reputationSettings", settings);
  ReputationEvents.emit(ReputationEvents.EVENTS.SETTINGS_CHANGED, { settings });
}

export function getLimits() {
  const settings = getSettings();
  return { min: settings.min, max: settings.max };
}

export function clamp(value, min = null, max = null) {
  if (min === null || max === null) {
    const limits = getLimits();
    min = min ?? limits.min;
    max = max ?? limits.max;
  }
  return Math.max(min, Math.min(max, value));
}

export function getDefaultTiers() {
  return DEFAULT_TIER_KEYS.map(tier => ({
    name: game.i18n.localize(`${MODULE_ID}.${tier.nameKey}`),
    minValue: tier.minValue,
    color: tier.color
  }));
}

export function getTiers() {
  if (!_tiersCache) {
    _tiersCache = game.settings.get(MODULE_ID, "relationTiers") || getDefaultTiers();
  }
  return _tiersCache;
}

export async function setTiers(tiers) {
  _tiersCache = tiers;
  await game.settings.set(MODULE_ID, "relationTiers", tiers);
}

export function getTier(value) {
  const tiers = getTiers();
  if (!tiers || tiers.length === 0) {
    return { name: "Unknown", color: "#666666", minValue: -Infinity };
  }
  const sorted = tiers.sort((a, b) => b.minValue - a.minValue);
  return sorted.find(tier => value >= tier.minValue) || sorted[sorted.length - 1];
}

export function getRepColor(value) {
  return getTier(value).color;
}

export function invalidateCache() {
  _dataCache = null;
  _settingsCache = null;
  _tiersCache = null;
}

export function getLocations() {
  return getData().locations || [];
}

export async function setLocations(locations) {
  const data = getData();
  data.locations = locations;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.LOCATION_CHANGED, { locations });
}

export function getEntityInfo(entityType, entityId) {
  const data = getData();
  data.entityInfo ??= {};
  data.entityInfo[entityType] ??= {};
  return data.entityInfo[entityType][entityId] || { public: "", gm: "", perPlayer: {} };
}

export async function setEntityInfo(entityType, entityId, info) {
  const data = getData();
  data.entityInfo ??= {};
  data.entityInfo[entityType] ??= {};
  data.entityInfo[entityType][entityId] = info;
  await setData(data);
}

export function getEntityJournalId(entityType, entityId) {
  const data = getData();
  data.entityJournals ??= {};
  data.entityJournals[entityType] ??= {};
  return data.entityJournals[entityType][entityId] || null;
}

export async function setEntityJournalId(entityType, entityId, journalId) {
  const data = getData();
  data.entityJournals ??= {};
  data.entityJournals[entityType] ??= {};
  data.entityJournals[entityType][entityId] = journalId;
  await setData(data);
}

export async function removeEntityJournalId(entityType, entityId) {
  const data = getData();
  if (data.entityJournals?.[entityType]?.[entityId]) {
    delete data.entityJournals[entityType][entityId];
    await setData(data);
  }
}