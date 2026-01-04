import { getData, setData, clamp } from '../data.js';
import { ReputationEvents } from '../events.js';
import { getPCs } from './actors.js';

export function getIndRel(npcId, pcId) {
  return getData().individualRelations?.[npcId]?.[pcId] ?? 0;
}

export async function setIndRel(npcId, pcId, value) {
  const oldValue = getIndRel(npcId, pcId);
  const data = getData();
  data.individualRelations ??= {};
  data.individualRelations[npcId] ??= {};
  data.individualRelations[npcId][pcId] = clamp(value);
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { 
    npcId, 
    pcId, 
    oldValue, 
    newValue: data.individualRelations[npcId][pcId] 
  });
}

export async function adjustIndRels(actorId, delta) {
  const pcs = getPCs().filter(pc => pc.id !== actorId);
  if (!pcs.length) return;
  
  const data = getData();
  data.individualRelations ??= {};
  data.individualRelations[actorId] ??= {};
  
  for (const pc of pcs) {
    const current = data.individualRelations[actorId][pc.id] ?? 0;
    data.individualRelations[actorId][pc.id] = clamp(current + delta);
  }
  
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, delta, bulk: true });
}

export function getFactionRel(factionId, pcId) {
  return getData().factionRelations?.[factionId]?.[pcId] ?? 0;
}

export async function setFactionRel(factionId, pcId, value) {
  const oldValue = getFactionRel(factionId, pcId);
  const data = getData();
  data.factionRelations ??= {};
  data.factionRelations[factionId] ??= {};
  data.factionRelations[factionId][pcId] = clamp(value);
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { 
    factionId, 
    pcId, 
    oldValue, 
    newValue: data.factionRelations[factionId][pcId],
    type: 'faction'
  });
}

export function getPersonalVis(npcId, pcId) {
  return getData().personalVisibility?.[npcId]?.[pcId] ?? true;
}

export async function setPersonalVis(npcId, pcId, visible) {
  const data = getData();
  data.personalVisibility ??= {};
  data.personalVisibility[npcId] ??= {};
  data.personalVisibility[npcId][pcId] = visible;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId, pcId, visibility: visible });
}

export async function togglePersonalVis(npcId, pcId) {
  const current = getPersonalVis(npcId, pcId);
  await setPersonalVis(npcId, pcId, !current);
}