export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Returns null when the OAuth portal URL is not configured (local/production
// deployments that use local auth instead of Manus OAuth).
export const getLoginUrl = (): string | null => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // If OAuth is not configured, return null — callers must handle this case
  // and redirect to /login instead of the OAuth portal.
  if (!oauthPortalUrl || oauthPortalUrl === "http://localhost" || !appId) {
    return null;
  }

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch {
    // Fallback: if URL construction fails for any reason, return null
    return null;
  }
};
