// Foldable detail sections for the administration dashboard: one summary line (title + key figure)
// and a «عرض ▾ / إخفاء ▴» control. Closed the first time; each section remembers the viewer's
// choice in this browser. Printing opens every section, then restores them.

const KEY = 'yassarnah.fold.';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function remembered(id) {
  try { return localStorage.getItem(KEY + id) === 'open'; } catch { return false; }
}
function remember(id, open) {
  try { open ? localStorage.setItem(KEY + id, 'open') : localStorage.removeItem(KEY + id); } catch { /* private mode: the default applies */ }
}

// summary is HTML that the caller has already escaped (it may hold <b> for the key figure).
export function foldOpen(id, title, summary = '') {
  return `<details class="fold-section" data-fold="${escape(id)}"${remembered(id) ? ' open' : ''}><summary class="fold-head"><span class="fold-title"><strong>${escape(title)}</strong>${summary ? `<span class="fold-summary">${summary}</span>` : ''}</span><span class="fold-toggle" aria-hidden="true"><span class="when-closed">عرض ▾</span><span class="when-open">إخفاء ▴</span></span></summary><div class="fold-body">`;
}
export const foldClose = () => '</div></details>';
export const foldSection = (id, title, summary, body) => foldOpen(id, title, summary) + body + foldClose();

// Once per dashboard root: remember toggles, and open everything while printing.
export function bindFoldMemory(root) {
  root.addEventListener('toggle', event => {
    const id = event.target?.dataset?.fold;
    if (id && !event.target.dataset.printing) remember(id, event.target.open);
  }, true);
  let reopened = [];
  const beforePrint = () => {
    reopened = [...root.querySelectorAll('details.fold-section:not([open])')];
    reopened.forEach(section => { section.dataset.printing = '1'; section.open = true; });
  };
  const afterPrint = () => {
    reopened.forEach(section => { section.open = false; setTimeout(() => delete section.dataset.printing, 400); });
    reopened = [];
  };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  return () => { window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint); };
}
