import { MODULE_ID } from '../constants.js';
import { getData, setData, clamp, getLimits } from '../data.js';
import { ReputationEvents } from '../events.js';

export function getTracked() {
  return getData().trackedActors || [];
}

export async function setTracked(actors) {
  const data = getData();
  data.trackedActors = actors;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { trackedActors: actors });
}

export async function addTracked(actorId) {
  const tracked = getTracked();
  if (!tracked.includes(actorId)) {
    tracked.push(actorId);
    await setTracked(tracked);
    return true;
  }
  return false;
}

export async function removeTracked(actorId) {
  const tracked = getTracked();
  const index = tracked.indexOf(actorId);
  if (index > -1) {
    tracked.splice(index, 1);
    await setTracked(tracked);
    return true;
  }
  return false;
}

export function getActorRep(actorId) {
  return getData().actors[actorId] ?? 0;
}

export async function setActorRep(actorId, value) {
  const oldValue = getActorRep(actorId);
  const data = getData();
  data.actors[actorId] = clamp(value);
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.ACTOR_REP_CHANGED, {
    actorId,
    oldValue,
    newValue: data.actors[actorId]
  });
}

export function getCustomName(actorId) {
  return getData().actorNames?.[actorId] || "";
}

export async function setCustomName(actorId, name) {
  const data = getData();
  data.actorNames ??= {};
  data.actorNames[actorId] = name;
  await setData(data);
}

export function getDisplayName(actorId) {
  const custom = getCustomName(actorId);
  if (custom) return custom;
  const actor = game.actors.get(actorId);
  return actor?.name || "Unknown";
}

export function getPCs() {
  return game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
}

export async function ensureImportant(actor) {
  if (!actor) return;
  if (!actor.hasPlayerOwner && !actor.system?.traits?.important) {
    await actor.update({ "system.traits.important": true });
  }
}

export function getActorMode(actorId) {
  const data = getData();
  const autoFlags = data.autoFlags || {};
  const hybridFlags = data.hybridFlags || {};
  
  if ((autoFlags.actors || []).includes(actorId)) return 'auto';
  if ((hybridFlags.actors || []).includes(actorId)) return 'hybrid';
  return 'manual';
}

export async function setActorMode(actorId, mode) {
  const data = getData();
  data.autoFlags ??= { factions: [], actors: [] };
  data.hybridFlags ??= { factions: [], actors: [] };
  
  data.autoFlags.actors = (data.autoFlags.actors || []).filter(id => id !== actorId);
  data.hybridFlags.actors = (data.hybridFlags.actors || []).filter(id => id !== actorId);
  
  if (mode === 'auto') {
    data.autoFlags.actors.push(actorId);
  } else if (mode === 'hybrid') {
    data.hybridFlags.actors.push(actorId);
  }
  
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.AUTO_CHANGED, { actorId, mode });
}

export function isActorAuto(actorId) {
  return getActorMode(actorId) === 'auto';
}

export function isActorHybrid(actorId) {
  return getActorMode(actorId) === 'hybrid';
}

export async function toggleActorAuto(actorId) {
  const mode = getActorMode(actorId);
  await setActorMode(actorId, mode === 'auto' ? 'manual' : 'auto');
}

export async function toggleActorHybrid(actorId) {
  const mode = getActorMode(actorId);
  await setActorMode(actorId, mode === 'hybrid' ? 'manual' : 'hybrid');
}

export function calcAutoActorRep(actorId) {
  const data = getData();
  const pcs = getPCs().filter(pc => pc.id !== actorId);
  if (!pcs.length) return 0;

  const individualRelations = data.individualRelations || {};
  const actorRelations = individualRelations[actorId] || {};

  const relations = pcs.map(pc => actorRelations[pc.id] ?? 0);
  return Math.round(relations.reduce((a, b) => a + b, 0) / pcs.length);
}

export function calcHybridActorRep(actorId) {
  const baseRep = getActorRep(actorId);
  const { max } = getLimits();
  const cappedBase = Math.min(baseRep, max / 2);
  
  const autoRep = calcAutoActorRep(actorId);
  const autoContribution = Math.round(autoRep / 2);
  
  return clamp(cappedBase + autoContribution);
}

export function getEffectiveActorRep(actorId) {
  const mode = getActorMode(actorId);
  if (mode === 'auto') return calcAutoActorRep(actorId);
  if (mode === 'hybrid') return calcHybridActorRep(actorId);
  return getActorRep(actorId);
}

export function getAutoFlags() {
  return getData().autoFlags || { factions: [], actors: [] };
}

export async function setAutoFlags(flags) {
  const data = getData();
  data.autoFlags = flags;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.AUTO_CHANGED, { flags });
}