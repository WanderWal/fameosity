import { MODULE_ID } from '../constants.js';
import { getData, setData } from '../data.js';
import { ReputationEvents } from '../events.js';

export function getLocations() {
  return getData().locations || [];
}

export function getLocation(locationId) {
  return getLocations().find(l => l.id === locationId) || null;
}

export async function setLocations(locations) {
  const data = getData();
  data.locations = locations;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.LOCATION_CHANGED, { locations });
}

export async function addLocation(locationData) {
  const locations = getLocations();
  const newLocation = {
    id: foundry.utils.randomID(),
    name: locationData.name || game.i18n.localize(`${MODULE_ID}.locations.new-location`),
    image: locationData.image || "icons/svg/village.svg",
    factions: locationData.factions || [],
    actors: locationData.actors || [],
    wanted: locationData.wanted || {}
  };
  locations.push(newLocation);
  await setLocations(locations);
  return newLocation;
}

export async function updateLocation(locationId, updates) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return null;
  
  Object.assign(location, updates);
  await setLocations(locations);
  return location;
}

export async function deleteLocation(locationId) {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === locationId);
  if (index > -1) {
    locations.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function addActorToLocation(locationId, actorId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return false;
  
  location.actors ??= [];
  if (!location.actors.includes(actorId)) {
    location.actors.push(actorId);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function removeActorFromLocation(locationId, actorId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location?.actors) return false;
  
  const index = location.actors.indexOf(actorId);
  if (index > -1) {
    location.actors.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function addFactionToLocation(locationId, factionId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return false;
  
  location.factions ??= [];
  if (!location.factions.includes(factionId)) {
    location.factions.push(factionId);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function removeFactionFromLocation(locationId, factionId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location?.factions) return false;
  
  const index = location.factions.indexOf(factionId);
  if (index > -1) {
    location.factions.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export function getLocationWanted(locationId, pcId) {
  const location = getLocation(locationId);
  return location?.wanted?.[pcId] || { level: 0, reason: "", reward: 0, hidden: false };
}

export async function setLocationWanted(locationId, pcId, wantedData) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return null;
  
  location.wanted ??= {};
  location.wanted[pcId] = {
    level: Math.max(0, Math.min(6, wantedData.level ?? 0)),
    reason: wantedData.reason ?? "",
    reward: Math.max(0, wantedData.reward ?? 0),
    hidden: wantedData.hidden ?? false
  };
  
  await setLocations(locations);
  ReputationEvents.emit(ReputationEvents.EVENTS.WANTED_CHANGED, { 
    locationId, 
    pcId, 
    wanted: location.wanted[pcId] 
  });
  return location.wanted[pcId];
}

export async function removeWanted(locationId, pcId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location?.wanted?.[pcId]) return false;
  
  delete location.wanted[pcId];
  await setLocations(locations);
  ReputationEvents.emit(ReputationEvents.EVENTS.WANTED_CHANGED, { locationId, pcId, removed: true });
  return true;
}

export async function toggleWantedVisibility(locationId, pcId) {
  const wanted = getLocationWanted(locationId, pcId);
  await setLocationWanted(locationId, pcId, { ...wanted, hidden: !wanted.hidden });
}