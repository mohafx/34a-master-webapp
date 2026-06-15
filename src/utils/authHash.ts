// Supabase delivers auth tokens (email confirmation & password recovery) in the
// URL *hash fragment* (implicit flow). Because this app uses HashRouter, the
// redirect URL itself already contains a hash route (e.g. "#/reset-password"),
// so GoTrue produces a DOUBLE-hash URL:
//
//   https://app.34a-master.de/#/reset-password#access_token=...&type=recovery
//
// In that string the browser's `location.hash` is the whole
// "#/reset-password#access_token=...". Supabase's built-in `detectSessionInUrl`
// splits the fragment on "&" and reads "key=value" pairs, so the first pair
// becomes "/reset-password#access_token" — it never finds a clean `access_token`
// key and therefore fails to establish the session. We parse it ourselves from
// the LAST "#" segment, which is robust for both the single- and double-hash
// shapes.

export interface AuthHashTokens {
  access_token: string | null;
  refresh_token: string | null;
  type: string | null;
}

export function parseAuthTokensFromHash(hash: string = window.location.hash): AuthHashTokens {
  const empty: AuthHashTokens = { access_token: null, refresh_token: null, type: null };
  if (!hash) return empty;

  // Take everything after the LAST '#'. For "#/reset-password#access_token=..."
  // this yields "access_token=...". For a plain "#access_token=..." it yields the
  // same. For a tokenless route like "#/reset-password" it yields
  // "/reset-password" which has no access_token param → empty result.
  const lastHashIdx = hash.lastIndexOf('#');
  const fragment = lastHashIdx >= 0 ? hash.slice(lastHashIdx + 1) : hash;

  const params = new URLSearchParams(fragment);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    type: params.get('type'),
  };
}
