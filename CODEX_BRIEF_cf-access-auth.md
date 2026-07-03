# Codex Brief — Rewire Auth to Cloudflare Access (email + OTP, passwordless)

## Context
Monorepo (this --cd = repo root): NestJS API `apps/api`, Next.js web `apps/web`,
shared Zod/types `packages/shared-types`. Prisma schema at `apps/api/prisma/schema.prisma`.

Current auth is a dev **MockAuthProvider** (`apps/api/src/auth/mock-auth.provider.ts`):
hardcoded users, plaintext passwords, self-issued JWT access/refresh tokens, faked MFA.
Endpoints in `apps/api/src/auth/auth.controller.ts`: POST /auth/login, /auth/refresh,
/auth/logout, GET /auth/me. Guards: `guards/jwt-auth.guard.ts` (APP_GUARD),
`roles.guard.ts`, `tenant.guard.ts`. `auth.types.ts` = AuthUser = JwtPayload & {sub}.
Frontend: `apps/web/src/app/[locale]/login/page.tsx`, `src/components/auth-provider.tsx`,
`src/components/require-auth.tsx`.

Reference precedent for the target model (READ IT): the sibling files-portal at
`/home/clawdbot/.openclaw/workspace/aljeel/files-portal/functions/api/[[path]].js` —
it sits behind Cloudflare Access and reads the authenticated email from the
`cf-access-authenticated-user-email` header, with a fallback to decoding the
`Cf-Access-Jwt-Assertion` JWT. That is exactly the pattern to adopt here.

## GOAL
Replace password/mock auth with **Cloudflare Access (email + OTP, passwordless)**.
Cloudflare Access owns the entire email→OTP flow. Our app NEVER handles passwords or OTP
codes. The app is deployed behind CF Access; the backend TRUSTS the CF-provided identity,
maps that email to a user via the database, and authorizes from there.

## LOCKED DECISIONS (build exactly these)
1. **Cloudflare Access in front (Option A).** No app-native password or OTP. Rip out the
   password login entirely.
2. **Backend trusts the CF Access identity.** On each request the API resolves the
   authenticated email from the `Cf-Access-Jwt-Assertion` header:
   - Verify the JWT properly: fetch + cache CF Access public keys from the team certs
     JWKS endpoint (`https://<TEAM_DOMAIN>/cdn-cgi/access/certs`), verify signature,
     `aud` claim (against configured CF Access application AUD), issuer, and expiry.
     Extract `email`.
   - Also accept the `Cf-Access-Authenticated-User-Email` header as the primary/simple
     source (matching files-portal), but the JWT verification is the security boundary —
     do not trust a bare email header without the verified assertion in production mode.
   - Provide a DEV escape hatch: when `AUTH_DEV_MODE=true` (local, no CF in front), accept
     a configurable dev email (env `AUTH_DEV_EMAIL`) so local dev still works without CF.
     Never active unless the env flag is explicitly set.
3. **SupplierUser table is the source of truth for identity→role+supplier.**
   - Resolve the verified email against `SupplierUser` (email unique). If found → that
     row's role + supplierId is the session identity.
   - AP staff are NOT suppliers. Add a mechanism for internal/AP users: create an
     `AppUser` (or `StaffUser`) table for internal identities (email, fullName, role in
     {AP_CLERK, AP_APPROVER}, isActive), OR extend an existing users concept — your call,
     but AP users must resolve to an AP role with supplierId=null. Seed the existing
     AP clerk (`clerk@aljeel.test` → pick a real `@aljeel.com` address, use
     `clerk@aljeel.com`) into that table.
   - Configurable domain rule: an authenticated `@aljeel.com` email with NO explicit row
     MAY map to a default AP role (env-driven, e.g. `AUTH_STAFF_DOMAIN=aljeel.com` +
     `AUTH_STAFF_DEFAULT_ROLE=AP_CLERK`). If the domain rule is disabled/unset, unknown
     emails are denied.
   - Any authenticated email that matches neither a SupplierUser row nor the staff domain
     rule → **401/403 denied** (CF authenticated them, but they have no app identity).
