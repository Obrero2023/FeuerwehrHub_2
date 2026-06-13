import { api, getAuthState, setAuthState } from './api.js';

const routes = {};
const routePermissions = {};
let scanHandler = null;
let currentPage = null;

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

    const handler = routes[hash] || routes['*'];
    if (handler) {
      const requiredPerm = routePermissions[hash];
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

      if (currentPage) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.sidebar__item').forEach(b => b.classList.remove('active'));
      }
      currentPage = hash;
      handler();
    }
  }

  window.addEventListener('hashchange', handle);
  handle();
}
