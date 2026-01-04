import { MODULE_ID } from '../constants.js';
import { getLimits, clamp, getTier, escapeHtml } from '../data.js';
import { ReputationEvents } from '../events.js';
import {
  getTracked, removeTracked, addTracked,
  getActorRep, setActorRep,
  getDisplayName, getCustomName, setCustomName,
  getPCs, ensureImportant,
  isActorAuto, toggleActorAuto, getEffectiveActorRep,
  isActorHybrid, toggleActorHybrid, getActorMode, setActorMode
} from '../core/actors.js';
import {
  getIndRel, setIndRel,
  getFactionRel, setFactionRel
} from '../core/relations.js';
import {
  isHidden, toggleHidden
} from '../core/visibility.js';
import {
  getFactions, getFaction, setFactions,
  addFaction, deleteFaction,
  addFactionMember, removeFactionMember,
  getFactionMode, setFactionMode,
  getFactionRep,
  getFactionRank, setMemberRank,
  addFactionRank, updateFactionRank, removeFactionRank,
  getFactionWantedPC, setFactionWantedPC, removeFactionWantedPC
} from '../core/factions.js';
import {
  getLocations, getLocation, setLocations,
  addLocation, deleteLocation,
  addActorToLocation, removeActorFromLocation,
  addFactionToLocation, removeFactionFromLocation,
  getLocationWanted, setLocationWanted, removeWanted
} from '../core/locations.js';
import {
  changeReputation, changeFactionRepWithNotify, showRelationChangeNotification
} from '../core/notifications.js';
import { confirmDelete } from '../core/index.js';
import { createBar, updateBar } from '../ui.js';
import { InfoPopupApp } from './InfoPopupApp.js';
import { PickerApp } from './PickerApp.js';

