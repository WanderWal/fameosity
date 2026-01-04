import { getData, setData } from '../data.js';
import { ReputationEvents } from '../events.js';

function getHiddenKey(type) {
  const typeMap = {
    'faction': 'factions',
    'factions': 'factions',
    'actor': 'actors',
    'actors': 'actors',
    'location': 'locations',
    'locations': 'locations'
  };
  return typeMap[type] || 'actors';
}

export function getHiddenItems() {
  const data = getData();
  const hidden = data.hiddenItems || {};
  return {
    factions: Array.isArray(hidden.factions) ? [...hidden.factions] : [],
    actors: Array.isArray(hidden.actors) ? [...hidden.actors] : [],
    locations: Array.isArray(hidden.locations) ? [...hidden.locations] : []
  };
}

export async function setHiddenItems(hidden) {
  const data = getData();
  data.hiddenItems = {
    factions: Array.isArray(hidden.factions) ? [...hidden.factions] : [],
    actors: Array.isArray(hidden.actors) ? [...hidden.actors] : [],
    locations: Array.isArray(hidden.locations) ? [...hidden.locations] : []
  };
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
}

export function isHidden(type, id) {
  if (!type || !id) return false;
  const hidden = getHiddenItems();
  const key = getHiddenKey(type);
  const arr = hidden[key];
  return Array.isArray(arr) && arr.includes(id);
}

export async function toggleHidden(type, id) {
  if (!type || !id) return;
  
  const data = getData();
  const key = getHiddenKey(type);
  
  if (!data.hiddenItems) {
    data.hiddenItems = { factions: [], actors: [], locations: [] };
  }
  if (!Array.isArray(data.hiddenItems[key])) {
    data.hiddenItems[key] = [];
  }
  
  const arr = data.hiddenItems[key];
  const index = arr.indexOf(id);
  
  if (index > -1) {
    arr.splice(index, 1);
  } else {
    arr.push(id);
  }
  
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
}

export async function setHidden(type, id, hide) {
  if (!type || !id) return;
  
  const data = getData();
  const key = getHiddenKey(type);
  
  if (!data.hiddenItems) {
    data.hiddenItems = { factions: [], actors: [], locations: [] };
  }
  if (!Array.isArray(data.hiddenItems[key])) {
    data.hiddenItems[key] = [];
  }
  
  const arr = data.hiddenItems[key];
  const index = arr.indexOf(id);
  
  if (hide && index === -1) {
    arr.push(id);
    await setData(data);
    ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
  } else if (!hide && index > -1) {
    arr.splice(index, 1);
    await setData(data);
    ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
  }
}

export function filterVisible(items, type) {
  if (game.user.isGM) return items;
  return items.filter(item => !isHidden(type, item.id));
}