export const SSO_CALLBACK_PATH = "/sso-callback";

/** True when the webview is sitting on Clerk's OAuth return URL. */
export function isSsoCallbackPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === SSO_CALLBACK_PATH;
}
