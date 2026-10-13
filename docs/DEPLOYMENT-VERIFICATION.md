# Deployment Verification Report — VisaBridge Global

Prepared: 2026-10-13 · Scope: repository-to-production delivery chain for the
three local commits from the aviation reference data pass. This report exists
so that no one — including future sessions — can mistake "code and tests pass"
for "deployed and serving".

## 1. State of the delivery chain (one page)

| Stage | State | Evidence and exact blocker |
|---|---|---|
| Local repository | **DONE — verified** | Clean tree at `216d2cb8982e271f1cb15ebbe76e6b0acca037bd` (2026-10-13). `git status` clean, 0 modified files. |
| Type check | **DONE — verified** | `pnpm exec tsc --noEmit` → 0 errors (final pass before this report). |
| Unit/integration tests | **DONE — verified** | 99/99 passing (78 baseline + 21 from the aviation pass). |
| Production build | **BLOCKED (platform policy)** | Build/dev commands are refused in this environment by design; the build gate runs on deploy. Not executed locally — never report it as passed. |
| Git push to GitHub | **BLOCKED (credentials)** | Remote readable, push unauthorized — details in §2. |
| GitHub remote commit | **BLOCKED (same)** | Remote `main` still at `4689d8c639692859c2b7b41befbeabfcdf80aae5`; the 3 newer commits have not landed remotely. |
| Vercel build | **NOT STARTED** | No deployment can be triggered because the source never reached GitHub. Secondary: no Vercel token in this runtime (verified by env-name listing), so the API is 403-unauthenticated from here. |
| Production URL serving | **NOT APPLICABLE YET** | No vercel.app URL is recorded anywhere in the repo; production is defined by the connected Vercel project `prj_tRFQTAl4X8jXW8Zc4Rlregw2gp48`. |
| Database connectivity | **BLOCKED (platform-side)** | Retried through the platform's own provisioning tool this run; real error in §3. |
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

**Conclusion:** every local prerequisite for the push is satisfied and the push
is a clean fast-forward (no divergence, nothing to rebase or overwrite —
`git push` with no force flags). It requires an actor that holds the GitHub
write credential: the platform's git service, or a one-time
`git push origin main` from any session where that credential is mounted.

**Definition of done (tick when verified, not assumed):**

- [ ] `git ls-remote origin` shows `refs/heads/main` =
      `216d2cb8982e271f1cb15ebbe76e6b0acca037bd`.
- [ ] GitHub → Vercel integration auto-triggers a build (or a manual "Deploy"
      from the `main` branch in the Vercel dashboard).

## 3. Supabase provisioning: retested through the supported path

As instructed, the platform's own provisioning capability was invoked again —
no workaround, no duplicate organization, no substitute database. Real response
this run:

> `The configured Supabase account has no organization to create a project in`

This is more precise than the historical pre-flight `organizations_read`
failure and points at the same place: **account state on the platform's
Supabase integration**. The account the integration uses has no organization,
and organizations cannot be created from project tooling. This is not a code
problem and cannot be repaired from the repository — every migration
(`0001`–`0008`), policy, and seed file is already in the repo and applies
unchanged the moment a database is bound.

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

- The three commits exist **only locally** until the push in §2 happens; any
  future session must re-check `git ls-remote` before assuming sync.
- The first migration application against a fresh database is still
  unexercised end-to-end; treat the §4.3 check as the acceptance gate, and
  keep the honest "database not connected" states until it passes.
- No Vercel token exists in this runtime, so post-deploy checks are manual
  dashboard steps; do not accept a "Connected" badge as build proof.
