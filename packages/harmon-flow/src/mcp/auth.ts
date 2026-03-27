/**
 * Auth helpers for the remote MCP app server.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthMetadataOptions } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface HarmonMcpAuthConfig {
  audience?: string[];
  authorizationEndpoint?: string;
  bearerToken?: string;
  bearerTokenScopes?: string[];
  issuerUrl?: string;
  jwksUrl?: string;
  readScopes?: string[];
  resourceName?: string;
  resourceServerUrl?: string;
  serviceDocumentationUrl?: string;
  tokenEndpoint?: string;
  writeScopes?: string[];
}

export interface HarmonMcpAuthContext {
  metadata?: AuthMetadataOptions;
  mode: 'none' | 'oauth-jwt' | 'static-bearer';
  readScopes: string[];
  verifier?: OAuthTokenVerifier;
  writeScopes: string[];
}

interface AppAuthContextOptions {
  auth?: HarmonMcpAuthConfig;
  defaultResourceServerUrl: string;
}

const DEFAULT_READ_SCOPES = ['harmon.read'];
const DEFAULT_WRITE_SCOPES = ['harmon.write'];

/**
 * I build the auth contract for the remote MCP server from config and env.
 */
export function createAppAuthContext(options: AppAuthContextOptions): HarmonMcpAuthContext {
  const auth = resolveAuthConfig(options.auth);
  const readScopes = auth.readScopes ?? DEFAULT_READ_SCOPES;
  const writeScopes = auth.writeScopes ?? DEFAULT_WRITE_SCOPES;
  const resourceServerUrl = auth.resourceServerUrl ?? options.defaultResourceServerUrl;

  if (auth.issuerUrl && auth.authorizationEndpoint && auth.tokenEndpoint && auth.jwksUrl) {
    return {
      metadata: createAuthMetadata(auth, resourceServerUrl, [...new Set([...readScopes, ...writeScopes])]),
      mode: 'oauth-jwt',
      readScopes,
      verifier: createJwtVerifier(auth),
      writeScopes,
    };
  }

  if (auth.bearerToken) {
    return {
      metadata: auth.issuerUrl && auth.authorizationEndpoint && auth.tokenEndpoint
        ? createAuthMetadata(auth, resourceServerUrl, [...new Set([...readScopes, ...writeScopes])])
        : undefined,
      mode: 'static-bearer',
      readScopes,
      verifier: createStaticVerifier(auth.bearerToken, auth.bearerTokenScopes ?? [...new Set([...readScopes, ...writeScopes])]),
      writeScopes,
    };
  }

  return {
    mode: 'none',
    readScopes: [],
    writeScopes: [],
  };
}

function resolveAuthConfig(config?: HarmonMcpAuthConfig): HarmonMcpAuthConfig {
  return {
    audience: config?.audience ?? splitEnv(process.env.HARMON_MCP_OAUTH_AUDIENCE),
    authorizationEndpoint: config?.authorizationEndpoint ?? process.env.HARMON_MCP_OAUTH_AUTHORIZATION_ENDPOINT,
    bearerToken: config?.bearerToken ?? process.env.HARMON_MCP_BEARER_TOKEN,
    bearerTokenScopes: config?.bearerTokenScopes ?? splitEnv(process.env.HARMON_MCP_BEARER_TOKEN_SCOPES),
    issuerUrl: config?.issuerUrl ?? process.env.HARMON_MCP_OAUTH_ISSUER_URL,
    jwksUrl: config?.jwksUrl ?? process.env.HARMON_MCP_OAUTH_JWKS_URL,
    readScopes: config?.readScopes ?? splitEnv(process.env.HARMON_MCP_READ_SCOPES),
    resourceName: config?.resourceName ?? process.env.HARMON_MCP_RESOURCE_NAME ?? 'Harmon MCP',
    resourceServerUrl: config?.resourceServerUrl ?? process.env.HARMON_MCP_PUBLIC_URL,
    serviceDocumentationUrl: config?.serviceDocumentationUrl ?? process.env.HARMON_MCP_SERVICE_DOCUMENTATION_URL,
    tokenEndpoint: config?.tokenEndpoint ?? process.env.HARMON_MCP_OAUTH_TOKEN_ENDPOINT,
    writeScopes: config?.writeScopes ?? splitEnv(process.env.HARMON_MCP_WRITE_SCOPES),
  };
}

function createAuthMetadata(
  auth: HarmonMcpAuthConfig,
  resourceServerUrl: string,
  scopesSupported: string[],
): AuthMetadataOptions {
  const issuer = requireUrl(auth.issuerUrl, 'HARMON_MCP_OAUTH_ISSUER_URL');
  const authorizationEndpoint = requireUrl(
    auth.authorizationEndpoint,
    'HARMON_MCP_OAUTH_AUTHORIZATION_ENDPOINT',
  );
  const tokenEndpoint = requireUrl(auth.tokenEndpoint, 'HARMON_MCP_OAUTH_TOKEN_ENDPOINT');

  return {
    oauthMetadata: {
      authorization_endpoint: authorizationEndpoint.href,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      issuer: issuer.href,
      response_types_supported: ['code'],
      scopes_supported: scopesSupported,
      service_documentation: auth.serviceDocumentationUrl,
      token_endpoint: tokenEndpoint.href,
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    },
    resourceName: auth.resourceName,
    resourceServerUrl: new URL(resourceServerUrl),
    scopesSupported,
    serviceDocumentationUrl: auth.serviceDocumentationUrl
      ? new URL(auth.serviceDocumentationUrl)
      : undefined,
  };
}

function createStaticVerifier(token: string, scopes: string[]): OAuthTokenVerifier {
  return {
    async verifyAccessToken(candidate: string): Promise<AuthInfo> {
      if (candidate !== token) {
        throw new InvalidTokenError('Bearer token is invalid.');
      }

      return {
        clientId: 'harmon-static-client',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scopes,
        token: candidate,
      };
    },
  };
}

function createJwtVerifier(auth: HarmonMcpAuthConfig): OAuthTokenVerifier {
  const issuer = requireUrl(auth.issuerUrl, 'HARMON_MCP_OAUTH_ISSUER_URL');
  const jwks = createRemoteJWKSet(requireUrl(auth.jwksUrl, 'HARMON_MCP_OAUTH_JWKS_URL'));
  const audiences = auth.audience && auth.audience.length > 0 ? auth.audience : undefined;

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          audience: audiences,
          issuer: issuer.href,
        });

        return mapJwtPayload(token, payload);
      } catch (error) {
        throw new InvalidTokenError(error instanceof Error ? error.message : 'Access token is invalid.');
      }
    },
  };
}

function mapJwtPayload(token: string, payload: JWTPayload): AuthInfo {
  const scopes = Array.isArray(payload.scope)
    ? payload.scope.flatMap((value) => typeof value === 'string' ? value.split(' ') : [])
    : typeof payload.scope === 'string'
      ? payload.scope.split(' ').filter((value) => value.length > 0)
      : [];

  const clientId = firstString(payload.client_id, payload.azp, payload.sub);
  if (!clientId) {
    throw new InvalidTokenError('Access token is missing a client identifier.');
  }

  return {
    clientId,
    expiresAt: payload.exp,
    extra: payload.sub ? { subject: payload.sub } : undefined,
    scopes,
    token,
  };
}

function requireUrl(value: string | undefined, name: string): URL {
  if (!value) {
    throw new Error(`${name} is required for OAuth-enabled MCP auth.`);
  }
  return new URL(value);
}

function splitEnv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split(/[,\s]+/).map((part) => part.trim()).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
