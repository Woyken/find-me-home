## General guidelines

Avoid `as` type casting. Reuse types and be specific. Inferred types are best types.
Prioritize fine-grained reactivity.
createEffect takes two functions — (compute, apply, options?)
Use `createOptimistic` whenever possible. With `action(function()*...)`, `refresh`, `affects`
stores are mutable

```typescript
const [state, setState] = createStore({ todos: [] });
setState((draft) => {
  draft.todos.push(newTodo);
});
```

use `isPending`

## Agent Skills

### Issue Tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage Labels

Triage uses the five canonical label names without overrides. See `docs/agents/triage-labels.md`.

### Domain Docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
