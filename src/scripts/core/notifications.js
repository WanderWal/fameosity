import { MODULE_ID, CONFIG_REMEMBER } from '../constants.js';
import { getSettings, escapeHtml, clamp } from '../data.js';
import {
  getDisplayName, isActorAuto, calcAutoActorRep, getActorRep, setActorRep, getPCs
} from './actors.js';
import { adjustIndRels } from './relations.js';
import { getFaction, getFactionRep, changeFactionRep } from './factions.js';

const activeNotifications = new Map();
const NOTIFICATION_TIMEOUT = 5000;

function playNotificationSound() {
  if (!CONFIG_REMEMBER.sound) return;

  foundry.audio.AudioHelper.play({
    src: CONFIG_REMEMBER.sound,
    volume: CONFIG_REMEMBER.soundVolume ?? 0.5,
    autoplay: true,
    loop: false
  }, false);
}

function getOrCreateContainer() {
  let container = document.getElementById("fame-notification-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "fame-notification-container";
    container.style.cssText = `top:${CONFIG_REMEMBER.positionTop};left:${CONFIG_REMEMBER.positionLeft}`;
    document.body.appendChild(container);
  }
  return container;
}

function createNotificationElement(tokenName, actionText, delta, showChange) {
  const icon = showChange ? (delta > 0 ? "+" : "−") : "!";
  const iconColor = showChange
    ? (delta > 0 ? "var(--fame-color-success)" : "var(--fame-color-error)")
    : "var(--fame-color-text-light-1)";

  const notification = document.createElement("div");
  notification.className = "fame-notification";
  notification.innerHTML = `
    <div class="fame-notification-icon" style="border-color:${iconColor};color:${iconColor}">${icon}</div>
    <div class="fame-notification-content">
      <span class="fame-notification-name">${escapeHtml(tokenName)}</span>
      <span class="fame-notification-action">${escapeHtml(actionText)}</span>
    </div>
  `;
  return notification;
}

function scheduleRemoval(notification, key, container) {
  const cleanup = () => {
    if (notification.parentNode) notification.remove();
    activeNotifications.delete(key);
    if (container && !container.children.length) container.remove();
  };

  setTimeout(() => {
    notification.classList.add('out');
    notification.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, CONFIG_REMEMBER.fadeOutDuration + 100);
  }, CONFIG_REMEMBER.displayDuration);

  setTimeout(() => {
    if (activeNotifications.has(key)) cleanup();
  }, CONFIG_REMEMBER.displayDuration + NOTIFICATION_TIMEOUT);
}

export function showNotification(tokenName, actionText, delta, showChange, ownerIds = null) {
  if (ownerIds && !ownerIds.includes(game.user.id) && !game.user.isGM) return;

  const notificationKey = `${tokenName}-${delta > 0 ? 'up' : 'down'}`;
  if (activeNotifications.has(notificationKey)) return;

  const container = getOrCreateContainer();
  const notification = createNotificationElement(tokenName, actionText, delta, showChange);

  container.appendChild(notification);
  activeNotifications.set(notificationKey, notification);

  playNotificationSound();
  scheduleRemoval(notification, notificationKey, container);
}

export function showRelationChangeNotification(sourceName, targetName, delta, targetPcId = null) {
  const settings = getSettings();
  if (!settings.enabled) return;

  const ownerIds = [];
  if (targetPcId) {
    const pc = game.actors.get(targetPcId);
    if (pc) {
      const owners = Object.entries(pc.ownership || {})
        .filter(([, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        .map(([userId]) => userId);
      ownerIds.push(...owners);
    }
  }

  const actionKey = delta > 0 ? "relation-improved" : "relation-worsened";
  const actionText = game.i18n.format(`${MODULE_ID}.remember.${actionKey}`, { target: targetName });
  const displayName = sourceName;

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification",
    tokenName: displayName,
    actionText,
    delta,
    showChange: true,
    ownerIds: ownerIds.length ? ownerIds : null
  });

  showNotification(displayName, actionText, delta, true, ownerIds.length ? ownerIds : null);
}

export async function changeReputation(delta, actorId = null) {
  const settings = getSettings();
  if (!settings.enabled) return;

  let actor;
  let displayName;

  if (actorId) {
    actor = game.actors.get(actorId);
    displayName = getDisplayName(actorId);
  } else {
    const token = canvas.tokens.controlled[0];
    if (token) {
      actor = token.actor;
      displayName = token.name;
    } else {
      actor = game.user.character;
      if (actor) {
        displayName = getDisplayName(actor.id);
      }
    }
  }

  if (!actor) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-token`));
    return;
  }

  const ownerIds = Object.entries(actor.ownership || {})
    .filter(([, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
    .map(([userId]) => userId);

  await adjustIndRels(actor.id, delta);

  if (!isActorAuto(actor.id)) {
    const currentRep = getActorRep(actor.id);
    await setActorRep(actor.id, clamp(currentRep + delta));
  }

  const actionKey = delta > 0 ? "action-approves" : "action-disapproves";
  const actionText = game.i18n.localize(`${MODULE_ID}.remember.${actionKey}`);

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification",
    tokenName: displayName,
    actionText,
    delta,
    showChange: false,
    ownerIds
  });

  showNotification(displayName, actionText, delta, false, ownerIds);
}

export async function changeFactionRepWithNotify(factionId, delta) {
  const settings = getSettings();
  const faction = getFaction(factionId);
  if (!faction) return;

  await changeFactionRep(factionId, delta);

  if (!settings.enabled) return;

  const actionKey = delta > 0 ? "action-approves" : "action-disapproves";
  const actionText = game.i18n.localize(`${MODULE_ID}.remember.${actionKey}`);

  const factionPrefix = game.i18n.localize(`${MODULE_ID}.remember.faction-prefix`);
  const displayName = `${factionPrefix} "${faction.name}"`;

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification",
    tokenName: displayName,
    actionText,
    delta,
    showChange: false,
    ownerIds: null
  });

  showNotification(displayName, actionText, delta, false, null);
}