/** Speichert die gewünschte Ziel-Hash-URL vor einer Umleitung zur Login-Seite. */
let pendingRedirectHash = null;

export function setRedirect(hash) {
  pendingRedirectHash = hash;
}

export function getRedirect() {
  const hash = pendingRedirectHash;
  pendingRedirectHash = null;
  return hash;
}