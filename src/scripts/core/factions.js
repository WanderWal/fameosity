import { MODULE_ID } from '../constants.js';
import { getData, setData, clamp, getLimits, getSettings } from '../data.js';
import { ReputationEvents } from '../events.js';
import { getTracked, getActorRep, isActorAuto, calcAutoActorRep } from './actors.js';

export function getFactions() {
  return getData().factions || [];
}

export function getFaction(factionId) {
  return getFactions().find(f => f.id === factionId) || null;
}

export async function setFactions(factions) {
  const data = getData();
  data.factions = factions;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.FACTION_CHANGED, { factions });
}

export async function addFaction(factionData) {
  const settings = getSettings();
  const factions = getFactions();
  const newFaction = {
    id: foundry.utils.randomID(),
    name: factionData.name || game.i18n.localize(`${MODULE_ID}.factions.new-faction`),
    image: factionData.image || "icons/svg/mystery-man.svg",
    reputation: factionData.reputation ?? 0,
    members: factionData.members || [],
    ranks: factionData.ranks || [],
    memberRanks: factionData.memberRanks || {}
  };
  factions.push(newFaction);
  await setFactions(factions);
  await setFactionMode(newFaction.id, settings.defaultFactionMode || 'manual');
  return newFaction;
}

export async function updateFaction(factionId, updates) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  
  Object.assign(faction, updates);
  await setFactions(factions);
  return faction;
}

export async function deleteFaction(factionId) {
  const factions = getFactions();
  const index = factions.findIndex(f => f.id === factionId);
  if (index > -1) {
    factions.splice(index, 1);
    await setFactions(factions);
    return true;
  }
  return false;
}

export async function addFactionMember(factionId, actorId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return false;
  
  faction.members ??= [];
  if (!faction.members.includes(actorId)) {
    faction.members.push(actorId);
    await setFactions(factions);
    ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { factionId, actorId, added: true });
    return true;
  }
  return false;
}

export async function removeFactionMember(factionId, actorId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.members) return false;
  
  const index = faction.members.indexOf(actorId);
  if (index > -1) {
    faction.members.splice(index, 1);
    if (faction.memberRanks?.[actorId]) {
      delete faction.memberRanks[actorId];
    }
    await setFactions(factions);
    ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { factionId, actorId, removed: true });
    return true;
  }
  return false;
}

export function getFactionMode(factionId) {
  const autoFlags = getData().autoFlags || {};
  const hybridFlags = getData().hybridFlags || {};
  
  if ((autoFlags.factions || []).includes(factionId)) return 'auto';
  if ((hybridFlags.factions || []).includes(factionId)) return 'hybrid';
  return 'manual';
}

export async function setFactionMode(factionId, mode) {
  const data = getData();
  data.autoFlags ??= { factions: [], actors: [] };
  data.hybridFlags ??= { factions: [], actors: [] };
  
  data.autoFlags.factions = (data.autoFlags.factions || []).filter(id => id !== factionId);
  data.hybridFlags.factions = (data.hybridFlags.factions || []).filter(id => id !== factionId);
  
  if (mode === 'auto') {
    data.autoFlags.factions.push(factionId);
  } else if (mode === 'hybrid') {
    data.hybridFlags.factions.push(factionId);
  }
  
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.AUTO_CHANGED, { factionId, mode });
}

export function calcAutoFactionRep(factionId) {
  const faction = getFaction(factionId);
  if (!faction?.members?.length) return 0;
  
  const tracked = getTracked();
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const memberId of faction.members) {
    if (!tracked.includes(memberId)) continue;
    
    const memberRep = isActorAuto(memberId) ? calcAutoActorRep(memberId) : getActorRep(memberId);
    const rank = getFactionRank(factionId, memberId);
    const multiplier = rank?.multiplier ?? 1;
    
    weightedSum += memberRep * multiplier;
    totalWeight += multiplier;
  }
  
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

