const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isAdminDemoAvailable(isDevelopment: boolean) {
  return isDevelopment;
}

export function isAdminPreview(hostname: string, pathname: string) {
  return LOCAL_HOSTS.has(hostname) && (pathname === '/admin' || pathname.startsWith('/admin/'));
}

export function adminPreviewPath(path = '/') {
  const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/admin${normalizedPath}`;
}
