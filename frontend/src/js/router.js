import { api, getAuthState, setAuthState } from './api.js';

const routes = {};
const routePermissions = {};
let scanHandler = null;
let currentPage = null;

export function registerParamRoute(pattern, fn) {
  // Konvertiere z.B. "#/lehrgang/:id" in einen RegExp
  const regexPattern = pattern.replace(/:([^/]+)/g, '([^/]+)');
  const regex = new RegExp(`^${regexPattern}$`);
  routes[pattern] = { fn, regex };
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

    // Handler auflösen: erst statische, dann parametrisierte Routen
    let handler = null;
    let match = null;
    let params = {};
    let requiredPerm = null;

    const handlerStatic = routes[hash];
    if (handlerStatic && typeof handlerStatic === 'function') {
      handler = handlerStatic;
      requiredPerm = routePermissions[hash];
    } else {
      // Prüfe parametrisierte Routen (Objekte mit {fn, regex})
      for (const [pattern, routeObj] of Object.entries(routes)) {
        if (routeObj && routeObj.regex) {
          match = hash.match(routeObj.regex);
          if (match) {
            handler = routeObj.fn;
            const paramNames = pattern.match(/:([^/]+)/g) || [];
            paramNames.forEach((param, i) => {
              params[param.slice(1)] = match[i + 1];
            });
            requiredPerm = routePermissions[pattern];
            break;
          }
        }
      }
    }
    if (!handler) handler = routes['*'];

    if (handler) {
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
      handler(params);
    }
  }

  window.addEventListener('hashchange', handle);
  handle();
}
