# Design System - Versery (As Built)

This file documents the current, implemented design system in the app. It is a source-of-truth reference for UI decisions and should be updated when visual foundations change.

## Product Context
- What this is: A calm poetry reading app with mood-led discovery, daily featured reading, poet profiles, and curated collections.
- Primary surfaces: Home, Compass, Voices, Collections, Poem Reader.
- Primary interaction model: Mobile-first with fixed top app bar and bottom dock navigation.

## Design Thesis
- Mood: Quiet, editorial, and contemplative.
- Aesthetic: Soft monochrome base with selective tonal accents.
- Interaction character: Gentle and low-friction, with restrained motion.
- Visual priority: Reading comfort, information hierarchy, and clear tap targets.

## Foundations

### Color Tokens
From `:root` in `src/styles.css`:

- `--surface: #f9f9f9`
- `--surface-lowest: #ffffff`
- `--surface-low: #f2f4f4`
- `--surface-high: #e4e9ea`
- `--surface-highest: #dde4e5`
- `--surface-dim: #d3dbdd`
- `--ink: #2d3435`
- `--ink-soft: #5a6061`
- `--accent: #5f5e5e`
- `--accent-strong: #525151`
- `--line: rgba(117, 124, 125, 0.14)`

Shadows:
- `--shadow-soft: 0 18px 45px rgba(45, 52, 53, 0.04)`
- `--shadow-header: 0 8px 30px rgba(45, 52, 53, 0.06)`
- `--shadow-bottom: 0 -8px 30px rgba(45, 52, 53, 0.04)`

### Typography
- Body/UI default: `"Satoshi", sans-serif`
- Display/headlines: `"Cabinet Grotesk", sans-serif`
- Iconography: Material Symbols Outlined

Guidelines (as implemented):
- Display text uses tight tracking and short line-heights (`~0.94-1.12`).
- Body copy uses comfortable line-heights (`~1.55-1.85`).
- Labels/actions frequently use uppercase with increased letter-spacing for navigation and metadata.
- Large responsive headings rely on `clamp(...)`.

### Layout + Spacing
- Mobile-first content width token:
  - `--content-width: 30rem` (base)
  - `56rem` at tablet (`min-width: 768px`)
  - `68rem` at desktop (`min-width: 1024px`)
- Primary screen padding:
  - `padding-top: calc(6rem + env(safe-area-inset-top))`
  - `padding-bottom: calc(8rem + env(safe-area-inset-bottom))`
- Safe-area insets are used for top/bottom fixed UI.
- Recurring section rhythm on home and content surfaces: `margin-top: 3rem`.

### Shape Language
- Cards: rounded, soft surfaces (`1rem` to `2rem` radius depending on component).
- Pills/actions: `border-radius: 999px`.
- Bottom dock/top bar: soft glass-like containers with blur and subtle shadow.

## Responsive System
- Mobile tuning: `@media (max-width: 1023px)`
- Tablet: `@media (min-width: 768px)`
- Desktop: `@media (min-width: 1024px)`

Behavior:
- Mobile keeps fixed top bar and bottom dock as primary frame.
- Desktop constrains content to center with wider `--content-width`.
- Many cards/sections gain hover polish on pointer-capable devices only.

## Motion System
- Principle: Subtle, non-distracting, mostly transform/opacity based.
- Common durations:
  - Micro feedback: `160ms`
  - Color/opacity shifts: `180ms`
  - Decorative/entry: `300ms-620ms`
- Easing: mostly `ease-out`.
- Existing keyframes include staged entry and surface polish (`rise-in`, `mobile-fade-in`, `desktop-cascade`, etc.).

## Core Component Patterns

### App Frame
- `top-app-bar`: fixed, blurred, quiet chrome for title/navigation context.
- `bottom-nav`: fixed mobile dock with active state and safe-area-aware padding.

