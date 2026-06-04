# Styling Conventions

> **Tailwind version: v4.** Angular's esbuild dev server doesn't invoke PostCSS on global styles, so `@import "tailwindcss"` reaches the browser unprocessed. The fix: Tailwind CLI runs as a separate process writing `src/styles.css`, which Angular includes as a plain static file. No PostCSS integration needed.
>
> - `src/tailwind-input.css` — Tailwind source (the `@import "tailwindcss"` entry point)
> - `src/styles.css` — generated output, included by Angular, **gitignored** (auto-produced by `bun run start` / `bun run build`)
> - Dev: `bun run start` runs both Tailwind watcher + Angular dev server via `concurrently`
> - Build: `bun run build` generates minified CSS first, then runs `ng build`

## Tailwind First

All styling uses Tailwind CSS utility classes. Do not write CSS or SCSS for anything
that Tailwind can express directly.

```html
<!-- Good -->
<div class="flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-100">

<!-- Bad — don't write a class and style it separately -->
<div class="my-custom-panel">
```

## When SCSS Is Allowed

SCSS files (`.component.scss`) are allowed only for:

1. **Custom keyframe animations** — `@keyframes` that Tailwind's `animate-*` can't cover
2. **Complex pseudo-element styles** — `::before` / `::after` with significant logic
3. **Third-party component overrides** — when a library doesn't expose enough hooks

For everything else: use Tailwind. If you think you need a CSS class, check Tailwind docs first.

## Component Style Files

Only create a `.component.scss` file when the component actually needs custom styles (keyframes,
pseudo-elements, third-party overrides). Do not create empty placeholder files.

## Global Styles (`src/styles.scss`)

Only contains:
- `@import "tailwindcss"` — the Tailwind entry point
- CSS custom properties if needed for values not expressible in Tailwind config
- Global `@keyframes` shared across multiple components

## Color Palette

The app follows an OS-aware dark/light theme via Tailwind's `dark:` variant (media strategy).
The primary accent color is amber (`amber-500` / `amber-400` in dark mode) — matches the Quarry brand.

```html
<!-- Use semantic Tailwind shades consistently -->
bg-zinc-950    <!-- page background -->
bg-zinc-900    <!-- sidebar, panels -->
bg-zinc-800    <!-- elevated surfaces, hover states -->
border-zinc-700 <!-- borders -->
text-zinc-100  <!-- primary text -->
text-zinc-400  <!-- secondary/muted text -->
text-amber-500 <!-- accent, active states -->
```
