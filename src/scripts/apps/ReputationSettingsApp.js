import { MODULE_ID } from '../constants.js';
import { getSettings, setSettings, getTiers, setTiers, escapeHtml } from '../data.js';

export class ReputationSettingsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-reputation-settings",
    classes: ["fame-reputation-settings", "standard-form"],
    position: { width: 520, height: "auto" },
    window: { icon: "fa-solid fa-star", resizable: false }
  };

  static PARTS = { content: { template: null } };

  constructor(options = {}) {
    super(options);
    this.currentTab = 'general';
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.title`);
  }

  async _prepareContext() {
    return {
      settings: getSettings(),
      tiers: getTiers(),
      currentTab: this.currentTab
    };
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-settings-content";

    const tiersHtml = context.tiers.map((tier, index) => `
      <div class="fame-tier-item" data-index="${index}">
        <input type="text" class="fame-tier-name" value="${escapeHtml(tier.name)}">
        <input type="number" class="fame-tier-min" value="${tier.minValue}">
        <input type="color" class="fame-tier-color" value="${tier.color}">
        <button type="button" class="fame-tier-del fame-icon-btn">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');

    div.innerHTML = `
      <nav class="fame-settings-tabs">
        <a class="fame-settings-tab ${context.currentTab === 'general' ? 'active' : ''}" data-tab="general">
          <i class="fa-solid fa-cog"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-general`)}
        </a>
        <a class="fame-settings-tab ${context.currentTab === 'tiers' ? 'active' : ''}" data-tab="tiers">
          <i class="fa-solid fa-layer-group"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-tiers`)}
        </a>
      </nav>

      <div class="fame-settings-panel ${context.currentTab === 'general' ? 'active' : ''}" data-tab="general">
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.enabled.name`)}</label>
          <input type="checkbox" name="enabled" ${context.settings.enabled ? 'checked' : ''}>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.enabled.hint`)}</p>
        </div>
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.displayMode.name`)}</label>
          <select name="displayMode">
            <option value="show" ${context.settings.displayMode === 'show' ? 'selected' : ''}>
              ${game.i18n.localize(`${MODULE_ID}.settings.displayMode.show`)}
            </option>
            <option value="hide" ${context.settings.displayMode === 'hide' ? 'selected' : ''}>
              ${game.i18n.localize(`${MODULE_ID}.settings.displayMode.hide`)}
            </option>
          </select>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.displayMode.hint`)}</p>
        </div>
        <div class="fame-form-group-row">
          <div class="fame-form-group">
            <label>${game.i18n.localize(`${MODULE_ID}.settings.reputationMin.name`)}</label>
            <input type="number" name="min" value="${context.settings.min}">
          </div>
          <div class="fame-form-group">
            <label>${game.i18n.localize(`${MODULE_ID}.settings.reputationMax.name`)}</label>
            <input type="number" name="max" value="${context.settings.max}">
          </div>
        </div>
      </div>

      <div class="fame-settings-panel ${context.currentTab === 'tiers' ? 'active' : ''}" data-tab="tiers">
        <div class="fame-form-group fame-tiers-section">
          <label>${game.i18n.localize(`${MODULE_ID}.relations.tiers`)}</label>
          <div class="fame-tiers-list">${tiersHtml}</div>
          <button type="button" class="fame-tier-add fame-add-btn">
            <i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.relations.addTier`)}
          </button>
        </div>
      </div>

      <div class="fame-settings-footer">
        <button type="button" class="fame-save-btn">
          <i class="fa-solid fa-save"></i> ${game.i18n.localize("Save")}
        </button>
      </div>
    `;

    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
  }

  _attachListeners(html) {
    const tiersList = html.querySelector('.fame-tiers-list');

    html.querySelectorAll('.fame-settings-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        e.preventDefault();
        this.currentTab = e.currentTarget.dataset.tab;
        this.render();
      });
    });

    html.querySelector('.fame-tier-add')?.addEventListener('click', () => {
      const tierItem = document.createElement('div');
      tierItem.className = 'fame-tier-item';
      tierItem.innerHTML = `
        <input type="text" class="fame-tier-name" value="${game.i18n.localize(`${MODULE_ID}.relations.newTier`)}">
        <input type="number" class="fame-tier-min" value="0">
        <input type="color" class="fame-tier-color" value="#8a8a8a">
        <button type="button" class="fame-tier-del fame-icon-btn">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      tiersList.appendChild(tierItem);
      
      tierItem.querySelector('.fame-tier-del').addEventListener('click', () => {
        tierItem.remove();
      });
    });

    html.querySelectorAll('.fame-tier-del').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.fame-tier-item').remove();
      });
    });

    html.querySelector('.fame-save-btn')?.addEventListener('click', async () => {
      const tiers = [...html.querySelectorAll('.fame-tier-item')]
        .map(item => ({
          name: item.querySelector('.fame-tier-name').value,
          minValue: parseInt(item.querySelector('.fame-tier-min').value) || 0,
          color: item.querySelector('.fame-tier-color').value
        }))
        .sort((a, b) => a.minValue - b.minValue);

      await setSettings({
        enabled: html.querySelector('[name="enabled"]').checked,
        displayMode: html.querySelector('[name="displayMode"]').value,
        min: parseInt(html.querySelector('[name="min"]').value),
        max: parseInt(html.querySelector('[name="max"]').value)
      });

      await setTiers(tiers);
      this.close();
    });
  }
}