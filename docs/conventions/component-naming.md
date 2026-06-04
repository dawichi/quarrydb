# Component Naming & File Organization

## Naming Convention

**Type before specificity** — better alphabetical grouping, easier to find related components.

```
card-user        not  user-card
button-primary   not  primary-button
panel-sidebar    not  sidebar-panel
table-results    not  results-table
```

## File Naming

- Files: `kebab-case` → `card-user.component.ts`
- Classes: `PascalCase` → `CardUserComponent`
- Selectors: `app-` prefix + kebab-case → `app-card-user`

## Directory Structure

```
src/app/
├── core/
│   ├── services/        # Injectable services (DatabaseService, etc.)
│   └── store/           # Signal-based state stores
├── layout/              # Shell components (sidebar, topbar)
├── features/            # Feature areas (query, schema, edit)
│   └── <feature>/
│       ├── components/  # Feature-specific components
│       └── <feature>.component.ts
└── shared/
    └── components/      # Reused across features (button, badge, etc.)
```

## Pages vs Components

- **Pages** — minimal logic, just compose components, live at feature root
- **Components** — own their logic, reusable within their feature
- Business logic lives in components or services, never in pages
