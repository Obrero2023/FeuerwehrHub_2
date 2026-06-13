// ── Logo-Manager ──────────────────────────────────────────────────────────────
// Verwaltet das Wappen/Logo der Organisation (localStorage-basiert).
// Standard: FH-Monogramm im Kreis.

const LS_KEY = 'ff_custom_logo';

/**
 * Gibt das Logo-HTML für den Header-Emblem-Bereich zurück.
 * Bei eigenem Wappen: <img>-Tag, sonst: FH-Monogramm in Rot.
 */
export function getHeaderLogo() {
  const custom = localStorage.getItem(LS_KEY);
  if (custom) {
    return `<img src="${custom}" alt="Wappen" style="width:28px;height:28px;object-fit:contain;">`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#e63022" stroke-width="1.8" fill="#e63022" fill-opacity="0.08"/>
    <text x="12" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
      font-weight="800" font-size="11" fill="#e63022" letter-spacing="-0.5">FH</text>
  </svg>`;
}

/**
 * Gibt das Logo-HTML für die Login-Seite (Auth-Emblem) zurück.
 * Bei eigenem Wappen: <img>-Tag, sonst: FH-Monogramm in Weiß.
 */
export function getLoginLogo() {
  const custom = localStorage.getItem(LS_KEY);
  if (custom) {
    return `<img src="${custom}" alt="Wappen" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">`;
  }
  return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="white" stroke-width="1.8" fill="white" fill-opacity="0.1"/>
    <text x="12" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
      font-weight="800" font-size="11" fill="white" letter-spacing="-0.5">FH</text>
  </svg>`;
}

/** Speichert ein Base64-Bild als Custom-Logo. */
export function saveCustomLogo(base64) {
  localStorage.setItem(LS_KEY, base64);
}

/** Entfernt das Custom-Logo (FH-Standard wird wieder aktiv). */
export function removeCustomLogo() {
  localStorage.removeItem(LS_KEY);
}

/** Gibt true zurück, wenn ein Custom-Logo gesetzt ist. */
export function hasCustomLogo() {
  return !!localStorage.getItem(LS_KEY);
}
