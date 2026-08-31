# ADR-0038: Aperture presents an identity it is given; it never authenticates

- **Status:** Accepted
- **Date:** 2026-08-28
- **Deciders:** labadorf, design session
- **Related:** ADR-0008 (components hold no authority), ADR-0016 (defer Bridge; enforcement is never Aperture's), ADR-0029 (capability-gated honest degradation), ADR-0032 (control-plane ownership — consumes the viewer identity), ADR-0034 (runtime config injection); platform `sec6_security_model.md` §6.3; DataHelix platform ADR-0006 (the authenticating proxy that supplies the identity)

## Context

Aperture needs authentication in front of it. The first concrete requirement is **PIV/CAC via VA
SSOi** for a VAEC GovCloud deployment; a username/password rig is needed sooner, for testing,
because SSOi onboarding is queue-driven and gated on VA IAM paperwork with long lead times.

Two facts constrain the answer:

1. **Aperture has no server.** It ships as a static bundle served by nginx (`web/Dockerfile`);
   the `solo` recipe image contains no Node at all. The BFF pattern that SSOi integration wants —
   SPA holds no tokens, a confidential client holds an httpOnly session — has **no component in
   Aperture to live in**. An OIDC relying party cannot be added to a static bundle; putting one
   there would mean shipping a client-side confidential client, which is a contradiction.
2. **Enforcement is not Aperture's, by standing decision.** ADR-0016: *"Enforcement is never
   added to Aperture; it always remains Bridge's."* ADR-0008: components hold no authority.

Bridge is unimplemented and, for authentication specifically, unnecessary: platform sec6 §6.3
decomposes Bridge into four steps, and PIV/CAC needs only (1) validate the credential and resolve
the viewer, and (4) forward a verified identity downstream. Steps (2)–(3) — the PDP computing
per-viewer predicates and field masks — are a separate, larger problem unrelated to how a user
proves who they are.

So the authentication itself belongs in an **authenticating reverse proxy** occupying the
recipe's nginx position (platform ADR-0006). The open question this ADR answers is narrower:
**what, if anything, does Aperture itself do about identity?**

Doing nothing is not viable. A user who cannot see who they are signed in as, cannot sign out,
and gets an unexplained blank table when their session expires has a broken application, however
correct the layering is. And ADR-0032 now needs a **viewer identity** to own control-plane
documents.

## Decision

**Aperture gains a configurable identity capability that is presentation only.** It will:

- **read** a configured identity endpoint (same-origin, `credentials: 'same-origin'`) and render
  who the viewer is, with a sign-out link;
- **supply** the resolved identity to the control-plane store as the document `owner` (ADR-0032);
- **hand off** to a configured login URL on an unauthenticated or expired session, via a
  **top-level navigation**;
- **degrade to nothing** when unconfigured.

It will **not**, ever:

- perform an OAuth/OIDC flow, hold a client secret, or complete a token exchange;
- receive, store, or transmit an access token or ID token — **no token touches the SPA**, and
  nothing auth-related is written to `localStorage`;
- parse a client certificate or read a `X-Client-Cert`-style header (no smart-card certificate
  ever reaches the application; that terminates at the IdP);
- decide whether a request is permitted.

`VITE_AUTH_MODE` defaults to `none`, in which the capability renders nothing and the viewer is
`null` — behaviour byte-identical to today. Configuration arrives through the ADR-0034 runtime
overlay, so one image serves an authenticated and an unauthenticated deployment.

### The identity claim is load-bearing and effectively immutable

The field chosen as the viewer's stable identity becomes the `owner` on every control-plane
document (ADR-0032). **Changing it later orphans every saved view and draft in the deployment**,
because ownership is matched by exact string.

Therefore:

- The default probe order is `preferredUsername`, `upn`, `edipi`, `sub`, `user` — and
  **`email` is deliberately excluded**. Email addresses change (name changes, domain migrations),
  and a changed email silently orphans that user's documents. VA guidance is explicit on this
  point: key on UPN or EDIPI, never email.
- When no candidate claim is present, the capability enters an **error** state naming the
  problem, rather than falling back to something plausible. A silent fallback to `email` is the
  single worst outcome available here, so it is not reachable.
- `VITE_AUTH_IDENTITY_CLAIM` overrides the probe explicitly, which is the supported way to pin
  the claim before a deployment accumulates documents.

### Expiry is a top-level navigation, never a fetch

On a 401 the SPA navigates the **whole window** to the login URL. Not `fetch`, not an iframe, not
an XHR redirect. A PIV/CAC challenge requires a top-level navigation to reach the card and PIN
prompt; an iframe or background request produces a hung state with no visible cause. This holds
for the password rig too, so the behaviour is identical in both modes and gets exercised long
before a real PIV is available.

## Consequences

- **Aperture stays deployable with no auth at all.** `none` is the default and the local/dev
  posture ADR-0016 describes is preserved exactly.
- **One image, both modes.** Swapping PIV/CAC for htpasswd — or either for Bridge — is a change
  of proxy configuration and four `VITE_AUTH_*` values, not an Aperture change. The capability is
  written against an *identity endpoint*, not against SSOi.
- **The `runtimeEnv()` allowlist in `web/docker/40-aperture-config.sh` is now load-bearing for
  auth.** It is an explicit list; a new `VITE_*` name that is not added there is silently dropped
  at container start (the ADR-0034 hazard, now with a security-adjacent failure mode: the app
  would come up looking unauthenticated).
- **ADR-0032's viewer seam is filled.** `App` → `ControlPlaneProvider` already accepts `viewer`;
  this supplies it. Per-user control-plane scoping lights up only when both an identity and a
  1.1.0-recipe endpoint are present.
- **This is not access control, and the UI must not imply that it is.** An unauthenticated user
  is kept out by the proxy, not by Aperture. If the proxy is misconfigured or bypassed, Aperture
  will render whatever the endpoint returns — as it always has.
- Aperture gains no dependency: the capability is `fetch` and one context.

## Alternatives considered

- **Build an OIDC relying party into Aperture.** Impossible as specified — there is no server
  process to hold a confidential client or an httpOnly session, and a public-client SPA flow
  would put tokens in the browser, which §6.4 of the VA SSOi guidance and this ADR both forbid.
  It would also put enforcement in Aperture, violating ADR-0008/0016.
- **Wait for Bridge.** Bridge is unimplemented and its remaining irreducible part (the PDP) is
  unrelated to authentication. Waiting blocks a VA deployment on work that PIV/CAC does not need.
- **Add no identity UI; let the proxy's own pages handle everything.** The proxy can sign a user
  in, but it cannot show who is signed in inside the app, cannot offer sign-out in context, and
  cannot explain an expired session mid-task — the user sees an unexplained failure. It also
  leaves ADR-0032 with no viewer, so control-plane ownership stays dark.
- **Read the identity from `X-Auth-Request-User` in the SPA.** A browser cannot read request
  headers it did not send. The proxy's userinfo endpoint is the readable surface.
- **Take the identity from runtime config (`VITE_VIEWER_ID`).** Trivial, and a footgun: a
  client-declared identity is unauthenticated by construction and would let anyone claim
  ownership of anyone's documents by editing config. Rejected outright.
- **Fall back to the `email` claim when nothing else matches.** Convenient and quietly
  destructive — see the identity-claim section. Rejected in favour of a visible error.
