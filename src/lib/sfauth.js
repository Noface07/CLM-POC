// Signing in to Salesforce from the browser.
//
// OAuth 2.0 authorization code with PKCE, as a public client. The consumer key is in the
// page and that is fine: PKCE is the design for clients that cannot keep a secret, and a
// browser cannot. What it buys over a pasted session token is a refresh token, so a 401
// is something this module handles rather than something the user sees.
//
// What it does not buy is stated plainly on the panel and in the README. The access token
// still lives in the browser, readable by anything on the page. This is enough to prove
// the integration against an org you own. In production the call and the credential
// belong on a server, and nothing here changes that.
//
// Every function takes its dependencies as arguments where it matters — storage, the URL,
// navigation — so the flow is testable without a window.

const KEY = "clm-sf-oauth-v1";
const PENDING = "clm-sf-oauth-pending";

// ---------- token store ----------

export function readOAuth(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeOAuth(tokens, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(tokens));
    return true;
  } catch {
    return false;
  }
}

export function clearOAuth(storage = globalThis.localStorage) {
  try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function isSignedIn(storage = globalThis.localStorage) {
  return Boolean(readOAuth(storage)?.refreshToken);
}

// ---------- PKCE ----------

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomVerifier(length = 64) {
  // RFC 7636: 43 to 128 characters from the unreserved set. 48 random bytes make 64.
  const bytes = new Uint8Array(Math.ceil((length * 3) / 4));
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, length);
}

export async function challengeFor(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

// ---------- the flow ----------

/**
 * Where Salesforce sends the browser back to: the root of wherever the app is served,
 * with a trailing slash, because that is what the Connected App's callback list holds
 * and Salesforce matches it exactly.
 */
export function redirectUriFor(location = globalThis.location) {
  return new URL(".", location.href).href;
}

/**
 * Start the sign-in. Generates the PKCE pair and a state nonce, parks them for the
 * return trip, and navigates to the authorize endpoint. Nothing comes back from this
 * call: the page is leaving.
 *
 * @param {object} cfg  { loginUrl, clientId, redirectUri, returnTo? }
 */
export async function beginLogin(cfg, deps = {}) {
  const storage = deps.storage || globalThis.sessionStorage;
  const navigate = deps.navigate || ((url) => { globalThis.location.assign(url); });

  if (!cfg.clientId) throw new Error("No consumer key. Set VITE_SF_CLIENT_ID or enter one in the settings.");
  if (!cfg.loginUrl) throw new Error("No login URL. Set VITE_SALESFORCE_URL to the org's My Domain.");

  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);
  const state = randomVerifier(32);

  storage.setItem(PENDING, JSON.stringify({ verifier, state, returnTo: cfg.returnTo || null }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "api refresh_token openid",
    state,
  });
  navigate(cfg.loginUrl.replace(/\/$/, "") + "/services/oauth2/authorize?" + params.toString());
}

/** Whether the current URL is Salesforce sending the browser back. */
export function pendingCallback(location = globalThis.location) {
  const q = new URLSearchParams(location.search || "");
  return Boolean((q.get("code") && q.get("state")) || q.get("error"));
}

/**
 * Finish the sign-in. Verifies the state, exchanges the code for tokens through the
 * token endpoint, and stores the result.
 *
 * @param {object} cfg  { tokenUrl, clientId, redirectUri }
 * @returns {{ tokens, returnTo }}
 */
export async function completeLogin(cfg, deps = {}) {
  const storage = deps.storage || globalThis.sessionStorage;
  const tokenStore = deps.tokenStore || globalThis.localStorage;
  const location = deps.location || globalThis.location;
  const fetchFn = deps.fetch || globalThis.fetch;

  const q = new URLSearchParams(location.search || "");
  if (q.get("error")) {
    storage.removeItem(PENDING);
    throw new Error("Salesforce refused the sign-in: " + (q.get("error_description") || q.get("error")));
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) throw new Error("No authorization code in the URL.");

  let pending = null;
  try { pending = JSON.parse(storage.getItem(PENDING) || "null"); } catch { /* treated as missing */ }
  storage.removeItem(PENDING);
  if (!pending) throw new Error("This sign-in was not started from this browser tab. Start again.");
  // The state is the CSRF check: a code arriving with a state we did not issue is
  // somebody else's sign-in, and exchanging it would bind their session to this page.
  if (pending.state !== state) throw new Error("Sign-in state did not match. Start again.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_verifier: pending.verifier,
  });
  const res = await fetchFn(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error("Token exchange failed: " + (data.error_description || data.error || res.status));
  }

  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    instanceUrl: data.instance_url || null,
    identityUrl: data.id || null,
    issuedAt: Date.now(),
  };
  writeOAuth(tokens, tokenStore);
  return { tokens, returnTo: pending.returnTo || null };
}

/**
 * Trade the refresh token for a new access token. Called by the API client on a 401;
 * a person never has to.
 */
export async function refreshAccessToken(cfg, deps = {}) {
  const tokenStore = deps.tokenStore || globalThis.localStorage;
  const fetchFn = deps.fetch || globalThis.fetch;

  const current = readOAuth(tokenStore);
  if (!current?.refreshToken) throw new Error("Not signed in.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: cfg.clientId,
  });
  const res = await fetchFn(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // A refresh token that no longer works is a session that has ended: revoked in the
    // org, or expired by the app's policy. Forget it, so the panel offers sign-in again
    // rather than looping on a dead credential.
    clearOAuth(tokenStore);
    throw new Error("Session ended: " + (data.error_description || data.error || res.status) + ". Sign in again.");
  }
  const next = {
    ...current,
    accessToken: data.access_token,
    instanceUrl: data.instance_url || current.instanceUrl,
    issuedAt: Date.now(),
  };
  writeOAuth(next, tokenStore);
  return next;
}

/** Sign out: revoke the refresh token at the org, then forget it locally either way. */
export async function signOut(cfg, deps = {}) {
  const tokenStore = deps.tokenStore || globalThis.localStorage;
  const fetchFn = deps.fetch || globalThis.fetch;
  const current = readOAuth(tokenStore);
  clearOAuth(tokenStore);
  if (!current?.refreshToken || !cfg.revokeUrl) return;
  try {
    await fetchFn(cfg.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: current.refreshToken }).toString(),
    });
  } catch {
    // The org may be unreachable. The local credential is gone regardless, which is the
    // part that matters to the person who clicked Disconnect.
  }
}

/** Who is signed in, for the panel to show. */
export async function fetchUserInfo(cfg, deps = {}) {
  const tokenStore = deps.tokenStore || globalThis.localStorage;
  const fetchFn = deps.fetch || globalThis.fetch;
  const current = readOAuth(tokenStore);
  if (!current?.accessToken) return null;
  const res = await fetchFn(cfg.userInfoUrl, { headers: { Authorization: "Bearer " + current.accessToken } });
  if (!res.ok) return null;
  const u = await res.json();
  return { name: u.name, email: u.email, username: u.preferred_username, orgId: u.organization_id };
}
