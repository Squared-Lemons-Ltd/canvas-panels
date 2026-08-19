# Domain Docs

Canvas Panels uses a single-context domain-documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root — the glossary, and normative.
- `docs/delivery/public-contract.md` — what the package has frozen, and the
  versioning policy that governs changing it.

Architectural decisions are recorded in those two documents and in the comments
on the delivery path itself, rather than in a separate ADR directory. There is no
`docs/adr/`; do not create one without agreeing it first, because a decision
recorded in a second place is a decision that can disagree with itself.

## Layout

```text
/
├── CONTEXT.md                    domain glossary
├── AGENTS.md                     how to work in this repository
├── docs/
│   ├── agents/                   tracker and triage conventions
│   └── delivery/                 contract, registry, release evidence
├── packages/canvas-panels/       the published package
├── apps/                         proof consumer and clean-consumer fixtures
├── skills/                       the consumer-facing agent skill
└── tests/                        the contract suite
```

## Use the glossary's vocabulary

Use canonical terms from `CONTEXT.md` in issues, APIs, tests, and documentation.
If a needed concept is absent, reconsider the term or resolve the gap through
domain-modeling.

## Flag contract conflicts

If proposed work contradicts `docs/delivery/public-contract.md`, surface the
conflict explicitly instead of silently overriding the decision. The contract
suite will catch the change; it cannot tell you the change was a mistake.
