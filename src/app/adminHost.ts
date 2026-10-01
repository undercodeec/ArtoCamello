const configuredAdminUrl = import.meta.env.VITE_ADMIN_URL || 'https://admin.artocamello.com';
const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://artocamello.com';

export function adminUrl(path = '/') {
  return new URL(path, configuredAdminUrl).toString();
}

export function publicAppUrl(path = '/') {
  return new URL(path, configuredPublicUrl).toString();
}

export function isAdminHost() {
  return window.location.hostname === new URL(configuredAdminUrl).hostname;
}