export function calcHybridFactionRep(factionId) {
  const settings = getSettings();
  const baseWeight = (settings.hybridBaseWeight ?? 50) / 100;
  const autoWeight = (settings.hybridAutoWeight ?? 50) / 100;
  
  const faction = getFaction(factionId);
  if (!faction) return 0;
  
  const baseRep = faction.reputation ?? 0;
  const autoRep = calcAutoFactionRep(factionId);
  
  const totalWeight = baseWeight + autoWeight;
  if (totalWeight === 0) return 0;
  
  return clamp(Math.round((baseRep * baseWeight + autoRep * autoWeight) / totalWeight));
}

export function getFactionRep(factionId) {
  const mode = getFactionMode(factionId);
  
  if (mode === 'auto') {
    return calcAutoFactionRep(factionId);
  }
  if (mode === 'hybrid') {
    return calcHybridFactionRep(factionId);
  }
  
  const faction = getFaction(factionId);
  return faction?.reputation ?? 0;
}

export async function setFactionRep(factionId, value) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return;
  
  faction.reputation = clamp(value);
  await setFactions(factions);
}

export async function changeFactionRep(factionId, delta) {
  const faction = getFaction(factionId);
  if (!faction) return;
  
  const mode = getFactionMode(factionId);
  let newValue;
  
  if (mode === 'hybrid') {
    const { max } = getLimits();
    const maxBase = max / 2;
    newValue = Math.min(clamp((faction.reputation ?? 0) + delta), maxBase);
  } else {
    newValue = clamp((faction.reputation ?? 0) + delta);
  }
  
  await setFactionRep(factionId, newValue);
}

export function getFactionRank(factionId, actorId) {
  const faction = getFaction(factionId);
  if (!faction?.ranks?.length) return null;
  
  const manualRankId = faction.memberRanks?.[actorId];
  if (!manualRankId) return null;
  
  return faction.ranks.find(r => r.id === manualRankId) || null;
}

export async function setMemberRank(factionId, actorId, rankId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return;
  
  faction.memberRanks ??= {};
  
  if (rankId === null || rankId === '') {
    delete faction.memberRanks[actorId];
  } else {
    faction.memberRanks[actorId] = rankId;
  }
  
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, actorId, rankId });
}

export async function addFactionRank(factionId, rankData) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  
  faction.ranks ??= [];
  const newRank = {
    id: foundry.utils.randomID(),
    name: rankData.name || game.i18n.localize(`${MODULE_ID}.ranks.new-rank`),
    minReputation: rankData.minReputation ?? 0,
    color: rankData.color || "#6a6a6a",
    multiplier: rankData.multiplier ?? 1
  };
  
  faction.ranks.push(newRank);
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rank: newRank });
  return newRank;
}

export async function updateFactionRank(factionId, rankId, updates) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  
  const rank = faction.ranks?.find(r => r.id === rankId);
  if (!rank) return null;
  
  Object.assign(rank, updates);
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rankId, updates });
  return rank;
}

export async function removeFactionRank(factionId, rankId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.ranks) return false;
  
  const index = faction.ranks.findIndex(r => r.id === rankId);
  if (index === -1) return false;
  
  faction.ranks.splice(index, 1);
  
  if (faction.memberRanks) {
    for (const actorId in faction.memberRanks) {
      if (faction.memberRanks[actorId] === rankId) {
        delete faction.memberRanks[actorId];
      }
    }
  }
  
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rankId, removed: true });
  return true;
}

export function getFactionWantedPC(factionId, pcId) {
  const faction = getFaction(factionId);
  return faction?.wanted?.[pcId] || { level: 0, reason: "", reward: 0, reputationReward: 0 };
}

export async function setFactionWantedPC(factionId, pcId, wantedData) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  
  faction.wanted ??= {};
  faction.wanted[pcId] = {
    level: Math.max(0, Math.min(6, wantedData.level ?? 0)),
    reason: wantedData.reason ?? "",
    reward: Math.max(0, wantedData.reward ?? 0),
    reputationReward: wantedData.reputationReward ?? 0
  };
  
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.WANTED_CHANGED, { 
    factionId, 
    pcId, 
    wanted: faction.wanted[pcId],
    type: 'faction-wanted'
  });
  return faction.wanted[pcId];
}

export async function removeFactionWantedPC(factionId, pcId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.wanted?.[pcId]) return false;
  
  delete faction.wanted[pcId];
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.WANTED_CHANGED, { factionId, pcId, removed: true, type: 'faction-wanted' });
  return true;
}