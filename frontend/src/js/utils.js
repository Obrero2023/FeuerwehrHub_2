/**
 * HTML-escaping für sichere innerHTML-Ausgabe.
 * Escaped &, <, >, " und ' um XSS in Text-Content und Attributen zu verhindern.
 */
export function formatDate(d) {
  if (!d) return '–';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
