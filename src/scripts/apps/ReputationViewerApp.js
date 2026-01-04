import { MODULE_ID } from '../constants.js';
import { getLimits, clamp } from '../data.js';
import { getActorRep, setActorRep } from '../core/actors.js';
import { createBar, updateBar } from '../ui.js';

export class ReputationViewerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-reputation-viewer",
    classes: ["fame-reputation-viewer", "standard-form"],
    position: { width: 400, height: "auto" },
    window: { icon: "fa-solid fa-star", resizable: false }
  };

  static PARTS = { content: { template: null } };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  get title() {
    return `${game.i18n.localize(`${MODULE_ID}.reputation.window-title`)} - ${this.actor.name}`;
  }

  async _prepareContext() {
    const { min, max } = getLimits();
    return {
      actor: this.actor,
      reputation: getActorRep(this.actor.id),
      isGM: game.user.isGM,
      min,
      max
    };
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-viewer-content";

    div.innerHTML = `
      <div class="fame-form-group">
        <label>${game.i18n.localize(`${MODULE_ID}.reputation.current-label`)}</label>
        ${createBar(context.reputation, context.min, context.max, context.isGM, this.actor.id, 'actor')}
      </div>
      ${context.isGM ? `
        <button type="button" class="fame-reset-btn" data-action="reset">
          <i class="fa-solid fa-rotate-left"></i>
        </button>
      ` : ''}
    `;

    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
  }

  _attachListeners(html) {
    const slider = html.querySelector('.fame-bar-slider');

    if (slider) {
      slider.addEventListener('input', e => {
        updateBar(e.target.closest('.fame-bar-container'), +e.target.value);
      });
      slider.addEventListener('change', async e => {
        await setActorRep(this.actor.id, +e.target.value);
      });
    }

    html.querySelectorAll('.fame-bar-val').forEach(input => {
      input.addEventListener('change', async e => {
        const value = clamp(+e.target.value || 0);
        updateBar(e.target.closest('.fame-bar-container'), value);
        await setActorRep(this.actor.id, value);
      });
    });

    html.querySelectorAll('.fame-bar-adj').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const container = e.currentTarget.closest('.fame-bar-container');
        const input = container.querySelector('.fame-bar-val');
        const delta = e.currentTarget.classList.contains('fame-plus') ? 1 : -1;
        const value = clamp((+input.value || 0) + delta);
        updateBar(container, value);
        await setActorRep(this.actor.id, value);
      });
    });

    html.querySelector('.fame-reset-btn')?.addEventListener('click', async () => {
      await setActorRep(this.actor.id, 0);
      this.render();
    });
  }

  static open(actor) {
    if (actor) new ReputationViewerApp(actor).render(true);
  }
}