import { createPublicKey, createVerify, type JsonWebKey, type KeyObject } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

interface JwkKey extends JsonWebKey {
  kid?: string;
}

interface JwksResponse {
  keys?: JwkKey[];
}

interface AccessJwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  sub?: string;
  [key: string]: unknown;
}

interface CachedKey {
  key: KeyObject;
  expiresAt: number;
}

const JWKS_CACHE_MS = 10 * 60 * 1000;
const JWT_ALGORITHM = 'RSA-SHA256';

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(base64UrlDecode(value).toString('utf8')) as T;
}

function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function issuerFor(teamDomain: string): string {
  return `https://${normalizeTeamDomain(teamDomain)}`;
}

@Injectable()
export class CfAccessService {
  private readonly keyCache = new Map<string, CachedKey>();
  private jwksPromise: Promise<void> | null = null;

  async resolveEmail(headers: Record<string, string | string[] | undefined>): Promise<string> {
    if (process.env.AUTH_DEV_MODE === 'true') {
      const devEmail = process.env.AUTH_DEV_EMAIL;
      if (!devEmail) {
        throw new UnauthorizedException({
          code: 'AUTH_DEV_EMAIL_MISSING',
          message: 'AUTH_DEV_MODE is enabled but AUTH_DEV_EMAIL is not configured.',
        });
      }
      return devEmail.toLowerCase();
    }

    const assertion = this.getHeader(headers, 'cf-access-jwt-assertion');
    if (!assertion) {
      throw new UnauthorizedException({
        code: 'CF_ACCESS_ASSERTION_MISSING',
        message: 'Missing Cloudflare Access assertion.',
      });
    }

    const payload = await this.verifyAssertion(assertion);
    const headerEmail = this.getHeader(headers, 'cf-access-authenticated-user-email');
    const email = (headerEmail || payload.email || '').toLowerCase();
    if (!email) {
      throw new UnauthorizedException({
        code: 'CF_ACCESS_EMAIL_MISSING',
        message: 'Cloudflare Access identity did not include an email address.',
      });
    }
    if (payload.email && headerEmail && payload.email.toLowerCase() !== email) {
      throw new ForbiddenException({
        code: 'CF_ACCESS_EMAIL_MISMATCH',
        message: 'Cloudflare Access email header does not match the verified assertion.',
      });
    }
    return email;
  }

  private async verifyAssertion(jwt: string): Promise<AccessJwtPayload> {
    const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
    const expectedAud = process.env.CF_ACCESS_AUD;
    if (!teamDomain || !expectedAud) {
      throw new UnauthorizedException({
        code: 'CF_ACCESS_CONFIG_MISSING',
        message: 'Cloudflare Access verification is not configured.',
      });
    }

    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException({ code: 'INVALID_CF_ACCESS_JWT', message: 'Invalid Cloudflare Access JWT.' });
    }

    const header = parseJwtPart<{ alg?: string; kid?: string }>(encodedHeader);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException({ code: 'INVALID_CF_ACCESS_JWT', message: 'Unsupported Cloudflare Access JWT.' });
    }

    const key = await this.getSigningKey(header.kid, teamDomain);
    const verifier = createVerify(JWT_ALGORITHM);
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const valid = verifier.verify(key, base64UrlDecode(encodedSignature));
    if (!valid) {
      throw new UnauthorizedException({ code: 'INVALID_CF_ACCESS_JWT', message: 'Invalid Cloudflare Access JWT signature.' });
    }

    const payload = parseJwtPart<AccessJwtPayload>(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) {
      throw new UnauthorizedException({ code: 'CF_ACCESS_JWT_EXPIRED', message: 'Cloudflare Access JWT expired.' });
    }
    if (payload.iss !== issuerFor(teamDomain)) {
      throw new UnauthorizedException({ code: 'CF_ACCESS_ISSUER_INVALID', message: 'Invalid Cloudflare Access issuer.' });
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(expectedAud)) {
      throw new UnauthorizedException({ code: 'CF_ACCESS_AUD_INVALID', message: 'Invalid Cloudflare Access audience.' });
    }
    return payload;
  }

  private async getSigningKey(kid: string, teamDomain: string): Promise<KeyObject> {
    const cached = this.keyCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }

    if (!this.jwksPromise) {
      this.jwksPromise = this.refreshKeys(teamDomain).finally(() => {
        this.jwksPromise = null;
      });
    }
    await this.jwksPromise;

    const refreshed = this.keyCache.get(kid);
    if (!refreshed) {
      throw new UnauthorizedException({ code: 'CF_ACCESS_KEY_NOT_FOUND', message: 'Cloudflare Access signing key not found.' });
    }
    return refreshed.key;
  }

  private async refreshKeys(teamDomain: string): Promise<void> {
    const response = await fetch(`https://${normalizeTeamDomain(teamDomain)}/cdn-cgi/access/certs`);
    if (!response.ok) {
      throw new UnauthorizedException({ code: 'CF_ACCESS_JWKS_FETCH_FAILED', message: 'Could not fetch Cloudflare Access keys.' });
    }
    const jwks = (await response.json()) as JwksResponse;
    const expiresAt = Date.now() + JWKS_CACHE_MS;
    for (const jwk of jwks.keys ?? []) {
      if (jwk.kid) {
        this.keyCache.set(jwk.kid, { key: createPublicKey({ key: jwk, format: 'jwk' }), expiresAt });
      }
    }
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