### Home
- Hero mood card (`feeling-card`) anchors mood-first exploration.
- Featured content cards use layered surfaces for depth (`feature-stack`).
- Section hierarchy: mood interaction, then `home-mid-stack` (**Poet of the week**, **Today’s poem** / `feature-stack`, **`home-spotlight-aside`** placeholder). On desktop (`min-width: 1024px`) row 1 is Poet | placeholder card (`1fr` / `1fr`); Today’s poem spans full width below. On narrower viewports the order is Poet → Today’s poem → placeholder with `gap: 3rem`.
- **`home-spotlight-aside`**: Companion white card (same surface tokens as **`feature-card-main`**: `--surface-lowest`, soft border, `0 20px 42px rgba(45, 52, 53, 0.055)`, `1.75rem` radius). Copy is **placeholder only** until a real module ships; grid slot is column 2, row 1 beside Poet on desktop.

### Action Styles
- `primary-action`: high-emphasis pill CTA (dark fill, uppercase metadata style).
- `inline-action`: low-emphasis text/icon action with subtle motion.
- `section-link`: understated underlined utility link.

### Avatars and Portraits
- Circular portrait usage in `Poet of the Week` and `Today's Poem`.
- Current fit behavior is tuned to keep more portrait context visible (less aggressive face crop).

## Accessibility Baseline
- Visible focus ring pattern on interactive elements via `:focus-visible` outline.
- Tap targets generally use generous hit areas (icon buttons and nav items).
- Contrast strategy relies on muted text over bright surfaces, with stronger ink for hierarchy anchors.

## Home Screen Rules (Current Intent)
- Mobile-only customizations should stay under `@media (max-width: 1023px)`.
- Desktop layout should not be impacted by mobile hero experiments.
- Bottom dock placement/behavior remains stable unless explicitly redesigned.

## Do / Don't

Do:
- Reuse existing tokens (`--surface-*`, `--ink*`, `--line`, shadows) before adding new values.
- Maintain the 3rem section rhythm unless there is a clear local exception.
- Keep motion calm and purposeful.
- Preserve safe-area-aware spacing for fixed top/bottom UI.

Don't:
- Introduce bright/neon accents that break the calm editorial palette.
- Add heavy/glossy effects that overpower reading surfaces.
- Change global spacing/token behavior to solve one local screen issue.
- Ship cross-breakpoint style changes when request is mobile-only.

## Growth surfaces (v2)

- **Home newsletter:** `home-spotlight-aside` (“Weekly note”) hosts a compact inline email row + small primary action. **Do not** increase the card’s outer height or grid footprint versus the prior spotlight tile; copy stays one title line + hint + single row.
- **Poem reader:** After the last line enters view (`IntersectionObserver` on `.poem-reader__line`), a narrow strip (`.poem-reader__newsletter`) appears under the body, reusing poem-adjacent surface tokens (`--poem-next-border`, `--poem-next-shadow`, `--surface-lowest`). Optional one-per-session sheet uses `.growth-dialog` (modal + soft backdrop).
- **PWA install:** Trailing `install_mobile` control in `top-app-bar` (with theme on home) and matching `screen-action-btn` on poem + detail `screen-actions--split` headers. Shared install copy lives in `<dialog class="growth-dialog">`. Optional toast `.growth-toast` sits above the bottom dock.
- **Motion:** Dialogs and toast respect the global calm motion rule; avoid aggressive slide-in when `prefers-reduced-motion` applies (instant or opacity-only).
- **Analytics:** Growth events are named `newsletter_*`, `pwa_*`, `pwa_toast_*` in `src/lib/analytics.js` usage from `App.jsx` / forms.

## Change Log
- 2026-04-12: Shipped growth surfaces (v2): newsletter in `home-spotlight-aside`, poem-end inline + optional sheet, PWA manifest + install chrome + optional toast; documented in “Growth surfaces (v2)”.
- 2026-04-11: Documented `home-mid-stack` + `home-spotlight-aside` placeholder beside Poet of the week.
- 2026-04-09: Initial `DESIGN.md` created from the current implemented UI system in `src/styles.css` and `src/App.jsx`.
