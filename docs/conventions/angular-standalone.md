# Angular Standalone Components & Modern Syntax

## Standalone Components

All components MUST be standalone. This is a new project — no NgModules.

```typescript
@Component({
    selector: 'app-component-name',
    imports: [CommonModule, SomeOtherComponent],
    templateUrl: './component-name.component.html',
    styleUrl: './component-name.component.scss',
})
export class ComponentNameComponent {}
```

## New Control Flow Syntax

Use Angular's built-in control flow (`@if`, `@for`, `@switch`) — never structural directives.

```html
<!-- Never use this -->
<div *ngIf="condition">Content</div>
<div *ngFor="let item of items">{{ item.name }}</div>

<!-- Always use this -->
@if (condition) {
    <div>Content</div>
}

@if (isLoading) {
    <p>Loading...</p>
} @else {
    <div>Content</div>
}

@for (item of items; track item.id) {
    <div>{{ item.name }}</div>
}
```

## Signals

Use Angular Signals for all reactive state. No RxJS Subjects for local component state.

```typescript
protected readonly isLoading = signal(false)
protected readonly items = signal<Item[]>([])

// Derived state
protected readonly isEmpty = computed(() => this.items().length === 0)

// In template
@if (isLoading()) {
    <p>Loading...</p>
}
```

## Dependency Injection

Always use `inject()` — never constructor injection.

```typescript
export class MyComponent {
    private readonly router = inject(Router)
    private readonly workspaceStore = inject(WorkspaceStore)
}
```
