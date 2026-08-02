# Domain Docs

Canvas Panels uses a single-context domain-documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root, when present.
- Relevant decisions under `docs/adr/`, when present.

If these files do not exist, proceed silently. Create them lazily through domain-modeling when terminology or architectural decisions are actually resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Use the glossary’s vocabulary

Use canonical terms from `CONTEXT.md` in issues, APIs, tests, and documentation. If a needed concept is absent, reconsider the term or resolve the gap through domain-modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.
