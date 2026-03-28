import { describe, expect, it } from 'vitest';
import { createAppAuthContext } from './auth.js';

/**
 * I lock the remote MCP auth contract so static bearer and OAuth metadata stay
 * separate and externally honest.
 */
describe('createAppAuthContext', () => {
  it('does not advertise OAuth metadata in static bearer mode', () => {
    const context = createAppAuthContext({
      auth: {
        authorizationEndpoint: 'https://auth.example.com/authorize',
        bearerToken: 'demo-token',
        issuerUrl: 'https://auth.example.com',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      defaultResourceServerUrl: 'http://127.0.0.1:17400/mcp',
    });

    expect(context.mode).toBe('static-bearer');
    expect(context.metadata).toBeUndefined();
  });

  it('defaults static bearer auth to read-only scopes', async () => {
    const context = createAppAuthContext({
      auth: {
        bearerToken: 'demo-token',
      },
      defaultResourceServerUrl: 'http://127.0.0.1:17400/mcp',
    });

    expect(context.mode).toBe('static-bearer');
    expect(context.canExposeWriteTools).toBe(false);
    const authInfo = await context.verifier?.verifyAccessToken('demo-token');
    expect(authInfo?.scopes).toEqual(['harmon.read']);
  });

  it('exposes write tools only when static bearer scopes actually include write access', async () => {
    const context = createAppAuthContext({
      auth: {
        bearerToken: 'demo-token',
        bearerTokenScopes: ['harmon.read', 'harmon.write'],
      },
      defaultResourceServerUrl: 'http://127.0.0.1:17400/mcp',
    });

    expect(context.mode).toBe('static-bearer');
    expect(context.canExposeWriteTools).toBe(true);
  });

  it('builds protected-resource metadata only for OAuth JWT mode', () => {
    const context = createAppAuthContext({
      auth: {
        audience: ['harmon-app'],
        authorizationEndpoint: 'https://auth.example.com/authorize',
        issuerUrl: 'https://auth.example.com',
        jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
        resourceServerUrl: 'http://127.0.0.1:17400/mcp',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      defaultResourceServerUrl: 'http://127.0.0.1:17400/mcp',
    });

    expect(context.mode).toBe('oauth-jwt');
    expect(context.canExposeWriteTools).toBe(true);
    expect(context.metadata?.oauthMetadata?.issuer).toBe('https://auth.example.com/');
    expect(context.metadata?.resourceServerUrl.href).toBe('http://127.0.0.1:17400/mcp');
  });

  it('requires an explicit public MCP URL for OAuth JWT mode', () => {
    expect(() => createAppAuthContext({
      auth: {
        audience: ['harmon-app'],
        authorizationEndpoint: 'https://auth.example.com/authorize',
        issuerUrl: 'https://auth.example.com',
        jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
        tokenEndpoint: 'https://auth.example.com/token',
      },
      defaultResourceServerUrl: 'http://127.0.0.1:17400/mcp',
    })).toThrow('HARMON_MCP_PUBLIC_URL is required for OAuth-enabled MCP auth.');
  });
});
