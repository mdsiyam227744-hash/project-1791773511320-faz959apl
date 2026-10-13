# Deployment Verification Report — VisaBridge Global

Prepared: 2026-10-13 · Scope: repository-to-production delivery chain. This report
exists so that no one — including future sessions — can mistake "code and tests
pass" for "deployed and serving". Revision 2 (later the same day): covers the
Vercel production build failure on `/login` and the fix commit `36d4f5f`.
Revision 3 (same day): the Supabase blocker's root cause is now **proven at the
source** — the configured Management API token authenticates successfully and
its account owns zero organizations (§3.1). The push was re-attempted after
re-verifying ancestry and failed with the identical credential error (§2);
local HEAD is now `b571429` (docs-only) on top of the fix.
Revision 4 (same day, latest): **GitHub sync is COMPLETE.** `git ls-remote` and
a verified fetch both read `refs/heads/main` = `ece9993…`, and an ancestry
check proves the login fix `36d4f5f` is contained in the pushed history — the
platform git service carried all three formerly local commits. Supabase was
re-probed with a focused script: organizations still `200 []`, projects still
`403 missing projects_read`, auth layer still passes — conclusion unchanged.
The dev preview was **not reachable** from the execution container this session
(all candidate addresses refused), so runtime routes were not re-verified;
typecheck (0 errors) and tests (129/129) were re-run and pass.

## 1. State of the delivery chain (one page)

| Stage | State | Evidence and exact blocker |
|---|---|---|
| Local repository | **DONE — verified** | Clean tree, local HEAD = `ece9993` (rev-3 docs commit). Revision 4: `git fetch` advanced `origin/main` `4689d8c… → ece9993…`; local and remote are **identical**. |
| Type check | **DONE — verified** | `pnpm exec tsc --noEmit` → 0 errors (re-run after the build fix). |
| Unit/integration tests | **DONE — verified** | 129/129 passing (re-run after the build fix). |
| Production build | **FIX IN CODE, AWAITING VERCEL LOG** | Vercel 15.5.19 failed prerendering `/(auth)/login` — `useSearchParams()` without a Suspense boundary. Root cause found in `src/app/(auth)/login/login-form.tsx`, canonical fix applied in commit `36d4f5f` (server page wraps the client form in `<Suspense>`). Local build runs are refused by platform policy, so the confirming evidence must be the Vercel build log after the fix lands. |
| Git push to GitHub | **DONE — verified (rev 4)** | The platform git service synced the chain; `git fetch` this run advanced `origin/main` from `4689d8c…` to `ece9993…` with 0 unpushed commits. |
| GitHub remote commit | **DONE — verified (rev 4)** | `refs/heads/main` = `ece9993982eb98b783b91f34b8af0adbe48fbdd0`; `git merge-base --is-ancestor 36d4f5f origin/main` → **true**, so the `/login` Suspense fix is confirmed in the pushed history. The Vercel rebuild is presumed triggered by the push; deployment must be confirmed from the Vercel dashboard or a deployment webhook/log. |
| Vercel build | **FAILED → REDEPLOY PENDING** | Confirmed error: `Error: useSearchParams() should be wrapped in a suspense boundary at page "/login"` (Next.js 15.5.19, static prerender of `/(auth)/login/page`). Fix is the commit above; next push to `main` triggers the rebuild. |
| Production URL serving | **NOT APPLICABLE YET** | No vercel.app URL is recorded anywhere in the repo; production is defined by the connected Vercel project `prj_tRFQTAl4X8jXW8Zc4Rlregw2gp48`. |
| Database connectivity | **BLOCKED (root cause proven, rev 3)** | Direct Management API test with the configured `SUPBESE` token: **valid PAT, account owns zero organizations** — full sanitized evidence in §3.1. Provisioning tool error explained; the fix is account-side, not code-side. |
| Auth/persistence verification | **NOT STARTED** | Cannot start without a database. |
| Live flight provider | **NOT CONFIGURED (by design)** | No `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET` in the runtime (verified by env-name listing). Setup: §4 of `docs/OPERATIONS-CHECKLISTS.md`. |

Legend: DONE → code/executable proof exists · BLOCKED → named, external obstacle
· NOT STARTED → prerequisites absent · NOT CONFIGURED → code complete, awaiting
credentials.

## 2. Git push: what was tried, what happened

1. `git status --short --branch` → clean tree on `main`, 3 commits ahead of
   what the remote serves.
2. `git ls-remote origin` → **succeeded**, listing
   `4689d8c6… refs/heads/main`. The repo is reachable read-only (public repo,
   unauthenticated read), so network is not the problem.
3. `git push origin main` → **failed**:
   `fatal: could not read Username for 'https://github.com': No such device or address`.
4. Credential surface audited: no credential helper configured, no
   `GITHUB_TOKEN`-family variable (checked by name only), no `.netrc`, no
   `~/.git-credentials`, no SSH keys. The push grant lives with the platform's
   connected GitHub service, which is not an invocable tool in this run.

**Conclusion (revision 3):** the push remains a clean fast-forward — the remote
tip the platform synced (`9b071b8`) is a verified local ancestor of HEAD
(`b571429`) — and was attempted once more with `GIT_TERMINAL_PROMPT=0` so it
could not hang, failing with the identical credential error observed in
revision 3:

> `fatal: could not read Username for 'https://github.com': terminal prompts disabled`

