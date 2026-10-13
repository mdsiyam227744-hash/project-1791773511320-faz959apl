# Deployment Verification Report — VisaBridge Global

Prepared: 2026-10-13 · Scope: repository-to-production delivery chain. This report
exists so that no one — including future sessions — can mistake "code and tests
pass" for "deployed and serving". Revision 2 (later the same day): covers the
Vercel production build failure on `/login` and the fix commit `36d4f5f`.

## 1. State of the delivery chain (one page)

| Stage | State | Evidence and exact blocker |
|---|---|---|
| Local repository | **DONE — verified** | Clean tree at `36d4f5f` (build-fix commit; parent `9b071b8…` = fare-matrix pass). `git status` clean, 0 modified files. |
| Type check | **DONE — verified** | `pnpm exec tsc --noEmit` → 0 errors (re-run after the build fix). |
| Unit/integration tests | **DONE — verified** | 129/129 passing (re-run after the build fix). |
| Production build | **FIX IN CODE, AWAITING VERCEL LOG** | Vercel 15.5.19 failed prerendering `/(auth)/login` — `useSearchParams()` without a Suspense boundary. Root cause found in `src/app/(auth)/login/login-form.tsx`, canonical fix applied in commit `36d4f5f` (server page wraps the client form in `<Suspense>`). Local build runs are refused by platform policy, so the confirming evidence must be the Vercel build log after the fix lands. |
| Git push to GitHub | **BLOCKED (credentials)** | Attempted again this run via `git push origin main`; failed unauthenticated — details in §2. |
| GitHub remote commit | **PARTIALLY SYNCED** | Platform git service caught up between sessions: `git ls-remote` now shows `refs/heads/main` = `9b071b8515d7f0efb24d6b946e91f52018c6b36c` (fare-matrix pass). Only the newer fix commit `36d4f5f` is local-only. |
| Vercel build | **FAILED → REDEPLOY PENDING** | Confirmed error: `Error: useSearchParams() should be wrapped in a suspense boundary at page "/login"` (Next.js 15.5.19, static prerender of `/(auth)/login/page`). Fix is the commit above; next push to `main` triggers the rebuild. |
| Production URL serving | **NOT APPLICABLE YET** | No vercel.app URL is recorded anywhere in the repo; production is defined by the connected Vercel project `prj_tRFQTAl4X8jXW8Zc4Rlregw2gp48`. |
| Database connectivity | **BLOCKED (platform-side)** | Provisioning tool invoked again this run; identical error, word for word — §3. |
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

**Conclusion (revision 2):** the push remains a clean fast-forward — the remote
tip the platform synced equals the local parent of the fix commit — and the
command was attempted again this run, failing identically unauthenticated. The
platform's git service demonstrably synced all six prior commits between
sessions (it reached `9b071b8`); the same channel is expected to carry
`36d4f5f`. It requires an actor that holds the GitHub write credential: the
platform's git service, or a one-time `git push origin main` from any session
where that credential is mounted. Nothing is force-pushed; the remote has no
commits to overwrite.

**Definition of done (tick when verified, not assumed):**

- [x] `git ls-remote origin` shows `refs/heads/main` =
      `9b071b8515d7f0efb24d6b946e91f52018c6b36c` (verified this run — the six
      earlier commits are on GitHub).
- [ ] `git ls-remote origin` shows `refs/heads/main` = the fix commit
      `36d4f5f…` (the next platform git sync should close this; verify, never
      assume).
- [ ] GitHub → Vercel integration auto-triggers a build (or a manual "Deploy"
      from the `main` branch in the Vercel dashboard).

## 3. Supabase provisioning: retested through the supported path

As instructed, the platform's own provisioning capability was invoked again —
no workaround, no duplicate organization, no substitute database. Real response
this run:

> `The configured Supabase account has no organization to create a project in`

This is more precise than the historical pre-flight `organizations_read`
failure and points at the same place: **account state on the platform's
Supabase integration**. Revision 2 re-invoked the platform provisioning tool
after the build fix landed and received **the identical sentence, word for
word** — not a permissions escalation, still an empty-organization condition.
The account the integration uses has no organization, and organizations cannot
be created from project tooling. This is not a code problem and cannot be
repaired from the repository — every migration (`0001`–`0009`), policy, and
seed file (including the fare-matrix seeds, which import into `needs_review`
status by design) is already in the repo and applies unchanged the moment a
database is bound.

**Required action (outside this container):** in the Massvai platform's
database integration settings, either create/select an organization on the
linked Supabase account or re-link the integration with an account that has
one. Platform Support escalation is the named path if the setting is not
self-service.

**Definition of done:** the four database variables exist in the project
environment; then apply migrations in order and run the connection test in §5.

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

- The build-fix commit `36d4f5f` exists **only locally** until the next
  platform git sync (all six earlier commits are confirmed on GitHub as of
  revision 2); any future session must re-check `git ls-remote` before
  assuming sync.
- The first migration application against a fresh database is still
  unexercised end-to-end; treat the §4.3 check as the acceptance gate, and
  keep the honest "database not connected" states until it passes.
- No Vercel token exists in this runtime, so post-deploy checks are manual
  dashboard steps; do not accept a "Connected" badge as build proof.
