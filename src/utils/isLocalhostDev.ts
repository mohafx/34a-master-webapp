export function isLocalhostDev() {
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  return import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
}
