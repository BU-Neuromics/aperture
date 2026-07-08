import { resolveEndpoint } from '../data/endpoint';
import { runtimeEnv } from './runtime';

type ConfigWindow = { __APERTURE_CONFIG__?: unknown };

afterEach(() => {
  delete (globalThis as ConfigWindow).__APERTURE_CONFIG__;
});

describe('runtime config overlay (issue #22)', () => {
  it('is a no-op when window.__APERTURE_CONFIG__ is absent', () => {
    expect(resolveEndpoint(runtimeEnv())).toEqual({ url: null });
  });

  it('runtime values override the build-time env', () => {
    (globalThis as ConfigWindow).__APERTURE_CONFIG__ = {
      VITE_HIPPO_GRAPHQL_URL: 'http://runtime.test/graphql',
    };
    expect(resolveEndpoint(runtimeEnv())).toEqual({ url: 'http://runtime.test/graphql' });
  });

  it('ignores a malformed overlay', () => {
    (globalThis as ConfigWindow).__APERTURE_CONFIG__ = 'not-an-object';
    expect(resolveEndpoint(runtimeEnv())).toEqual({ url: null });
  });
});