The platform's git service demonstrably synced all six prior commits between
sessions (it reached `9b071b8`); the same channel is expected to carry
`36d4f5f` and `b571429`. It requires an actor that holds the GitHub write
credential: the platform's git service, or a one-time `git push origin main`
from any session where that credential is mounted. Nothing is force-pushed;
the remote has no commits to overwrite.

**Definition of done (tick when verified, not assumed):**

- [x] `git ls-remote origin` shows `refs/heads/main` =
      `9b071b8515d7f0efb24d6b946e91f52018c6b36c` (re-verified revision 3 — the
      six earlier commits are on GitHub, the two newer ones are not).
- [ ] `git ls-remote origin` shows `refs/heads/main` = the fix commit
      `36d4f5f…` (the next platform git sync should close this; verify, never
      assume).
- [ ] GitHub → Vercel integration auto-triggers a build (or a manual "Deploy"
      from the `main` branch in the Vercel dashboard).

## 3. Supabase provisioning: retested through the supported path

As instructed, the platform's own provisioning capability was invoked in prior
revisions — no workaround, no duplicate organization, no substitute database.
Real response (revisions 1–2):

> `The configured Supabase account has no organization to create a project in`

**Revision 3 root cause — proven at the source.** This run discovered that a
Supabase Management API token (`SUPBESE`) **is** configured in the project
environment (it was absent in earlier revisions, which is why it could never be
tested before). A sanitized script (`scripts/ops/supabase-discovery.mjs`,
committed) tested it directly against `api.supabase.com`:

| Probe | Result |
|---|---|
| `GET /v1/projects` with the token | `403` — `Missing required permission(s): projects_read` |
| `GET /v1/organizations` with the token | `200` — **empty array `[]`** |
| `GET /v1/projects/<ref>` with a malformed ref | `400 Invalid project ref` (token passes auth, route is scoped) |

Interpretation: the token is **valid** (Supabase rejected a bad ref instead of
rejecting the credential, and returned 200 on the orgs route). The account it
belongs to owns **zero organizations**, and at least the `projects_read` scope
is absent. This exactly reproduces the provisioning tool's sentence: with no
organizations, nothing can be created or discovered. It also means
`international-visa-platform` (visible Healthy in the user's own dashboard)
lives under a **different Supabase account** than the one this integration and
token are bound to. The user's direct project access does not extend to the
integration's account — two disconnected identities.

**Required action (account-side, cannot be done from project tooling):**
either (a) connect the integration/token to the account that actually owns
`international-visa-platform`, or (b) create an organization on the currently
linked account. Until then, no migrations, imports, or persistence checks can
run; every migration (`0001`–`0009`), policy, and seed file (including the
fare-matrix seeds, which import into `needs_review` status by design) is in
the repo and applies unchanged the moment a database is bound.

**Definition of done:** the four database variables exist in the project
environment; then apply migrations in order and run the connection test in §5.

### 3.1 Sanitized Management API evidence (revision 3)

Raw sanitized outputs, token value never printed:

```
== 1. Management API authentication test (GET /v1/projects) ==
projects list: HTTP 403 {"message":"Missing required permission(s):
projects_read","error":{"missing_permissions":["projects_read"]}}

== 2. Organizations visible to this PAT ==
orgs list: HTTP 200 []

scope diagnostic, malformed ref:
project lookup (fake ref): HTTP 400 {"message":"Invalid project ref:
00000000000000000000"}
```

**Definition of done for §3.1 (tick when verified):**

- [ ] `GET /v1/organizations` with a corrected token returns a non-empty list.
- [ ] `GET /v1/projects` returns the `international-visa-platform` ref (or the
      four database variables appear in the project environment another way).
- [ ] `node scripts/ops/supabase-discovery.mjs` completes sections 3–6 with
      HTTP 200s, listing real tables and migration history.

## 4. Post-deployment verification checklist (run only after §2 and §3 close)

1. **Build:** Vercel build log ends `Compiled successfully` with no type
   errors; note the deployment ID.
2. **Production URL:** open the domain serving `prj_tRFQTAl4X8jXW8Zc4Rlregw2gp48`
   → homepage renders, footer links resolve, no console errors.
3. **Database connectivity (real test, not a badge):** with the variables
   bound, `/countries` must render live rows and `/admin/audit` must require
   staff login. If the homepage shows the honest "database not connected"
   notice instead, the binding is not live — fix before proceeding.
4. **Authentication:** register a test customer → login → logout → login.
   Confirm session persists across a page reload; confirm wrong-password shows
   the error state; confirm `/account` and `/admin` refuse anonymous access.
5. **Persistence:** create one visa application as the test customer → log
   out → log back in → the application and its reference must still be there.
   Then run through `docs/OPERATIONS-CHECKLISTS.md` §3 (airline → route →
   fare → package publish) and confirm the published rows appear on the public
   site in both languages.
6. **Environment variables in Vercel:** the four database variables (§3) plus
   `NEXT_PUBLIC_APP_URL` set to the production origin. Flight-provider keys
   only when activating live search (checklists §1). Values are entered in the
   Vercel dashboard; nothing secret is committed to the repo.

## 5. Residual risks to carry forward

- The build-fix commit `36d4f5f` and docs commit `b571429` exist **only
  locally** until the next platform git sync (all six earlier commits are
  confirmed on GitHub as of revision 3); any future session must re-check
  `git ls-remote` before assuming sync.
- The first migration application against a fresh database is still
  unexercised end-to-end; treat the §4.3 check as the acceptance gate, and
  keep the honest "database not connected" states until it passes.
- No Vercel token exists in this runtime, so post-deploy checks are manual
  dashboard steps; do not accept a "Connected" badge as build proof.