export class RelationsViewerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-relations-viewer",
    classes: ["fame-relations-viewer", "standard-form"],
    position: { width: 680, height: 720 },
    window: { icon: "fa-solid fa-users", resizable: true }
  };

  static PARTS = { content: { template: null } };

  constructor(options = {}) {
    super(options);
    this.currentTab = null;
    this.characterSubTab = 'locations';
    this.expandedFactions = new Set();
    this.expandedActors = new Set();
    this.expandedLocations = new Set();
    this.collapsedSections = new Set();
    this.scrollPos = {};
    this.scrollToEntityId = null;
    this._unsubscribers = [];
    this._renderScheduled = false;
    this._busy = false;
  }

  _onFirstRender() {
    this._subscribeToEvents();
  }

  _subscribeToEvents() {
    const scheduleRender = () => {
      if (this._busy || this._renderScheduled || !this.rendered) return;
      this._renderScheduled = true;
      setTimeout(() => {
        this._renderScheduled = false;
        if (this.rendered && !this._busy) this.render();
      }, 250);
    };
    const events = ReputationEvents.EVENTS;
    this._unsubscribers = Object.values(events).map(event => ReputationEvents.on(event, scheduleRender));
  }

  async close(options = {}) {
    this._unsubscribers.forEach(unsub => typeof unsub === 'function' && unsub());
    this._unsubscribers = [];
    return super.close(options);
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.relations.viewer-title`);
  }

  _getSelectedActor() {
    return canvas.tokens.controlled[0]?.actor || game.user.character || null;
  }

  _toggleSection(entityId, sectionType) {
    const key = `${sectionType}-${entityId}-open`;
    if (this.collapsedSections.has(key)) {
      this.collapsedSections.delete(key);
    } else {
      this.collapsedSections.add(key);
    }
  }

  _isSectionOpen(entityId, sectionType) {
    return this.collapsedSections.has(`${sectionType}-${entityId}-open`);
  }

  async _prepareContext() {
    const { min, max } = getLimits();
    const isGM = game.user.isGM;
    const pcs = getPCs();
    const allActors = getTracked().map(id => this._buildActorData(id)).filter(Boolean);
    const allFactions = getFactions().map(f => this._buildFactionData(f, pcs));
    const allLocations = getLocations().map(l => this._buildLocationData(l, allFactions));
    const selectedActor = this._getSelectedActor();
    const showCharTab = !!selectedActor;

    if (this.currentTab === 'character' && !showCharTab) this.currentTab = 'locations';
    else if (!this.currentTab) this.currentTab = showCharTab ? 'character' : 'locations';

    const hasPlayerOwner = selectedActor ? Object.entries(selectedActor.ownership || {}).some(([userId, level]) => {
      const user = game.users.get(userId);
      return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }) : false;

    const characterData = selectedActor
      ? this._buildCharacterData(selectedActor, allFactions, allActors, allLocations, pcs, hasPlayerOwner, isGM)
      : { characterFactions: [], characterActors: [], characterLocations: [] };

    return {
      min, max, isGM, pcs, allActors, allFactions, allLocations,
      visibleActors: allActors, visibleFactions: allFactions, visibleLocations: allLocations,
      selectedActor, showCharTab, hasPlayerOwner,
      currentTab: this.currentTab, characterSubTab: this.characterSubTab,
      expandedFactions: this.expandedFactions, expandedActors: this.expandedActors, 
      expandedLocations: this.expandedLocations, collapsedSections: this.collapsedSections,
      ...characterData
    };
  }

  _buildActorData(id) {
    const actor = game.actors.get(id);
    if (!actor) return null;
    const mode = getActorMode(id);
    return {
      id, name: getDisplayName(id), originalName: actor.name, img: actor.img,
      reputation: getEffectiveActorRep(id), mode, isAuto: mode === 'auto', isHybrid: mode === 'hybrid',
      hidden: isHidden('actor', id)
    };
  }

  _buildFactionData(faction, pcs) {
    const factionRels = {};
    for (const pc of pcs) {
      factionRels[pc.id] = getFactionRel(faction.id, pc.id);
    }
    const wantedEntries = {};
    for (const pc of pcs) {
      const wanted = getFactionWantedPC(faction.id, pc.id);
      if (wanted.level > 0) wantedEntries[pc.id] = wanted;
    }
    return {
      ...faction, reputation: getFactionRep(faction.id), mode: getFactionMode(faction.id),
      members: (faction.members || []).map(id => game.actors.get(id)).filter(Boolean),
      hidden: isHidden('faction', faction.id),
      factionRels, wantedEntries
    };
  }

  _buildLocationData(loc) {
    return {
      ...loc, factionCount: (loc.factions || []).length, actorCount: (loc.actors || []).length,
      hidden: isHidden('location', loc.id)
    };
  }

  _buildCharacterData(selectedActor, visibleFactions, visibleActors, visibleLocations, pcs, hasPlayerOwner, isGM) {
    const characterFactions = visibleFactions.map(faction => {
      const directRel = getFactionRel(faction.id, selectedActor.id);
      const memberRels = faction.members.filter(m => m.id !== selectedActor.id).map(m => getIndRel(m.id, selectedActor.id));
      const avgMemberRel = memberRels.length ? Math.round(memberRels.reduce((a, b) => a + b, 0) / memberRels.length) : 0;
      const isMember = faction.members.some(m => m.id === selectedActor.id);
      const rank = isMember ? getFactionRank(faction.id, selectedActor.id) : null;
      return { ...faction, directRel, avgMemberRel, isMember, rank };
    });

    let characterActors;
    if (hasPlayerOwner) {
      characterActors = visibleActors.filter(a => a.id !== selectedActor.id).map(a => ({
        ...a, relationToChar: getIndRel(a.id, selectedActor.id), charRelationToThem: getIndRel(selectedActor.id, a.id)
      }));
    } else {
      characterActors = pcs.filter(pc => pc.id !== selectedActor.id).map(pc => ({
        id: pc.id, name: getDisplayName(pc.id), img: pc.img,
        relationToChar: getIndRel(selectedActor.id, pc.id), charRelationToThem: getIndRel(pc.id, selectedActor.id),
        hidden: false
      }));
    }

    const characterLocations = visibleLocations.map(loc => {
      const wanted = getLocationWanted(loc.id, selectedActor.id);
      return { ...loc, wanted, wantedVisible: isGM || !wanted.hidden };
    });

    return { characterFactions, characterActors, characterLocations };
  }

  setPosition(position = {}) {
    const saved = game.settings.get(MODULE_ID, "relationsViewerPosition") || {};
    if (position.left !== undefined || position.top !== undefined) {
      game.settings.set(MODULE_ID, "relationsViewerPosition", { left: position.left ?? this.position.left, top: position.top ?? this.position.top });
    }
    return super.setPosition({ ...position, left: position.left ?? saved.left, top: position.top ?? saved.top });
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-relations-content";
    div.innerHTML = `${this._renderTabs(context)}<section class="fame-tab-wrapper">${this._renderCharacterPanel(context)}${this._renderLocationsPanel(context)}${this._renderFactionsPanel(context)}${this._renderActorsPanel(context)}</section>`;
    return div;
  }

  _renderTabs(context) {
    const { showCharTab, currentTab } = context;
    const tabs = [
      showCharTab ? { id: 'character', icon: 'fa-user', label: 'tab-character', hint: 'tab-character-hint' } : null,
      { id: 'locations', icon: 'fa-map-marker-alt', label: 'tab-locations', hint: 'tab-locations-hint' },
      { id: 'factions', icon: 'fa-flag', label: 'tab-factions', hint: 'tab-factions-hint' },
      { id: 'actors', icon: 'fa-users', label: 'tab-actors', hint: 'tab-actors-hint' }
    ].filter(Boolean);
    return `<nav class="fame-tabs">${tabs.map(t => `<a class="fame-tab-item ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}" title="${game.i18n.localize(`${MODULE_ID}.relations.${t.hint}`)}"><i class="fa-solid ${t.icon}"></i> ${game.i18n.localize(`${MODULE_ID}.relations.${t.label}`)}</a>`).join('')}</nav>`;
  }

  _renderCharacterPanel(context) {
    if (!context.showCharTab) return '';
    return `<div class="fame-tab-panel ${context.currentTab === 'character' ? 'active' : ''}" data-tab="character">${this._renderCharacterTab(context)}</div>`;
  }

  _renderLocationsPanel(context) {
    const { isGM, visibleLocations, currentTab } = context;
    const content = visibleLocations.length ? visibleLocations.map(l => this._renderLocation(l, context)).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-locations`)}</div>`;
    return `<div class="fame-tab-panel ${currentTab === 'locations' ? 'active' : ''}" data-tab="locations">${isGM ? `<button type="button" class="fame-add-btn" data-action="add-location" title="${game.i18n.localize(`${MODULE_ID}.locations.add-hint`)}"><i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.locations.add`)}</button>` : ''}<div class="fame-scroll-list fame-location-scroll">${content}</div></div>`;
  }

  _renderFactionsPanel(context) {
    const { isGM, visibleFactions, currentTab } = context;
    const content = visibleFactions.length ? visibleFactions.map(f => this._renderFaction(f, context)).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-factions`)}</div>`;
    return `<div class="fame-tab-panel ${currentTab === 'factions' ? 'active' : ''}" data-tab="factions">${isGM ? `<button type="button" class="fame-add-btn" data-action="add-faction" title="${game.i18n.localize(`${MODULE_ID}.factions.add-hint`)}"><i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.factions.add`)}</button>` : ''}<div class="fame-scroll-list fame-faction-scroll">${content}</div></div>`;
  }

  _renderActorsPanel(context) {
    const { isGM, visibleActors, currentTab } = context;
    const content = visibleActors.length ? visibleActors.map(a => this._renderActor(a, context)).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-actors`)}</div>`;
    return `<div class="fame-tab-panel fame-global-drop-zone ${currentTab === 'actors' ? 'active' : ''}" data-tab="actors">${isGM ? `<div class="fame-drop-hint" title="${game.i18n.localize(`${MODULE_ID}.settings.dragActorHintFull`)}">${game.i18n.localize(`${MODULE_ID}.settings.dragActorHint`)}</div>` : ''}<div class="fame-scroll-list fame-actor-scroll">${content}</div></div>`;
  }

  _renderLocation(location, context) {
    const { isGM, visibleFactions, visibleActors, expandedLocations } = context;
    const expanded = expandedLocations.has(location.id);
    const factionsList = (location.factions || []).map(fId => visibleFactions.find(f => f.id === fId)).filter(Boolean);
    const actorsList = (location.actors || []).map(aId => {
      const tracked = visibleActors.find(a => a.id === aId);
      if (tracked) return tracked;
      const actor = game.actors.get(aId);
      return actor ? { id: aId, name: getDisplayName(aId), img: actor.img } : null;
    }).filter(Boolean);
    const wantedEntries = Object.entries(location.wanted || {}).map(([pcId, data]) => {
      const pc = game.actors.get(pcId);
      return pc ? { pc, ...data } : null;
    }).filter(Boolean);

    return `<div class="fame-entity-item ${expanded ? 'expanded' : ''}" data-entity-id="${location.id}" data-entity-type="location">
      <div class="fame-entity-header" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-expand`)}">
        <img class="fame-entity-img large ${isGM ? 'editable' : ''}" src="${location.image || 'icons/svg/village.svg'}" ${isGM ? `data-action="change-image" data-id="${location.id}" data-type="location" title="${game.i18n.localize(`${MODULE_ID}.tooltips.change-image`)}"` : ''}>
        <div class="fame-entity-info">
          <div class="fame-entity-name-row">${isGM ? `<input type="text" class="fame-entity-name-input" value="${escapeHtml(location.name)}" data-field="name" data-id="${location.id}" data-type="location" title="${game.i18n.localize(`${MODULE_ID}.tooltips.edit-name`)}">` : `<span class="fame-entity-name">${escapeHtml(location.name)}</span>`}</div>
          <div class="fame-location-stats"><span class="fame-stat" title="${game.i18n.localize(`${MODULE_ID}.tooltips.faction-count`)}"><i class="fa-solid fa-flag"></i> ${factionsList.length}</span><span class="fame-stat" title="${game.i18n.localize(`${MODULE_ID}.tooltips.actor-count`)}"><i class="fa-solid fa-user"></i> ${actorsList.length}</span><span class="fame-stat" title="${game.i18n.localize(`${MODULE_ID}.tooltips.wanted-count`)}"><i class="fa-solid fa-exclamation-triangle"></i> ${wantedEntries.length}</span></div>
        </div>
        <div class="fame-entity-actions">
          ${isGM ? `<button type="button" class="fame-icon-btn" data-action="delete" data-id="${location.id}" data-type="location" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete`)}"><i class="fa-solid fa-trash"></i></button>` : ''}
          <button type="button" class="fame-icon-btn fame-expand-btn" data-action="toggle-expand" data-id="${location.id}" data-type="location" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-expand`)}"><i class="fa-solid fa-chevron-down fame-expand-icon"></i></button>
        </div>
      </div>
      <div class="fame-entity-content fame-location-content">
        ${this._renderLocationContent(location, wantedEntries, factionsList, actorsList, visibleActors, isGM)}
      </div>
    </div>`;
  }

  _renderLocationWantedItem(locationId, entry, isGM) {
    const stars = entry.level || 0;
    const starsHtml = Array.from({ length: 6 }, (_, i) => {
      if (isGM) {
        return `<i class="fa-solid fa-star fame-wanted-star-btn ${i < stars ? 'active' : ''}" data-action="set-location-wanted-level" data-location="${locationId}" data-pc="${entry.pc.id}" data-value="${i + 1}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.set-wanted-level`)}"></i>`;
      }
      return `<i class="fa-solid fa-star fame-wanted-star ${i < stars ? 'active' : ''}"></i>`;
    }).join('');
    
    return `<div class="fame-wanted-item"><div class="fame-wanted-header"><img class="fame-wanted-img" src="${entry.pc.img || 'icons/svg/mystery-man.svg'}"><div class="fame-wanted-info"><span class="fame-wanted-name">${escapeHtml(entry.pc.name)}</span></div><div class="fame-wanted-stars">${starsHtml}</div>${isGM ? `<button type="button" class="fame-icon-btn" data-action="delete-location-wanted" data-location="${locationId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete-wanted`)}"><i class="fa-solid fa-trash"></i></button>` : ''}</div>${(entry.reward > 0 || isGM) ? `<div class="fame-wanted-extra">${isGM ? `<div class="fame-wanted-field"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i></label><input type="number" class="fame-location-wanted-reward" value="${entry.reward || 0}" min="0" data-location="${locationId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"></div><div class="fame-wanted-field reason"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"><i class="fa-solid fa-scroll"></i></label><input type="text" class="fame-location-wanted-reason" value="${escapeHtml(entry.reason || '')}" data-location="${locationId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"></div>` : `${entry.reward > 0 ? `<span class="fame-wanted-reward-badge" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i> ${entry.reward.toLocaleString()}</span>` : ''}${entry.reason ? `<span class="fame-wanted-reason-text" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}">${escapeHtml(entry.reason)}</span>` : ''}`}</div>` : ''}</div>`;
  }

  _renderFactionWantedItem(factionId, entry, isGM) {
    const stars = entry.level || 0;
    const starsHtml = Array.from({ length: 6 }, (_, i) => {
      if (isGM) {
        return `<i class="fa-solid fa-star fame-wanted-star-btn ${i < stars ? 'active' : ''}" data-action="set-faction-wanted-level" data-faction="${factionId}" data-pc="${entry.pc.id}" data-value="${i + 1}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.set-wanted-level`)}"></i>`;
      }
      return `<i class="fa-solid fa-star fame-wanted-star ${i < stars ? 'active' : ''}"></i>`;
    }).join('');
    
    const hasReward = entry.reward > 0 || entry.reputationReward !== 0;
    
    return `<div class="fame-wanted-item"><div class="fame-wanted-header"><img class="fame-wanted-img" src="${entry.pc.img || 'icons/svg/mystery-man.svg'}"><div class="fame-wanted-info"><span class="fame-wanted-name">${escapeHtml(entry.pc.name)}</span></div><div class="fame-wanted-stars">${starsHtml}</div>${isGM ? `<button type="button" class="fame-icon-btn" data-action="delete-faction-wanted" data-faction="${factionId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete-wanted`)}"><i class="fa-solid fa-trash"></i></button>` : ''}</div>${(hasReward || isGM) ? `<div class="fame-wanted-extra">${isGM ? `<div class="fame-wanted-field"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i></label><input type="number" class="fame-faction-wanted-reward" value="${entry.reward || 0}" min="0" data-faction="${factionId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"></div><div class="fame-wanted-field"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reputation-reward`)}"><i class="fa-solid fa-star"></i></label><input type="number" class="fame-faction-wanted-rep-reward" value="${entry.reputationReward || 0}" data-faction="${factionId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reputation-reward`)}"></div><div class="fame-wanted-field reason"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"><i class="fa-solid fa-scroll"></i></label><input type="text" class="fame-faction-wanted-reason" value="${escapeHtml(entry.reason || '')}" data-faction="${factionId}" data-pc="${entry.pc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"></div>` : `${entry.reward > 0 ? `<span class="fame-wanted-reward-badge" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i> ${entry.reward.toLocaleString()}</span>` : ''}${entry.reputationReward !== 0 ? `<span class="fame-wanted-rep-badge ${entry.reputationReward > 0 ? 'positive' : 'negative'}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reputation-reward`)}"><i class="fa-solid fa-star"></i> ${entry.reputationReward > 0 ? '+' : ''}${entry.reputationReward}</span>` : ''}${entry.reason ? `<span class="fame-wanted-reason-text" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}">${escapeHtml(entry.reason)}</span>` : ''}`}</div>` : ''}</div>`;
  }

  _renderLocationContent(location, wantedEntries, factionsList, actorsList, visibleActors, isGM) {
    const wantedOpen = this._isSectionOpen(location.id, 'wanted');
    const factionsOpen = this._isSectionOpen(location.id, 'loc-factions');
    const actorsOpen = this._isSectionOpen(location.id, 'loc-actors');

    const wantedContent = wantedEntries.length ? wantedEntries.map(e => this._renderLocationWantedItem(location.id, e, isGM)).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.wanted.no-warrants`)}</div>`;
    const factionsContent = factionsList.length ? factionsList.map(f => `<div class="fame-location-member clickable" data-nav-type="faction" data-nav-id="${f.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"><img class="fame-member-img" src="${f.image || 'icons/svg/mystery-man.svg'}"><span class="fame-member-name">${escapeHtml(f.name)}</span>${isGM ? `<button type="button" class="fame-icon-btn" data-action="remove-faction-from-loc" data-location="${location.id}" data-faction="${f.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.remove`)}"><i class="fa-solid fa-times"></i></button>` : ''}</div>`).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.relations.no-factions`)}</div>`;
    const actorsContent = actorsList.length ? actorsList.map(a => {
      const isTracked = visibleActors.some(va => va.id === a.id);
      return `<div class="fame-location-member ${isTracked ? 'clickable' : ''}" ${isTracked ? `data-nav-type="actor" data-nav-id="${a.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"` : ''}><img class="fame-member-img" src="${a.img || 'icons/svg/mystery-man.svg'}"><span class="fame-member-name">${escapeHtml(a.name)}</span>${isGM ? `<button type="button" class="fame-icon-btn" data-action="remove-actor-from-loc" data-location="${location.id}" data-actor="${a.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.remove`)}"><i class="fa-solid fa-times"></i></button>` : ''}</div>`;
    }).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.relations.no-actors`)}</div>`;

    return `
      <div class="fame-collapsible-section">
        <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${location.id}" data-section="wanted" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
          <i class="fa-solid fa-chevron-${wantedOpen ? 'down' : 'right'} fame-collapse-icon"></i>
          <span class="fame-section-label"><i class="fa-solid fa-exclamation-triangle"></i> ${game.i18n.localize(`${MODULE_ID}.locations.wanted`)}</span>
          <span class="fame-section-count">(${wantedEntries.length})</span>
          ${isGM ? `<button type="button" class="fame-section-add-btn" data-action="add-location-wanted" data-location="${location.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-wanted`)}"><i class="fa-solid fa-plus"></i></button>` : ''}
        </div>
        <div class="fame-collapsible-content ${wantedOpen ? 'expanded' : ''}">
          <div class="fame-wanted-list">${wantedContent}</div>
        </div>
      </div>
      <div class="fame-collapsible-section">
        <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${location.id}" data-section="loc-factions" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
          <i class="fa-solid fa-chevron-${factionsOpen ? 'down' : 'right'} fame-collapse-icon"></i>
          <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.locations.factions-here`)}</span>
          <span class="fame-section-count">(${factionsList.length})</span>
          ${isGM ? `<button type="button" class="fame-section-add-btn" data-action="add-faction-to-loc" data-location="${location.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-faction`)}"><i class="fa-solid fa-plus"></i></button>` : ''}
        </div>
        <div class="fame-collapsible-content ${factionsOpen ? 'expanded' : ''}">
          <div class="fame-location-members">${factionsContent}</div>
        </div>
      </div>
      <div class="fame-collapsible-section">
        <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${location.id}" data-section="loc-actors" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
          <i class="fa-solid fa-chevron-${actorsOpen ? 'down' : 'right'} fame-collapse-icon"></i>
          <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.locations.actors-here`)}</span>
          <span class="fame-section-count">(${actorsList.length})</span>
          ${isGM ? `<button type="button" class="fame-section-add-btn" data-action="add-actor-to-loc" data-location="${location.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-actor`)}"><i class="fa-solid fa-plus"></i></button>` : ''}
        </div>
        <div class="fame-collapsible-content ${actorsOpen ? 'expanded' : ''}">
          <div class="fame-location-members">${actorsContent}</div>
        </div>
      </div>
    `;
  }

  _renderWantedItem(locationId, entry, isGM, type = 'pc') {
    const isPc = type === 'pc';
    const entity = isPc ? entry.pc : entry.faction;
    const entityId = entity.id;
    const entityName = isPc ? entity.name : entity.name;
    const entityImg = isPc ? entity.img : entity.image;
    const stars = entry.level || 0;
    const starsDisplay = Array.from({ length: 6 }, (_, i) => `<i class="fa-solid fa-star fame-wanted-star ${i < stars ? 'active' : ''}"></i>`).join('');
    const starsInput = isGM ? Array.from({ length: 6 }, (_, i) => `<i class="fa-solid fa-star fame-wanted-star-btn ${i < stars ? 'active' : ''}" data-action="set-wanted-level" data-location="${locationId}" data-target="${entityId}" data-target-type="${type}" data-value="${i + 1}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.set-wanted-level`)}"></i>`).join('') : '';
    const deleteAction = isPc ? 'delete-wanted' : 'delete-faction-wanted';
    
    return `<div class="fame-wanted-item"><div class="fame-wanted-header"><img class="fame-wanted-img" src="${entityImg || 'icons/svg/mystery-man.svg'}"><div class="fame-wanted-info"><span class="fame-wanted-name">${escapeHtml(entityName)}</span><div class="fame-wanted-stars">${starsDisplay}</div></div>${isGM ? `<div class="fame-wanted-controls"><div class="fame-wanted-stars-input">${starsInput}</div><button type="button" class="fame-icon-btn" data-action="${deleteAction}" data-location="${locationId}" data-target="${entityId}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete-wanted`)}"><i class="fa-solid fa-trash"></i></button></div>` : ''}</div>${(entry.reward > 0 || isGM) ? `<div class="fame-wanted-extra">${isGM ? `<div class="fame-wanted-field"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i></label><input type="number" class="fame-wanted-reward" value="${entry.reward || 0}" min="0" data-location="${locationId}" data-target="${entityId}" data-target-type="${type}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"></div><div class="fame-wanted-field reason"><label title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"><i class="fa-solid fa-scroll"></i></label><input type="text" class="fame-wanted-reason" value="${escapeHtml(entry.reason || '')}" data-location="${locationId}" data-target="${entityId}" data-target-type="${type}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}"></div>` : `${entry.reward > 0 ? `<span class="fame-wanted-reward-badge" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reward`)}"><i class="fa-solid fa-coins"></i> ${entry.reward.toLocaleString()}</span>` : ''}${entry.reason ? `<span class="fame-wanted-reason-text" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reason`)}">${escapeHtml(entry.reason)}</span>` : ''}`}</div>` : ''}</div>`;
  }

  _renderFaction(faction, context) {
    const { min, max, isGM, expandedFactions } = context;
    const expanded = expandedFactions.has(faction.id);
    const tier = getTier(faction.reputation);
    const mode = faction.mode;
    const isAutoMode = mode === 'auto';
    const isHybridMode = mode === 'hybrid';
    const imgSrc = faction.image || 'icons/svg/mystery-man.svg';
    
    const modeBtn = isGM ? `<button type="button" class="fame-mode-btn fame-icon-btn ${mode !== 'manual' ? 'active' : ''} ${isHybridMode ? 'hybrid' : ''}" data-action="cycle-faction-mode" data-id="${faction.id}" data-current="${mode}" title="${game.i18n.localize(`${MODULE_ID}.mode.${mode}-hint`)}"><i class="fa-solid fa-calculator"></i></button>` : '';

    return `<div class="fame-entity-item ${expanded ? 'expanded' : ''}" data-entity-id="${faction.id}" data-entity-type="faction">
      <div class="fame-entity-header" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-expand`)}">
        <img class="fame-entity-img large ${isGM ? 'editable' : ''}" src="${imgSrc}" ${isGM ? `data-action="change-image" data-id="${faction.id}" data-type="faction" title="${game.i18n.localize(`${MODULE_ID}.tooltips.change-image`)}"` : ''}>
        <div class="fame-entity-info">
          <div class="fame-entity-name-row">${isGM ? `<input type="text" class="fame-entity-name-input" value="${escapeHtml(faction.name)}" data-field="name" data-id="${faction.id}" data-type="faction" title="${game.i18n.localize(`${MODULE_ID}.tooltips.edit-name`)}">` : `<span class="fame-entity-name">${escapeHtml(faction.name)}</span>`}<span class="fame-tier-badge" style="background:${tier.color}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reputation-tier`)}">${escapeHtml(tier.name)}</span></div>
          ${createBar(faction.reputation, min, max, isGM && !isAutoMode, faction.id, 'faction', isAutoMode, false, false, isHybridMode)}
        </div>
        <div class="fame-entity-actions">
          ${modeBtn}
          ${isGM ? `<button type="button" class="fame-icon-btn" data-action="delete" data-id="${faction.id}" data-type="faction" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete`)}"><i class="fa-solid fa-trash"></i></button>` : ''}
          <button type="button" class="fame-icon-btn fame-expand-btn" data-action="toggle-expand" data-id="${faction.id}" data-type="faction" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-expand`)}"><i class="fa-solid fa-chevron-down fame-expand-icon"></i></button>
        </div>
      </div>
      ${this._renderFactionContent(faction, context)}
    </div>`;
  }

  _renderFactionContent(faction, context) {
    const { min, max, isGM, pcs, visibleActors } = context;
    const hasRanks = faction.ranks?.length > 0;
    const ranksOpen = this._isSectionOpen(faction.id, 'ranks');
    const membersOpen = this._isSectionOpen(faction.id, 'members');
    const relationsOpen = this._isSectionOpen(faction.id, 'relations');
    const wantedOpen = this._isSectionOpen(faction.id, 'faction-wanted');

    const wantedEntries = Object.entries(faction.wantedEntries || {}).map(([pcId, data]) => {
      const pc = game.actors.get(pcId);
      return pc ? { pc, ...data } : null;
    }).filter(Boolean);

    const wantedSection = `<div class="fame-collapsible-section">
      <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${faction.id}" data-section="faction-wanted" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
        <i class="fa-solid fa-chevron-${wantedOpen ? 'down' : 'right'} fame-collapse-icon"></i>
        <span class="fame-section-label"><i class="fa-solid fa-exclamation-triangle"></i> ${game.i18n.localize(`${MODULE_ID}.factions.bounties`)}</span>
        <span class="fame-section-count">(${wantedEntries.length})</span>
        ${isGM ? `<button type="button" class="fame-section-add-btn" data-action="add-faction-wanted" data-faction="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-wanted`)}"><i class="fa-solid fa-plus"></i></button>` : ''}
      </div>
      <div class="fame-collapsible-content ${wantedOpen ? 'expanded' : ''}">
        <div class="fame-wanted-list">${wantedEntries.length ? wantedEntries.map(e => this._renderFactionWantedItem(faction.id, e, isGM)).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.wanted.no-bounties`)}</div>`}</div>
      </div>
    </div>`;

    const ranksEditor = isGM ? `<div class="fame-collapsible-section">
      <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${faction.id}" data-section="ranks" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
        <i class="fa-solid fa-chevron-${ranksOpen ? 'down' : 'right'} fame-collapse-icon"></i>
        <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.ranks.title`)}</span>
        <span class="fame-section-count">(${(faction.ranks || []).length})</span>
        <button type="button" class="fame-section-add-btn" data-action="add-rank" data-faction="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-rank`)}"><i class="fa-solid fa-plus"></i></button>
      </div>
      <div class="fame-collapsible-content ${ranksOpen ? 'expanded' : ''}">
        <div class="fame-ranks-list">${(faction.ranks || []).sort((a, b) => (b.minReputation ?? -Infinity) - (a.minReputation ?? -Infinity)).map(rank => `<div class="fame-rank-item"><input type="text" class="fame-rank-name" value="${escapeHtml(rank.name)}" data-field="rank-name" data-faction="${faction.id}" data-rank="${rank.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.rank-name`)}"><input type="number" class="fame-rank-min" value="${rank.minReputation ?? ''}" placeholder="—" data-field="rank-min" data-faction="${faction.id}" data-rank="${rank.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.rank-min`)}"><input type="number" class="fame-rank-multiplier" value="${rank.multiplier ?? 1}" step="0.1" min="0" data-field="rank-mult" data-faction="${faction.id}" data-rank="${rank.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.rank-mult`)}"><input type="color" class="fame-rank-color" value="${rank.color}" data-field="rank-color" data-faction="${faction.id}" data-rank="${rank.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.rank-color`)}"><button type="button" class="fame-icon-btn" data-action="delete-rank" data-faction="${faction.id}" data-rank="${rank.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete`)}"><i class="fa-solid fa-trash"></i></button></div>`).join('')}</div>
      </div>
    </div>` : '';

    const membersHtml = faction.members.length ? faction.members.map(member => {
      const isClickable = visibleActors.some(a => a.id === member.id);
      const memberRank = hasRanks ? getFactionRank(faction.id, member.id) : null;
      const isManualRank = faction.memberRanks?.[member.id];
      const rankSelect = isGM && hasRanks ? `<select class="fame-member-rank-select" data-field="member-rank" data-faction="${faction.id}" data-actor="${member.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.select-rank`)}"><option value="" ${!isManualRank ? 'selected' : ''}>${game.i18n.localize(`${MODULE_ID}.ranks.auto`)}</option>${faction.ranks.sort((a, b) => (b.minReputation ?? -Infinity) - (a.minReputation ?? -Infinity)).map(r => `<option value="${r.id}" ${isManualRank === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select>` : '';
      const rankBadge = memberRank ? `<span class="fame-member-rank-badge ${isManualRank ? 'manual' : ''}" style="background:${memberRank.color}" title="${isManualRank ? game.i18n.localize(`${MODULE_ID}.tooltips.manual-rank`) : game.i18n.localize(`${MODULE_ID}.tooltips.auto-rank`)}">${escapeHtml(memberRank.name)}${memberRank.multiplier && memberRank.multiplier !== 1 ? `<span class="fame-rank-mult">×${memberRank.multiplier}</span>` : ''}${isManualRank ? '<i class="fa-solid fa-lock"></i>' : ''}</span>` : '';
      return `<div class="fame-member-item ${isClickable ? 'clickable' : ''}" ${isClickable ? `data-nav-type="actor" data-nav-id="${member.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"` : ''}><img class="fame-member-img" src="${member.img || 'icons/svg/mystery-man.svg'}"><div class="fame-member-info"><span class="fame-member-name">${escapeHtml(getDisplayName(member.id))}</span>${rankBadge}</div>${rankSelect}${isGM ? `<button type="button" class="fame-icon-btn" data-action="remove-member" data-actor="${member.id}" data-faction="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.remove`)}"><i class="fa-solid fa-times"></i></button>` : ''}</div>`;
    }).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.relations.no-members`)}</div>`;

    const membersSection = `<div class="fame-collapsible-section">
      <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${faction.id}" data-section="members" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
        <i class="fa-solid fa-chevron-${membersOpen ? 'down' : 'right'} fame-collapse-icon"></i>
        <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.ranks.members`)}</span>
        <span class="fame-section-count">(${faction.members.length})</span>
        ${isGM ? `<button type="button" class="fame-section-add-btn" data-action="add-member" data-faction="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.add-member`)}"><i class="fa-solid fa-plus"></i></button>` : ''}
      </div>
      <div class="fame-collapsible-content ${membersOpen ? 'expanded' : ''}">
        <div class="fame-members-list fame-drop-target fame-member-drop" data-faction-id="${faction.id}">${membersHtml}</div>
      </div>
    </div>`;

    const relationsHtml = pcs.map(pc => {
      const rel = getFactionRel(faction.id, pc.id);
      const tier = getTier(rel);
      return `<div class="fame-relation-item" title="${game.i18n.localize(`${MODULE_ID}.tooltips.faction-relation`)}"><img class="fame-rel-img small" src="${pc.img || 'icons/svg/mystery-man.svg'}"><div class="fame-rel-info"><span class="fame-rel-name">${escapeHtml(pc.name)}</span><span class="fame-tier-badge small" style="background:${tier.color}">${escapeHtml(tier.name)}</span></div><div class="fame-rel-bar-wrap">${createBar(rel, min, max, isGM, `${faction.id}:${pc.id}`, 'faction-rel', false, false, true)}</div></div>`;
    }).join('');

    const relationsSection = pcs.length ? `<div class="fame-collapsible-section">
      <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${faction.id}" data-section="relations" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
        <i class="fa-solid fa-chevron-${relationsOpen ? 'down' : 'right'} fame-collapse-icon"></i>
        <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.relations.to-players`)}</span>
      </div>
      <div class="fame-collapsible-content ${relationsOpen ? 'expanded' : ''}">
        <div class="fame-relations-list">${relationsHtml}</div>
      </div>
    </div>` : '';

    return `<div class="fame-entity-members">${wantedSection}${ranksEditor}${membersSection}${relationsSection}</div>`;
  }

  _renderActor(entity, context) {
    const { min, max, isGM, expandedActors, visibleFactions } = context;
    const expanded = expandedActors.has(entity.id);
    const tier = getTier(entity.reputation);
    const mode = entity.mode;
    const isAutoMode = mode === 'auto';
    const isHybridMode = mode === 'hybrid';
    const customName = getCustomName(entity.id);
    const actor = game.actors.get(entity.id);
    const placeholder = actor?.name || '';
    const imgSrc = entity.img || 'icons/svg/mystery-man.svg';

    const modeBtn = isGM ? `<button type="button" class="fame-mode-btn fame-icon-btn ${mode !== 'manual' ? 'active' : ''} ${isHybridMode ? 'hybrid' : ''}" data-action="cycle-actor-mode" data-id="${entity.id}" data-current="${mode}" title="${game.i18n.localize(`${MODULE_ID}.mode.${mode}-hint`)}"><i class="fa-solid fa-calculator"></i></button>` : '';

    return `<div class="fame-entity-item ${expanded ? 'expanded' : ''}" data-entity-id="${entity.id}" data-entity-type="actor">
      <div class="fame-entity-header" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-expand`)}">
        <img class="fame-entity-img large" src="${imgSrc}">
        <div class="fame-entity-info">
          <div class="fame-entity-name-row">${isGM ? `<input type="text" class="fame-entity-name-input" value="${escapeHtml(customName)}" placeholder="${escapeHtml(placeholder)}" data-field="name" data-id="${entity.id}" data-type="actor" title="${game.i18n.localize(`${MODULE_ID}.tooltips.edit-name`)}">` : `<span class="fame-entity-name">${escapeHtml(entity.name)}</span>`}<span class="fame-tier-badge" style="background:${tier.color}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.reputation-tier`)}">${escapeHtml(tier.name)}</span></div>
          ${createBar(entity.reputation, min, max, isGM && !isAutoMode, entity.id, 'actor', isAutoMode, false, false, isHybridMode)}
        </div>
        <div class="fame-entity-actions">
          ${modeBtn}
          ${isGM ? `<button type="button" class="fame-icon-btn" data-action="delete" data-id="${entity.id}" data-type="actor" title="${game.i18n.localize(`${MODULE_ID}.tooltips.delete`)}"><i class="fa-solid fa-trash"></i></button>` : ''}
          <button type="button" class="fame-icon-btn fame-expand-btn" data-action="toggle-expand" data-id="${entity.id}" data-type="actor" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-expand`)}"><i class="fa-solid fa-chevron-down fame-expand-icon"></i></button>
        </div>
      </div>
      ${this._renderActorContent(entity, context, visibleFactions)}
    </div>`;
  }

  _renderActorContent(entity, context, visibleFactions) {
    const { min, max, pcs, isGM } = context;
    const otherPcs = pcs.filter(pc => pc.id !== entity.id);
    const relationsOpen = this._isSectionOpen(entity.id, 'actor-relations');
    const factionsOpen = this._isSectionOpen(entity.id, 'actor-factions');
    
    const memberFactions = visibleFactions.filter(f => f.members.some(m => m.id === entity.id));
    
    const relationsHtml = otherPcs.length ? otherPcs.map(pc => {
      const rel = getIndRel(entity.id, pc.id);
      const tier = getTier(rel);
      return `<div class="fame-relation-item" title="${game.i18n.localize(`${MODULE_ID}.tooltips.individual-relation`)}"><img class="fame-rel-img small" src="${pc.img || 'icons/svg/mystery-man.svg'}"><div class="fame-rel-info"><span class="fame-rel-name">${escapeHtml(pc.name)}</span><span class="fame-tier-badge small" style="background:${tier.color}">${escapeHtml(tier.name)}</span></div><div class="fame-rel-bar-wrap">${createBar(rel, min, max, isGM, `${entity.id}:${pc.id}`, 'individual', false, false, true)}</div></div>`;
    }).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.relations.no-players`)}</div>`;

    const factionsHtml = memberFactions.length ? memberFactions.map(faction => {
      const rel = getFactionRel(faction.id, entity.id);
      const tier = getTier(rel);
      const rank = getFactionRank(faction.id, entity.id);
      return `<div class="fame-relation-item clickable" data-nav-type="faction" data-nav-id="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"><img class="fame-rel-img small" src="${faction.image || 'icons/svg/mystery-man.svg'}"><div class="fame-rel-info"><span class="fame-rel-name">${escapeHtml(faction.name)}</span>${rank ? `<span class="fame-member-rank-badge" style="background:${rank.color}">${escapeHtml(rank.name)}</span>` : ''}</div><div class="fame-rel-bar-wrap">${createBar(rel, min, max, isGM, `${faction.id}:${entity.id}`, 'faction-rel', false, false, true)}</div></div>`;
    }).join('') : `<div class="fame-no-items">${game.i18n.localize(`${MODULE_ID}.relations.no-faction-memberships`)}</div>`;

    return `<div class="fame-entity-relations">
      <div class="fame-collapsible-section">
        <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${entity.id}" data-section="actor-relations" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
          <i class="fa-solid fa-chevron-${relationsOpen ? 'down' : 'right'} fame-collapse-icon"></i>
          <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.relations.to-players`)}</span>
        </div>
        <div class="fame-collapsible-content ${relationsOpen ? 'expanded' : ''}">
          <div class="fame-relations-list">${relationsHtml}</div>
        </div>
      </div>
      <div class="fame-collapsible-section">
        <div class="fame-collapsible-header" data-action="toggle-section" data-entity="${entity.id}" data-section="actor-factions" title="${game.i18n.localize(`${MODULE_ID}.tooltips.toggle-section`)}">
          <i class="fa-solid fa-chevron-${factionsOpen ? 'down' : 'right'} fame-collapse-icon"></i>
          <span class="fame-section-label">${game.i18n.localize(`${MODULE_ID}.relations.faction-memberships`)}</span>
          <span class="fame-section-count">(${memberFactions.length})</span>
        </div>
        <div class="fame-collapsible-content ${factionsOpen ? 'expanded' : ''}">
          <div class="fame-relations-list">${factionsHtml}</div>
        </div>
      </div>
    </div>`;
  }

  _renderCharacterTab(context) {
    const { selectedActor, characterSubTab, characterLocations, characterFactions, characterActors, min, max, visibleActors, isGM, hasPlayerOwner } = context;
    if (!selectedActor) return '';
    const wantedLocations = characterLocations.filter(l => l.wanted.level > 0 && l.wantedVisible);
    const wantedSummary = wantedLocations.slice(0, 4).map(l => `<div class="fame-wanted-summary-item" title="${escapeHtml(l.name)}"><span class="fame-wanted-summary-name">${escapeHtml(l.name)}</span><span class="fame-wanted-summary-stars">${Array.from({ length: 6 }, (_, i) => `<i class="fa-solid fa-star fame-wanted-star-small ${i < l.wanted.level ? 'active' : ''}"></i>`).join('')}</span>${l.wanted.reward > 0 ? `<span class="fame-wanted-summary-reward"><i class="fa-solid fa-coins"></i>${l.wanted.reward}</span>` : ''}</div>`).join('');
    const canEdit = isGM;

    const locationsContent = characterLocations.length ? characterLocations.map(loc => {
      const wanted = loc.wanted, stars = wanted.level || 0;
      const starsHtml = Array.from({ length: 6 }, (_, i) => `<i class="fa-solid fa-star fame-wanted-star ${i < stars ? 'active' : ''}"></i>`).join('');
      if (!isGM && wanted.hidden && stars > 0) return `<div class="fame-char-location-item clickable" data-nav-type="location" data-nav-id="${loc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"><img class="fame-char-loc-img" src="${loc.image || 'icons/svg/village.svg'}"><div class="fame-char-loc-info"><span class="fame-char-loc-name">${escapeHtml(loc.name)}</span></div><div class="fame-char-loc-wanted"><span class="fame-wanted-unknown">${game.i18n.localize(`${MODULE_ID}.wanted.unknown`)}</span></div></div>`;
      return `<div class="fame-char-location-item clickable ${stars > 0 ? 'has-warrant' : ''}" data-nav-type="location" data-nav-id="${loc.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"><img class="fame-char-loc-img" src="${loc.image || 'icons/svg/village.svg'}"><div class="fame-char-loc-info"><span class="fame-char-loc-name">${escapeHtml(loc.name)}</span>${wanted.reason && loc.wantedVisible ? `<div class="fame-char-loc-reason"><i class="fa-solid fa-scroll"></i> ${escapeHtml(wanted.reason)}</div>` : ''}</div><div class="fame-char-loc-wanted">${stars > 0 ? `<div class="fame-wanted-stars">${starsHtml}</div>` : ''}${wanted.reward > 0 ? `<div class="fame-wanted-bounty"><i class="fa-solid fa-coins"></i><span class="fame-bounty-amount">${wanted.reward.toLocaleString()}</span></div>` : ''}</div></div>`;
    }).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-locations`)}</div>`;

    const factionsContent = characterFactions.length ? characterFactions.map(faction => {
      const tier = getTier(faction.directRel);
      const avgTier = getTier(faction.avgMemberRel);
      const rankBadge = faction.rank ? `<span class="fame-char-fac-rank" style="background:${faction.rank.color}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.current-rank`)}">${escapeHtml(faction.rank.name)}</span>` : '';
      return `<div class="fame-char-faction-item ${faction.isMember ? 'is-member' : ''}">
        <div class="fame-char-faction-header clickable" data-nav-type="faction" data-nav-id="${faction.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}">
          <img class="fame-char-fac-img" src="${faction.image || 'icons/svg/mystery-man.svg'}">
          <div class="fame-char-fac-info">
            <div class="fame-char-fac-name-row"><span class="fame-char-fac-name">${escapeHtml(faction.name)}</span>${faction.isMember ? `<i class="fa-solid fa-star fame-member-star" title="${game.i18n.localize(`${MODULE_ID}.tooltips.is-member`)}"></i>` : ''}</div>
            ${rankBadge}
          </div>
        </div>
        <div class="fame-char-faction-relations">
          <div class="fame-char-faction-rel-row">
            <span class="fame-char-rel-label" title="${game.i18n.localize(`${MODULE_ID}.tooltips.faction-attitude-desc`)}">${game.i18n.localize(`${MODULE_ID}.relations.faction-attitude`)}:</span>
            <span class="fame-tier-badge small" style="background:${tier.color}">${escapeHtml(tier.name)}</span>
            ${canEdit ? `<div class="fame-char-rel-slider">${createBar(faction.directRel, min, max, true, `${faction.id}:${selectedActor.id}`, 'faction-rel', false, false, true)}</div>` : `<span class="fame-rel-value-display small" style="color:${tier.color}">${faction.directRel > 0 ? '+' : ''}${faction.directRel}</span>`}
          </div>
          ${faction.members.length ? `<div class="fame-char-faction-rel-row subtle">
            <span class="fame-char-rel-label" title="${game.i18n.localize(`${MODULE_ID}.tooltips.members-avg-desc`)}">${game.i18n.localize(`${MODULE_ID}.relations.members-avg`)}:</span>
            <span class="fame-tier-badge small" style="background:${avgTier.color}">${escapeHtml(avgTier.name)}</span>
            <span class="fame-rel-value-display small" style="color:${avgTier.color}">${faction.avgMemberRel > 0 ? '+' : ''}${faction.avgMemberRel}</span>
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-factions`)}</div>`;

    const actorsContent = characterActors.length ? characterActors.map(actor => {
      const tierToChar = getTier(actor.relationToChar), tierFromChar = getTier(actor.charRelationToThem);
      const isTracked = visibleActors.some(a => a.id === actor.id);
      const barDataId = `${actor.id}:${selectedActor.id}`;
      const reverseBarId = `${selectedActor.id}:${actor.id}`;
      return `<div class="fame-char-actor-item"><div class="fame-char-actor-header ${isTracked ? 'clickable' : ''}" ${isTracked ? `data-nav-type="actor" data-nav-id="${actor.id}" title="${game.i18n.localize(`${MODULE_ID}.tooltips.click-navigate`)}"` : ''}><img class="fame-char-rel-img" src="${actor.img || 'icons/svg/mystery-man.svg'}"><div class="fame-char-rel-info"><span class="fame-char-rel-name">${escapeHtml(actor.name)}</span></div></div><div class="fame-char-actor-relations"><div class="fame-char-actor-rel-row"><span class="fame-char-rel-label" title="${game.i18n.localize(`${MODULE_ID}.tooltips.their-attitude-desc`)}">${game.i18n.localize(`${MODULE_ID}.relations.their-attitude`)}:</span><span class="fame-tier-badge small" style="background:${tierToChar.color}">${escapeHtml(tierToChar.name)}</span>${canEdit ? `<div class="fame-char-rel-slider">${createBar(actor.relationToChar, min, max, true, barDataId, 'individual', false, false, true)}</div>` : `<span class="fame-rel-value-display small" style="color:${tierToChar.color}">${actor.relationToChar > 0 ? '+' : ''}${actor.relationToChar}</span>`}</div><div class="fame-char-actor-rel-row"><span class="fame-char-rel-label" title="${game.i18n.localize(`${MODULE_ID}.tooltips.your-attitude-desc`)}">${game.i18n.localize(`${MODULE_ID}.relations.your-attitude`)}:</span><span class="fame-tier-badge small" style="background:${tierFromChar.color}">${escapeHtml(tierFromChar.name)}</span>${canEdit ? `<div class="fame-char-rel-slider">${createBar(actor.charRelationToThem, min, max, true, reverseBarId, 'individual', false, false, true)}</div>` : `<span class="fame-rel-value-display small" style="color:${tierFromChar.color}">${actor.charRelationToThem > 0 ? '+' : ''}${actor.charRelationToThem}</span>`}</div></div></div>`;
    }).join('') : `<div class="fame-no-items center">${game.i18n.localize(`${MODULE_ID}.relations.no-actors`)}</div>`;

    return `<div class="fame-char-profile"><div class="fame-char-profile-main"><img class="fame-char-profile-img" src="${selectedActor.img || 'icons/svg/mystery-man.svg'}" title="${escapeHtml(getDisplayName(selectedActor.id))}"><div class="fame-char-profile-info"><div class="fame-char-profile-name">${escapeHtml(getDisplayName(selectedActor.id))}</div></div></div>${wantedLocations.length ? `<div class="fame-char-wanted-summary"><div class="fame-wanted-summary-header"><i class="fa-solid fa-exclamation-triangle"></i> ${game.i18n.localize(`${MODULE_ID}.character.wanted-summary`)}</div><div class="fame-wanted-summary-list">${wantedSummary}</div></div>` : ''}</div>
    <div class="fame-char-subtabs">${[{ id: 'locations', icon: 'fa-map-marker-alt', hint: 'subtab-locations-hint' }, { id: 'factions', icon: 'fa-flag', hint: 'subtab-factions-hint' }, { id: 'actors', icon: 'fa-users', hint: 'subtab-actors-hint' }].map(t => `<a class="fame-char-subtab ${characterSubTab === t.id ? 'active' : ''}" data-subtab="${t.id}" title="${game.i18n.localize(`${MODULE_ID}.character.${t.hint}`)}"><i class="fa-solid ${t.icon}"></i> ${game.i18n.localize(`${MODULE_ID}.character.subtab-${t.id}`)}</a>`).join('')}</div>
    <div class="fame-char-subtab-content"><div class="fame-char-subpanel ${characterSubTab === 'locations' ? 'active' : ''}" data-subtab="locations"><div class="fame-scroll-list fame-char-locations-scroll">${locationsContent}</div></div><div class="fame-char-subpanel ${characterSubTab === 'factions' ? 'active' : ''}" data-subtab="factions"><div class="fame-scroll-list fame-char-factions-scroll">${factionsContent}</div></div><div class="fame-char-subpanel ${characterSubTab === 'actors' ? 'active' : ''}" data-subtab="actors"><div class="fame-scroll-list fame-char-actors-scroll">${actorsContent}</div></div></div>`;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
    this._restoreScroll(content);
    if (this.scrollToEntityId) {
      const item = content.querySelector(`.fame-entity-item[data-entity-id="${this.scrollToEntityId}"]`);
      if (item) requestAnimationFrame(() => {
        const wrapper = content.querySelector('.fame-tab-wrapper');
        if (wrapper) {
          const itemTop = item.offsetTop - wrapper.offsetTop;
          wrapper.scrollTo({ top: itemTop - 100, behavior: 'smooth' });
        }
      });
      this.scrollToEntityId = null;
    }
  }

  _saveScroll(html) {
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper) this.scrollPos['main'] = wrapper.scrollTop;
  }

  _restoreScroll(html) {
    if (this.scrollToEntityId) return;
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper && this.scrollPos['main'] !== undefined) {
      wrapper.scrollTop = this.scrollPos['main'];
    }
  }

  _attachListeners(html) {
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper) wrapper.addEventListener('scroll', () => this._saveScroll(html), { passive: true });
    html.querySelectorAll('.fame-tab-item').forEach(tab => tab.addEventListener('click', e => { e.preventDefault(); this._saveScroll(html); this.currentTab = e.currentTarget.dataset.tab; this.render(); }));
    html.querySelectorAll('.fame-char-subtab').forEach(tab => tab.addEventListener('click', e => { e.preventDefault(); this._saveScroll(html); this.characterSubTab = e.currentTarget.dataset.subtab; this.render(); }));
    html.querySelectorAll('[data-nav-type][data-nav-id]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button, input, select, .fame-char-rel-slider')) return; e.stopPropagation(); this._saveScroll(html); const { navType, navId } = e.currentTarget.dataset; this.currentTab = navType === 'faction' ? 'factions' : navType === 'actor' ? 'actors' : 'locations'; (navType === 'faction' ? this.expandedFactions : navType === 'actor' ? this.expandedActors : this.expandedLocations).add(navId); this.scrollToEntityId = navId; this.render(); }));
    html.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', async e => { if (this._busy) return; e.preventDefault(); e.stopPropagation(); this._saveScroll(html); await this._handleAction(btn.dataset.action, { ...btn.dataset }); }));
    this._attachInputListeners(html);
    this._attachBarListeners(html);
    if (game.user.isGM) this._attachDropListeners(html);
  }

  async _handleAction(action, data) {
    if (this._busy) return;
    this._busy = true;
    try {
      if (action === 'toggle-expand') {
        const map = { faction: this.expandedFactions, location: this.expandedLocations, actor: this.expandedActors };
        const set = map[data.type]; if (set) set.has(data.id) ? set.delete(data.id) : set.add(data.id);
        this.render(); return;
      }
      if (action === 'toggle-section') {
        this._toggleSection(data.entity, data.section);
        this.render(); return;
      }
      if (action === 'cycle-actor-mode') {
        if (!game.user.isGM) return;
        const modes = ['manual', 'auto', 'hybrid'];
        const currentIndex = modes.indexOf(data.current);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        await setActorMode(data.id, nextMode);
        this.render(); return;
      }
      if (action === 'cycle-faction-mode') {
        if (!game.user.isGM) return;
        const modes = ['manual', 'auto', 'hybrid'];
        const currentIndex = modes.indexOf(data.current);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        await setFactionMode(data.id, nextMode);
        this.render(); return;
      }
      if (action === 'delete') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-${data.type}`))) return; 
        if (data.type === 'faction') { this.expandedFactions.delete(data.id); await deleteFaction(data.id); } 
        else if (data.type === 'location') { this.expandedLocations.delete(data.id); await deleteLocation(data.id); } 
        else { this.expandedActors.delete(data.id); await removeTracked(data.id); } 
        this.render(); return; 
      }
      if (action === 'add-faction') { 
        if (!game.user.isGM) return; 
        const f = await addFaction({ name: game.i18n.localize(`${MODULE_ID}.factions.new-faction`) }); 
        this.expandedFactions.add(f.id); 
        this.render(); return; 
      }
      if (action === 'add-location') { 
        if (!game.user.isGM) return; 
        const l = await addLocation({ name: game.i18n.localize(`${MODULE_ID}.locations.new-location`) }); 
        this.expandedLocations.add(l.id); 
        this.render(); return; 
      }
      if (action === 'add-location-wanted') { 
        if (!game.user.isGM) return; 
        const loc = getLocation(data.location); 
        const existing = Object.keys(loc?.wanted || {}); 
        PickerApp.openActorPicker({ 
          filter: a => !existing.includes(a.id), 
          callback: async actorId => { 
            await setLocationWanted(data.location, actorId, { level: 1, reason: "", reward: 0, hidden: false }); 
            this.render(); 
          } 
        }); 
        return; 
      }

      if (action === 'add-faction-wanted') { 
        if (!game.user.isGM) return; 
        const faction = getFaction(data.faction); 
        const existing = Object.keys(faction?.wanted || {}); 
        PickerApp.openActorPicker({ 
          filter: a => !existing.includes(a.id), 
          callback: async actorId => { 
            await setFactionWantedPC(data.faction, actorId, { level: 1, reason: "", reward: 0, reputationReward: 0 }); 
            this.render(); 
          } 
        }); 
        return; 
      }
      if (action === 'set-location-wanted-level') { 
        if (!game.user.isGM) return; 
        const cur = getLocationWanted(data.location, data.pc); 
        const clicked = parseInt(data.value); 
        await setLocationWanted(data.location, data.pc, { ...cur, level: Math.max(0, cur.level === clicked ? clicked - 1 : clicked) }); 
        this.render(); return; 
      }
      if (action === 'delete-location-wanted') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-wanted`))) return; 
        await removeWanted(data.location, data.pc); 
        this.render(); return; 
      }
      if (action === 'add-faction-wanted') { 
        if (!game.user.isGM) return; 
        const faction = getFaction(data.faction); 
        const existing = Object.keys(faction?.wanted || {}); 
        PickerApp.openPCPicker({ filter: p => !existing.includes(p.id), callback: async pcId => { 
          await setFactionWantedPC(data.faction, pcId, { level: 1, reason: "", reward: 0, reputationReward: 0 }); 
          this.render(); 
        } }); 
        return; 
      }
      if (action === 'set-faction-wanted-level') { 
        if (!game.user.isGM) return; 
        const cur = getFactionWantedPC(data.faction, data.pc); 
        const clicked = parseInt(data.value); 
        await setFactionWantedPC(data.faction, data.pc, { ...cur, level: Math.max(0, cur.level === clicked ? clicked - 1 : clicked) }); 
        this.render(); return; 
      }
      if (action === 'delete-faction-wanted') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-wanted`))) return; 
        await removeFactionWantedPC(data.faction, data.pc); 
        this.render(); return; 
      }
      if (action === 'add-faction-to-loc') { 
        if (!game.user.isGM) return; 
        const loc = getLocation(data.location); 
        PickerApp.openFactionPicker({ filter: f => !(loc?.factions || []).includes(f.id), callback: async fId => { 
          await addFactionToLocation(data.location, fId); 
          this.render(); 
        } }); 
        return; 
      }
      if (action === 'remove-faction-from-loc') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return; 
        await removeFactionFromLocation(data.location, data.faction); 
        this.render(); return; 
      }
      if (action === 'add-actor-to-loc') { 
        if (!game.user.isGM) return; 
        const loc = getLocation(data.location); 
        PickerApp.openActorPicker({ filter: a => !(loc?.actors || []).includes(a.id), callback: async aId => { 
          await addActorToLocation(data.location, aId); 
          this.render(); 
        } }); 
        return; 
      }
      if (action === 'remove-actor-from-loc') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return; 
        await removeActorFromLocation(data.location, data.actor); 
        this.render(); return; 
      }
      if (action === 'add-member') { 
        if (!game.user.isGM) return; 
        const fac = getFaction(data.faction); 
        PickerApp.openActorPicker({ filter: a => !(fac?.members || []).includes(a.id), callback: async aId => { 
          const actor = game.actors.get(aId); 
          if (actor && !actor.hasPlayerOwner) await ensureImportant(actor); 
          await addFactionMember(data.faction, aId); 
          this.render(); 
        } }); 
        return; 
      }
      if (action === 'remove-member') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-member`))) return; 
        await removeFactionMember(data.faction, data.actor); 
        this.render(); return; 
      }
      if (action === 'add-rank') { 
        if (!game.user.isGM) return; 
        await addFactionRank(data.faction, { name: game.i18n.localize(`${MODULE_ID}.ranks.new-rank`), minReputation: 0, color: "#6a6a6a", multiplier: 1 }); 
        this._toggleSection(data.faction, 'ranks'); 
        this.render(); return; 
      }
      if (action === 'delete-rank') { 
        if (!game.user.isGM) return; 
        if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-rank`))) return; 
        await removeFactionRank(data.faction, data.rank); 
        this.render(); return; 
      }
      if (action === 'change-image') { 
        if (!game.user.isGM) return; 
        new FilePicker({ type: "image", callback: async path => { 
          if (data.type === 'faction') { 
            const factions = getFactions(); 
            const f = factions.find(x => x.id === data.id); 
            if (f) { f.image = path; await setFactions(factions); } 
          } else if (data.type === 'location') { 
            const locations = getLocations(); 
            const l = locations.find(x => x.id === data.id); 
            if (l) { l.image = path; await setLocations(locations); } 
          } 
          this.render(); 
        } }).render(true); 
        return; 
      }
    } finally { this._busy = false; }
  }

  _attachInputListeners(html) {
    html.querySelectorAll('.fame-entity-name-input').forEach(input => { 
      input.addEventListener('click', e => e.stopPropagation()); 
      input.addEventListener('change', async e => { 
        const { id, type } = e.target.dataset; 
        if (type === 'faction') { 
          const factions = getFactions(); 
          const f = factions.find(x => x.id === id); 
          if (f) { f.name = e.target.value; await setFactions(factions); } 
        } else if (type === 'location') { 
          const locations = getLocations(); 
          const l = locations.find(x => x.id === id); 
          if (l) { l.name = e.target.value; await setLocations(locations); } 
        } else await setCustomName(id, e.target.value); 
      }); 
    });
    
    html.querySelectorAll('.fame-location-wanted-reward').forEach(input => input.addEventListener('change', async e => { 
      const cur = getLocationWanted(e.target.dataset.location, e.target.dataset.pc); 
      await setLocationWanted(e.target.dataset.location, e.target.dataset.pc, { ...cur, reward: Math.max(0, parseInt(e.target.value) || 0) }); 
    }));
    
    html.querySelectorAll('.fame-location-wanted-reason').forEach(input => input.addEventListener('change', async e => { 
      const cur = getLocationWanted(e.target.dataset.location, e.target.dataset.pc); 
      await setLocationWanted(e.target.dataset.location, e.target.dataset.pc, { ...cur, reason: e.target.value }); 
    }));
    
    html.querySelectorAll('.fame-faction-wanted-reward').forEach(input => input.addEventListener('change', async e => { 
      const cur = getFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc); 
      await setFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc, { ...cur, reward: Math.max(0, parseInt(e.target.value) || 0) }); 
    }));
    
    html.querySelectorAll('.fame-faction-wanted-rep-reward').forEach(input => input.addEventListener('change', async e => { 
      const cur = getFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc); 
      await setFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc, { ...cur, reputationReward: parseInt(e.target.value) || 0 }); 
    }));
    
    html.querySelectorAll('.fame-faction-wanted-reason').forEach(input => input.addEventListener('change', async e => { 
      const cur = getFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc); 
      await setFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc, { ...cur, reason: e.target.value }); 
    }));
    
    html.querySelectorAll('.fame-rank-name').forEach(input => input.addEventListener('change', async e => await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { name: e.target.value })));
    
    html.querySelectorAll('.fame-rank-min').forEach(input => input.addEventListener('change', async e => await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { minReputation: e.target.value === '' ? null : parseInt(e.target.value) })));
    
    html.querySelectorAll('.fame-rank-multiplier').forEach(input => input.addEventListener('change', async e => await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { multiplier: parseFloat(e.target.value) || 1 })));
    
    html.querySelectorAll('.fame-rank-color').forEach(input => input.addEventListener('change', async e => await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { color: e.target.value })));
    
    html.querySelectorAll('.fame-member-rank-select').forEach(sel => { 
      sel.addEventListener('click', e => e.stopPropagation()); 
      sel.addEventListener('change', async e => await setMemberRank(e.target.dataset.faction, e.target.dataset.actor, e.target.value || null)); 
    });
  }

  _attachBarListeners(html) {
    html.querySelectorAll('.fame-bar-slider').forEach(slider => { 
      slider.addEventListener('mousedown', e => e.stopPropagation()); 
      slider.addEventListener('input', e => {
        let value = +e.target.value;
        if (e.target.dataset.hybrid === 'true') {
          const max = +e.target.max;
          const hybridMax = Math.floor(max / 2);
          if (value > hybridMax) {
            value = hybridMax;
            e.target.value = value;
          }
        }
        updateBar(e.target.closest('.fame-bar-container'), value);
      }); 
      slider.addEventListener('change', async e => {
        let value = +e.target.value;
        if (e.target.dataset.hybrid === 'true') {
          const max = +e.target.max;
          const hybridMax = Math.floor(max / 2);
          value = Math.min(value, hybridMax);
        }
        await this._handleBarChange(e.target.dataset.id, e.target.dataset.type, value);
      }); 
    });
    html.querySelectorAll('.fame-bar-val:not([readonly])').forEach(input => { 
      input.addEventListener('click', e => e.stopPropagation()); 
      input.addEventListener('change', async e => { 
        let value = clamp(+e.target.value || 0);
        if (e.target.dataset.hybrid === 'true') {
          const { max } = getLimits();
          const hybridMax = Math.floor(max / 2);
          value = Math.min(value, hybridMax);
        }
        updateBar(e.target.closest('.fame-bar-container'), value); 
        await this._handleBarChange(e.target.dataset.id, e.target.dataset.type, value); 
      }); 
    });
    html.querySelectorAll('.fame-bar-adj:not([disabled])').forEach(btn => btn.addEventListener('click', async e => { 
      e.stopPropagation(); 
      const container = e.currentTarget.closest('.fame-bar-container');
      const input = container.querySelector('.fame-bar-val'); 
      const baseDelta = e.currentTarget.classList.contains('fame-plus') ? 1 : -1;
      const delta = e.ctrlKey ? baseDelta * 5 : baseDelta; 
      let newValue = clamp((+input.value || 0) + delta);
      if (input.dataset.hybrid === 'true') {
        const { max } = getLimits();
        const hybridMax = Math.floor(max / 2);
        newValue = Math.min(newValue, hybridMax);
      }
      updateBar(container, newValue); 
      const { id, type } = input.dataset; 
      if (type === 'actor') await changeReputation(delta, id); 
      else if (type === 'faction') await changeFactionRepWithNotify(id, delta); 
      else await this._handleBarChange(id, type, newValue, delta); 
    }));
  }

  async _handleBarChange(id, type, value, delta = null) {
    if (type === 'faction') { 
      const factions = getFactions(); 
      const f = factions.find(x => x.id === id); 
      if (f) { f.reputation = value; await setFactions(factions); } 
    }
    else if (type === 'faction-rel') { 
      const [factionId, pcId] = id.split(':'); 
      const oldValue = getFactionRel(factionId, pcId);
      await setFactionRel(factionId, pcId, value);
      if (delta !== null || oldValue !== value) {
        const actualDelta = delta ?? (value - oldValue);
        const faction = getFaction(factionId);
        const pc = game.actors.get(pcId);
        if (faction && pc && actualDelta !== 0) {
          showRelationChangeNotification(faction.name, pc.name, actualDelta, pcId);
        }
      }
    }
    else if (type === 'individual') { 
      const [npcId, pcId] = id.split(':'); 
      const oldValue = getIndRel(npcId, pcId);
      await setIndRel(npcId, pcId, value);
      if (delta !== null || oldValue !== value) {
        const actualDelta = delta ?? (value - oldValue);
        const npc = game.actors.get(npcId);
        const pc = game.actors.get(pcId);
        if (npc && pc && actualDelta !== 0) {
          showRelationChangeNotification(getDisplayName(npcId), pc.name, actualDelta, pcId);
        }
      }
    }
    else if (type === 'actor') await setActorRep(id, value);
  }

  _attachDropListeners(html) {
    const globalDropZone = html.querySelector('.fame-global-drop-zone');
    if (globalDropZone) {
      globalDropZone.addEventListener('dragover', e => { e.preventDefault(); globalDropZone.classList.add('drag-over'); });
      globalDropZone.addEventListener('dragleave', e => { if (!globalDropZone.contains(e.relatedTarget)) globalDropZone.classList.remove('drag-over'); });
      globalDropZone.addEventListener('drop', async e => { e.preventDefault(); globalDropZone.classList.remove('drag-over'); let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; } if (data.type !== 'Actor') return; const actor = await fromUuid(data.uuid); if (!actor) return; if (!actor.hasPlayerOwner) await ensureImportant(actor); await addTracked(actor.id); this.render(); });
    }
    html.querySelectorAll('.fame-member-drop').forEach(zone => this._setupDropZone(zone, async actor => { if (!actor.hasPlayerOwner) await ensureImportant(actor); await addFactionMember(zone.dataset.factionId, actor.id); this.render(); }));
  }

  _setupDropZone(zone, handler) {
    zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { e.stopPropagation(); zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; } if (data.type !== 'Actor') return; const actor = await fromUuid(data.uuid); if (actor) await handler(actor); });
  }
}