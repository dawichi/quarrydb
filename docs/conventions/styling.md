# Styling Conventions

> **Tailwind version: v3.** Angular's esbuild-based application builder auto-detects `tailwind.config.js` and handles v3 natively — no PostCSS config needed. Tailwind v4 has compatibility issues with Angular's dev server pipeline.

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

Each component has a `.component.scss` file even if it's empty — keeps the structure consistent and
makes it obvious when custom styles are added.

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
