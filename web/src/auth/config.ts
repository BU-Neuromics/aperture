import { runtimeEnv } from '../config/runtime';

/**
 * Identity configuration (ADR-0038). Aperture never authenticates — it reads an
 * identity endpoint supplied by an authenticating proxy in front of it and
 * presents the result. Everything here arrives through the ADR-0034 runtime
 * overlay, so one image serves an authenticated and an unauthenticated
 * deployment.
 *
 * NOTE: every `VITE_AUTH_*` name below must also appear in the allowlist in
 * `web/docker/40-aperture-config.sh`, or the container silently drops it and
 * the app comes up looking unauthenticated.
 */
export type AuthMode = 'none' | 'proxy';

export interface AuthConfig {
  mode: AuthMode;
  /** Same-origin JSON endpoint returning the viewer's claims. */
  identityUrl: string;
  /** Where a top-level navigation goes to start a sign-in. */
  loginUrl: string;
  /** Where a top-level navigation goes to sign out; null hides the affordance. */
  logoutUrl: string | null;
  /**
   * Explicit claim to use as the viewer's stable identity. Null → probe
   * IDENTITY_CLAIMS in order. Pin this before a deployment accumulates
   * control-plane documents (ADR-0038).
   */
  identityClaim: string | null;
  /** Explicit claim for the display name; null → probe DISPLAY_CLAIMS. */
  displayClaim: string | null;
}

/**
 * Probe order for the stable identity. `email` is deliberately ABSENT: the
 * chosen claim becomes the `owner` on every control-plane document (ADR-0032),
 * and email addresses change — a changed address silently orphans that user's
 * saved views. VA guidance is explicit: key on UPN or EDIPI, never email.
 */
export const IDENTITY_CLAIMS = ['preferredUsername', 'upn', 'edipi', 'sub', 'user'] as const;

/** Display is cosmetic, so email is acceptable here as a last resort. */
export const DISPLAY_CLAIMS = ['name', 'displayName', 'preferredUsername', 'user', 'email'] as const;

const DEFAULTS = {
  identityUrl: '/oauth2/userinfo',
  loginUrl: '/oauth2/start',
  logoutUrl: '/oauth2/sign_out',
} as const;

function str(env: Record<string, unknown>, key: string): string | null {
  const raw = env[key];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export function resolveAuthConfig(env: Record<string, unknown> = runtimeEnv()): AuthConfig {
  // Anything other than an explicit 'proxy' is off. An unrecognized value must
  // not silently enable auth UI against an endpoint that isn't there.
  const mode: AuthMode = str(env, 'VITE_AUTH_MODE') === 'proxy' ? 'proxy' : 'none';
  return {
    mode,
    identityUrl: str(env, 'VITE_AUTH_IDENTITY_URL') ?? DEFAULTS.identityUrl,
    loginUrl: str(env, 'VITE_AUTH_LOGIN_URL') ?? DEFAULTS.loginUrl,
    logoutUrl: str(env, 'VITE_AUTH_LOGOUT_URL') ?? DEFAULTS.logoutUrl,
    identityClaim: str(env, 'VITE_AUTH_IDENTITY_CLAIM'),
    displayClaim: str(env, 'VITE_AUTH_DISPLAY_CLAIM'),
  };
}

/** The claims document an identity endpoint returns. Shape is deployment-specific. */
export type Claims = Record<string, unknown>;

function claimString(claims: Claims, key: string): string | null {
  const value = claims[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The viewer's stable identity, or null when no usable claim is present.
 *
 * Null is a hard error state, NOT a fallback (ADR-0038): quietly keying on
 * something plausible — `email` above all — would bind every document to a
 * value that changes.
 */
export function resolveIdentity(claims: Claims, config: AuthConfig): string | null {
  if (config.identityClaim) return claimString(claims, config.identityClaim);
  for (const key of IDENTITY_CLAIMS) {
    const value = claimString(claims, key);
    if (value) return value;
  }
  return null;
}

/** A human-readable label. Falls back to the identity, which always displays. */
export function resolveDisplayName(claims: Claims, config: AuthConfig, identity: string): string {
  if (config.displayClaim) return claimString(claims, config.displayClaim) ?? identity;
  for (const key of DISPLAY_CLAIMS) {
    const value = claimString(claims, key);
    if (value) return value;
  }
  return identity;
}

/** Groups, when the endpoint releases them. Authorization is never Aperture's. */
export function resolveGroups(claims: Claims): string[] {
  const raw = claims['groups'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is string => typeof g === 'string');
}
