import { api, getAuthState, setAuthState } from './api.js';
import { setRedirect, getRedirect } from './redirect-store.js';

const routes = {};
const routePermissions = {};
let scanHandler = null;
let currentPage = null;

export function getPendingRedirect() {
  return getRedirect();
}

export function registerRoute(hash, fn, requiredPermission) {
  routes[hash] = fn;
  if (requiredPermission) routePermissions[hash] = requiredPermission;
}

export function registerScanRoute(fn) {
  scanHandler = fn;
}

export function navigate(hash) {
  window.location.hash = hash;
}

// Helper to check if a route pattern matches a hash and extract parameters
function matchRoute(hash, pattern) {
  if (!pattern.includes(':')) {
    return hash === pattern;
  }

  const patternParts = pattern.split('/');
  const hashParts = hash.split('/');

  if (patternParts.length !== hashParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const hashPart = hashParts[i];

    if (patternPart.startsWith(':')) {
      // Parameter match - always valid
      continue;
    }

    if (patternPart !== hashPart) {
      return false;
    }
  }

  return true;
}

export function initRouter() {
  async function handle() {
    const hash = window.location.hash || '#/login';
    const isPublic = hash === '#/login' || hash === '#/setup' || hash === '#/clock' || hash === '#/datenschutz';

    if (!isPublic) {
      let authState = getAuthState();
      if (authState === null) {
        const user = await api.me().catch(() => null);
        authState = !!user;
        setAuthState(authState);
      }
      if (!authState) {
        setRedirect(hash);
        window.location.hash = '#/login';
        return;
      }
    }

    if (hash.startsWith('#/scan/') && scanHandler) {
      const token = hash.slice('#/scan/'.length);
      if (currentPage) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.sidebar__item').forEach(b => b.classList.remove('active'));
      }
      currentPage = hash;
      scanHandler(token);
      return;
    }

    // Find matching route with pattern support
    let handler = null;
    let matchedPattern = null;

    // Try exact match first
    if (routes[hash]) {
      handler = routes[hash];
      matchedPattern = hash;
    } else {
      // Try pattern match
      for (const pattern in routes) {
        if (matchRoute(hash, pattern)) {
          handler = routes[pattern];
          matchedPattern = pattern;
          break;
        }
      }
    }

    if (handler) {
      const requiredPerm = routePermissions[matchedPattern];
      if (requiredPerm) {
        const user = await api.me().catch(() => null);
        const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
        const perms = user?.permissions || [];
        const allowed = Array.isArray(requiredPerm) ? requiredPerm : [requiredPerm];
        const hasPerm = isAdmin || allowed.some(p => perms.includes(p));
        if (!hasPerm) {
          window.location.hash = '#/';
          return;
        }
      }

      handler();

      if (currentPage) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.sidebar__item').forEach(b => b.classList.remove('active'));
      }
      currentPage = hash;
    }
  }

  window.addEventListener('hashchange', handle);
  handle();
}