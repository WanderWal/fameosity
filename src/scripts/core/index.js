export * from './actors.js';
export * from './relations.js';
export * from './visibility.js';
export * from './factions.js';
export * from './locations.js';
export * from './notifications.js';

export async function confirmDelete(title, content) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title },
    content: `<p>${content}</p>`,
    yes: { default: true },
    no: { default: false }
  });
}