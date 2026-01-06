import { getLimits, clamp, getRepColor, getTier, escapeHtml } from './data.js';

export function createBar(value, min, max, editable = false, dataId = "", dataType = "", mode = "manual", showModeBtn = false, compact = false) {
  const color = getRepColor(value);
  const percentage = ((value - min) / (max - min)) * 100;
  const midPercentage = ((0 - min) / (max - min)) * 100;
  
  const isAuto = mode === 'auto';
  const isHybrid = mode === 'hybrid';
  const sliderDisabled = isAuto || isHybrid;

  const barHtml = `
    <div class="fame-bar${isHybrid ? ' hybrid-mode' : ''}">
      <div class="fame-bar-track">
        <div class="fame-bar-zero" style="left:${midPercentage}%"></div>
        <div class="fame-bar-fill" style="left:${Math.min(midPercentage, percentage)}%;width:${Math.abs(percentage - midPercentage)}%;background:${color}"></div>
        <div class="fame-bar-thumb" style="left:${percentage}%;background:${color}"></div>
      </div>
      ${editable && !sliderDisabled ? `<input type="range" class="fame-bar-slider" min="${min}" max="${max}" value="${value}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-mode="${mode}">` : ''}
    </div>
  `;

  const controlsHtml = editable
    ? `
      <div class="fame-bar-controls">
        <button type="button" class="fame-bar-adj fame-minus" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-mode="${mode}">
          <i class="fa-solid fa-minus"></i>
        </button>
        <input type="number" class="fame-bar-val" value="${value}" min="${min}" max="${max}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-mode="${mode}" style="color:${color}" ${sliderDisabled ? 'readonly' : ''}>
        <button type="button" class="fame-bar-adj fame-plus" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-mode="${mode}">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    `
    : `<span class="fame-bar-value" style="color:${color}">${value > 0 ? '+' : ''}${value}</span>`;

  return `
    <div class="fame-bar-container ${isAuto ? 'auto-mode' : ''} ${isHybrid ? 'hybrid-mode' : ''} ${compact ? 'compact' : ''}" data-id="${escapeHtml(dataId)}" data-type="${escapeHtml(dataType)}" data-mode="${mode}">
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
    badge.style.setProperty('--text-length', tier.name.length);
  }
}

export function renderTierBadge(tier, small = false) {
  const cls = small ? 'fame-tier-badge small' : 'fame-tier-badge';
  return `<span class="${cls}" style="--text-length:${tier.name.length};background:${tier.color}">${escapeHtml(tier.name)}</span>`;
}