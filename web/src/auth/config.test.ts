import {
  IDENTITY_CLAIMS,
  resolveAuthConfig,
  resolveDisplayName,
  resolveGroups,
  resolveIdentity,
} from './config';

describe('resolveAuthConfig (ADR-0034 overlay → ADR-0038)', () => {
  it('is off unless explicitly set to proxy', () => {
    expect(resolveAuthConfig({}).mode).toBe('none');
    expect(resolveAuthConfig({ VITE_AUTH_MODE: '' }).mode).toBe('none');
    // An unrecognized value must not light up auth UI against an endpoint
    // that isn't there.
    expect(resolveAuthConfig({ VITE_AUTH_MODE: 'oidc' }).mode).toBe('none');
    expect(resolveAuthConfig({ VITE_AUTH_MODE: 'proxy' }).mode).toBe('proxy');
  });

  it('defaults the routes to the proxy convention and lets each be overridden', () => {
    const defaults = resolveAuthConfig({ VITE_AUTH_MODE: 'proxy' });
    expect(defaults.identityUrl).toBe('/oauth2/userinfo');
    expect(defaults.loginUrl).toBe('/oauth2/start');
    expect(defaults.logoutUrl).toBe('/oauth2/sign_out');

    const custom = resolveAuthConfig({
      VITE_AUTH_MODE: 'proxy',
      VITE_AUTH_IDENTITY_URL: '/auth/me',
      VITE_AUTH_LOGIN_URL: '/auth/login',
      VITE_AUTH_LOGOUT_URL: '/auth/logout',
      VITE_AUTH_IDENTITY_CLAIM: 'edipi',
      VITE_AUTH_DISPLAY_CLAIM: 'name',
    });
    expect(custom.identityUrl).toBe('/auth/me');
    expect(custom.loginUrl).toBe('/auth/login');
    expect(custom.logoutUrl).toBe('/auth/logout');
    expect(custom.identityClaim).toBe('edipi');
    expect(custom.displayClaim).toBe('name');
  });
});

describe('resolveIdentity — the claim that becomes the document owner', () => {
  const config = resolveAuthConfig({ VITE_AUTH_MODE: 'proxy' });

  it('never keys on email, even when it is the only claim present', () => {
    // The chosen claim becomes `owner` on every control-plane document
    // (ADR-0032). Email changes; a changed email orphans that user's saved
    // views. So this is an error, not a fallback.
    expect(IDENTITY_CLAIMS).not.toContain('email');
    expect(resolveIdentity({ email: 'alice@va.gov' }, config)).toBeNull();
  });

  it('probes in order, preferring the stable claims', () => {
    expect(resolveIdentity({ sub: 'S-1', preferredUsername: 'alice' }, config)).toBe('alice');
    expect(resolveIdentity({ sub: 'S-1', user: 'alice' }, config)).toBe('S-1');
    expect(resolveIdentity({ upn: 'alice@va.gov', edipi: '123' }, config)).toBe('alice@va.gov');
  });

  it('honours an explicit claim and reports its absence rather than guessing', () => {
    const pinned = resolveAuthConfig({ VITE_AUTH_MODE: 'proxy', VITE_AUTH_IDENTITY_CLAIM: 'edipi' });
    expect(resolveIdentity({ edipi: '123', preferredUsername: 'alice' }, pinned)).toBe('123');
    // Pinned but missing → null, not a silent fall-through to the probe order.
    expect(resolveIdentity({ preferredUsername: 'alice' }, pinned)).toBeNull();
  });

  it('ignores blank and non-string claims', () => {
    expect(resolveIdentity({ preferredUsername: '  ' }, config)).toBeNull();
    expect(resolveIdentity({ preferredUsername: 42 }, config)).toBeNull();
    expect(resolveIdentity({ preferredUsername: '  alice  ' }, config)).toBe('alice');
  });
});

describe('display name and groups', () => {
  const config = resolveAuthConfig({ VITE_AUTH_MODE: 'proxy' });

  it('may use email for display — it is cosmetic, not a key', () => {
    expect(resolveDisplayName({ email: 'alice@va.gov' }, config, 'alice')).toBe('alice@va.gov');
    expect(resolveDisplayName({ name: 'Alice A' }, config, 'alice')).toBe('Alice A');
  });

  it('falls back to the identity, which always renders', () => {
    expect(resolveDisplayName({}, config, 'alice')).toBe('alice');
  });

  it('reads groups defensively — authorization is never Aperture\'s', () => {
    expect(resolveGroups({ groups: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(resolveGroups({ groups: ['a', 3, null] })).toEqual(['a']);
    expect(resolveGroups({ groups: 'a' })).toEqual([]);
    expect(resolveGroups({})).toEqual([]);
  });
});
