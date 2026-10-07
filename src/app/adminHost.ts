import { adminPreviewPath, isAdminPreview } from './adminPreview';

const configuredAdminUrl = import.meta.env.VITE_ADMIN_URL || 'https://admin.artocamello.com';
const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://artocamello.com';

function isLocalDevelopmentHost() {
  return import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export function adminUrl(path = '/') {
  if (isLocalDevelopmentHost()) return new URL(adminPreviewPath(path), window.location.origin).toString();
  return new URL(path, configuredAdminUrl).toString();
}

export function publicAppUrl(path = '/') {
  if (isLocalDevelopmentHost()) return new URL(path, window.location.origin).toString();
  return new URL(path, configuredPublicUrl).toString();
}

export function isAdminHost() {
  return window.location.hostname === new URL(configuredAdminUrl).hostname
    || (import.meta.env.DEV && window.location.hostname === 'admin.localhost')
    || (import.meta.env.DEV && isAdminPreview(window.location.hostname, window.location.pathname));
}

export function isLocalAdminPreview() {
  return import.meta.env.DEV && isAdminPreview(window.location.hostname, window.location.pathname);
}
