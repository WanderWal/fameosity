import { getLimits, clamp, getRepColor, getTier, escapeHtml } from './data.js';

export function createBar(value, min, max, editable = false, dataId = "", dataType = "", auto = false, showAutoBtn = false, compact = false, hybrid = false) {
  const color = getRepColor(value);
  const percentage = ((value - min) / (max - min)) * 100;
  const midPercentage = ((0 - min) / (max - min)) * 100;
  const hybridMaxPercentage = hybrid ? ((Math.floor(max / 2) - min) / (max - min)) * 100 : 100;

  const barHtml = `
    <div class="fame-bar${hybrid ? ' hybrid-mode' : ''}">
      <div class="fame-bar-track">
        <div class="fame-bar-zero" style="left:${midPercentage}%"></div>
        ${hybrid ? `<div class="fame-bar-hybrid-limit" style="left:${hybridMaxPercentage}%"></div>` : ''}
        <div class="fame-bar-fill" style="left:${Math.min(midPercentage, percentage)}%;width:${Math.abs(percentage - midPercentage)}%;background:${color}"></div>
        <div class="fame-bar-thumb" style="left:${percentage}%;background:${color}"></div>
      </div>
      ${editable && !auto ? `<input type="range" class="fame-bar-slider" min="${min}" max="${max}" value="${value}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-hybrid="${hybrid}">` : ''}
    </div>
  `;

  const controlsHtml = editable
    ? `
      <div class="fame-bar-controls">
        <button type="button" class="fame-bar-adj fame-minus" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" ${auto ? 'disabled' : ''}>
          <i class="fa-solid fa-minus"></i>
        </button>
        <input type="number" class="fame-bar-val" value="${value}" min="${min}" max="${max}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-hybrid="${hybrid}" style="color:${color}" ${auto ? 'readonly' : ''}>
        <button type="button" class="fame-bar-adj fame-plus" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" ${auto ? 'disabled' : ''}>
          <i class="fa-solid fa-plus"></i>
        </button>
        ${showAutoBtn ? `
          <button type="button" class="fame-auto-btn fame-icon-btn ${auto ? 'active' : ''}" data-id="${escapeHtml(dataId)}" data-type="${dataType === 'faction' ? 'faction' : 'actor'}">
            <i class="fa-solid fa-calculator"></i>
          </button>
        ` : ''}
      </div>
    `
    : `<span class="fame-bar-value" style="color:${color}">${value > 0 ? '+' : ''}${value}</span>`;

  return `
    <div class="fame-bar-container ${auto ? 'auto-mode' : ''} ${compact ? 'compact' : ''} ${hybrid ? 'hybrid-mode' : ''}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}">
      ${!compact ? `<span class="fame-bar-min">${min}</span>` : ''}
      ${barHtml}
      ${!compact ? `<span class="fame-bar-max">${max}</span>` : ''}
      ${controlsHtml}
    </div>
  `;
}

export function updateBar(container, value) {
  const { min, max } = getLimits();
  value = clamp(value);

  const color = getRepColor(value);
  const percentage = ((value - min) / (max - min)) * 100;
  const midPercentage = ((0 - min) / (max - min)) * 100;
  const tier = getTier(value);

  const fill = container.querySelector('.fame-bar-fill');
  fill.style.left = `${Math.min(midPercentage, percentage)}%`;
  fill.style.width = `${Math.abs(percentage - midPercentage)}%`;
  fill.style.background = color;

  const thumb = container.querySelector('.fame-bar-thumb');
  thumb.style.left = `${percentage}%`;
  thumb.style.background = color;

  const valueInput = container.querySelector('.fame-bar-val');
  if (valueInput) {
    valueInput.value = value;
    valueInput.style.color = color;
  }

  const valueSpan = container.querySelector('.fame-bar-value');
  if (valueSpan) {
    valueSpan.textContent = value > 0 ? `+${value}` : value;
    valueSpan.style.color = color;
  }

  const slider = container.querySelector('.fame-bar-slider');
  if (slider) slider.value = value;

  const badge = container.closest('.fame-entity-item, .fame-relation-item')?.querySelector('.fame-tier-badge');
  if (badge) {
    badge.textContent = tier.name;
    badge.style.background = tier.color;
    badge.dataset.value = value;
  }
}