4. **Session model.** After resolving identity, the backend may still mint a short-lived
   internal session token for the SPA to carry in API calls, OR authorize per-request
   straight from the CF assertion. Prefer per-request resolution from the CF header (no
   app-issued refresh tokens needed — CF Access owns session lifetime). Cache the
   email→identity DB lookup briefly to avoid a DB hit per request. Remove refresh-token
   machinery.
5. **Remove:** MockAuthProvider, password fields/flows, /auth/login, /auth/refresh,
   LoginRequest password schema, the frontend password login page/form, faked MFA. Keep
   GET /auth/me (now returns identity resolved from the CF assertion). Add /auth/logout
   that points the browser at the CF Access logout URL (`/cdn-cgi/access/logout`).
6. **Frontend.** No login form. When unauthenticated (no valid session / 401), the app
   relies on CF Access to have already prompted for email+OTP (CF intercepts before the
   app loads). The SPA calls GET /auth/me to learn who it is and renders role-appropriate
   UI. `require-auth.tsx` / `auth-provider.tsx` rewired to consume /auth/me instead of
   token login. Logout button hits the CF Access logout URL. Bilingual EN/AR preserved.
7. **Guards.** `JwtAuthGuard` becomes a `CfAccessGuard` (verifies CF assertion → resolves
   DB identity → attaches AuthUser). RolesGuard + TenantGuard keep working unchanged off
   the resolved AuthUser (role, supplierId). @Public() still bypasses.
8. **Env template** additions with comments: `CF_ACCESS_TEAM_DOMAIN`,
   `CF_ACCESS_AUD`, `AUTH_DEV_MODE`, `AUTH_DEV_EMAIL`, `AUTH_STAFF_DOMAIN`,
   `AUTH_STAFF_DEFAULT_ROLE`. Remove obsolete `JWT_SECRET` usage if no longer needed (or
   keep only if you retain short internal sessions — document which).

## DELIVERABLES
### A. shared-types (`packages/shared-types`)
- Remove password from LoginRequest surface (or remove LoginRequest entirely). Keep
  AuthMeResponse. Add any new identity/role types. Keep zod schemas coherent.

### B. Backend (NestJS)
- New CF Access verification module: JWKS fetch+cache, JWT verify (sig/aud/iss/exp),
  email extraction, dev-mode escape hatch.
- Identity resolution service: email → SupplierUser (role+supplierId) or staff/AppUser
  (AP role, supplierId null) or domain rule; deny unknown.
- Rewire AuthModule/AuthService/AuthController: drop MockAuthProvider + login/refresh,
  keep /auth/me, add CF-based /auth/logout redirect target.
- CfAccessGuard as the APP_GUARD replacing JwtAuthGuard. RolesGuard/TenantGuard intact.
- Prisma: add AppUser/StaffUser table (or equivalent) for internal AP identities +
  migration. Seed AP staff (clerk@aljeel.com) and keep the SupplierUser seeds (incl.
  admin@asateel.test → change to a resolvable email if needed, but keep supplier link).
- Do NOT run prisma migrate/seed against any DB. Generate migration files only.

### C. Frontend (Next.js)
- Delete/replace the password login page. Rewire auth-provider + require-auth to load
  identity from /auth/me and treat 401 as "CF Access will handle it" (show a minimal
  "redirecting to sign-in" / access-required state, or a link to the CF Access login).
- Logout → CF Access logout URL.
- Preserve role-based UI (supplier vs AP), i18n EN/AR, Accord brand styling.

## CONSTRAINTS
- Match existing module structure, zod schemas, decorators, audit pattern.
- Passwordless. App never sees/handles OTP codes or passwords — CF Access owns that.
- Security boundary = verified CF Access JWT assertion, not a bare header, in prod mode.
- Do NOT deploy. Do NOT run migrations/seeds against a live DB. Report the diff, files
  touched, migration SQL, new env vars, and any assumptions (esp. exact CF team domain /
  AUD which are deploy-time env, and how AP staff identities are modeled).
- Keep the existing Asateel approve→reconcile integration working under the new AuthUser.

Implement it. Report the diff and files touched; do not deploy.
