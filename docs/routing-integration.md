# SPA routing: when and how to ship it

Production `main` intentionally stays on the pre–path-URL baseline until you explicitly trigger integration. The full routing stack is preserved **locally** (see below).

## Activation phrase

When you are ready to merge routing into your current product work and deploy, say:

**`VERSERY: integrate SPA routing for deploy`**

Use that exact sentence (or paste it) so the agent applies the checklist in this doc.

## Preconditions

1. **Local product state** — UI, copy, and data (`public/*.json`, corpus outputs, etc.) are where you want them on disk or on a branch.
2. **Build passes** — `npm run build` succeeds on that tree **before** layering routing.
3. **Patch export** — On this machine, `.local/routing-export/patches/` exists (gitignored). If it is missing, regenerate from local branch `wip/routing-full-stack`:

   ```bash
   git format-patch b835f0e..wip/routing-full-stack -o .local/routing-export/patches
   ```

   Manifest and notes: `.local/routing-export/README.md` (also gitignored).

## Integration steps (agent / maintainer)

1. **Choose integration method**
   - **Merge:** `git merge wip/routing-full-stack` (resolve conflicts), or  
   - **Patches:** `git am .local/routing-export/patches/*.patch` (resolve conflicts, then `git am --continue`).

2. **Conflict focus** — Expect heavy overlap in `src/App.jsx`. Keep **your** home / reader UI behavior; re-apply navigation using `navigate`, `Link`, and URL sync from the routing side.

3. **Sanity checks**
   - No imports of files that are not in the repo (Vercel build must resolve every `./lib/...` path).
   - `vercel.json` present if client-side routes are used in production (SPA rewrite to `index.html`).
   - `src/main.jsx`: `WebAnalytics` receives `route` and `path` from `useLocation` so Vercel Web Analytics “Pages” reflects SPA navigations.

4. **Verify**
   - `npm run build`
   - `npx playwright test`
   - Manual smoke: `/`, `/compass`, `/voices`, `/poem/<id>` (refresh on deep link).

5. **Ship**
   - `git add` only paths you intend to publish; commit; push `main` (or open a PR).

## Reference commits

| Label | SHA | Note |
|-------|-----|------|
| Pre-routing `main` | `b835f0e` | Baseline before SPA URLs |
| Routing tip (local branch) | `41f3355` | `wip/routing-full-stack` |

## Do not

- Commit contents of `.local/` (directory is gitignored).
- Run `git add -A` when shipping unless you have reviewed every path (corpus / experiments stay local until you choose otherwise).
