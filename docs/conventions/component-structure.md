# Component Code Structure

## Section Order

Use clear separators to organize component internals consistently:

```typescript
@Component({ ... })
export class MyComponent {
    // ─── Injected Services ────────────────────────────────────────────────────
    private readonly router = inject(Router)
    private readonly store = inject(WorkspaceStore)

    // ─── Inputs ───────────────────────────────────────────────────────────────
    readonly data = input.required<DataType>()
    readonly label = input<string>()

    // ─── Outputs ──────────────────────────────────────────────────────────────
    readonly saved = output<void>()

    // ─── State ────────────────────────────────────────────────────────────────
    protected readonly isLoading = signal(false)
    protected readonly items = signal<Item[]>([])

    // ─── Computed ─────────────────────────────────────────────────────────────
    protected readonly isEmpty = computed(() => this.items().length === 0)

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    ngOnInit(): void { ... }

    // ─── Event Handlers ───────────────────────────────────────────────────────
    protected onSave(): void { ... }

    // ─── Private ──────────────────────────────────────────────────────────────
    private loadData(): void { ... }
}
```

## Visibility Modifiers

All properties and methods must have an explicit visibility modifier.

| Modifier | When to use |
|----------|-------------|
| `private` | Internal logic only, not referenced in template |
| `protected` | Referenced in template or by subclasses |
| `public` | Needs external access (rare — mostly for `input()`/`output()`) |

Default to `private`. Promote to `protected` only when the template needs it.

## Component Size

- One responsibility per component
- If you need to scroll to see the whole component, consider splitting it
- Extract sub-components rather than growing vertically
