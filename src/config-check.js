// Is config.js filled in with something usable? Pure, so it is tested.
function jwtRole(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role ?? null;
  } catch { return null; }
}

/** 'ok', or why not: 'placeholder' | 'bad-url' | 'bad-key' | 'service-role'. */
export function checkConfig(config) {
  const url = config && config.supabaseUrl;
  const key = config && config.supabaseAnonKey;
  if (typeof url !== 'string' || typeof key !== 'string' || /YOUR-/.test(url + key) || !url || !key) return 'placeholder';
  if (!/^https:\/\/[a-z0-9-]{4,40}\.supabase\.co$/.test(url)) return 'bad-url';
  if (jwtRole(key) === 'service_role' || /service_role/i.test(key)) return 'service-role';
  if (key.length < 20 || /\s/.test(key)) return 'bad-key';
  return 'ok';
}

export const isConfigured = (config) => checkConfig(config) === 'ok';
