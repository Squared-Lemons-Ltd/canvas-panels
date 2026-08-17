# Canvas Panels

Reusable Canvas Panels interaction framework for Squared Lemons React applications.

## Interactive showcase

Run the polished React showcase to explore typed panel navigation, semantic reuse,
branch replacement, nested Workspace isolation, and guarded Save / Discard / Stay
transitions:

```sh
pnpm install
pnpm showcase:dev
```

Open the local URL printed by Vite, then choose a project, open its creative brief,
make an edit, and try closing the Panel or switching projects.

## Repository commands

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

`pnpm pack:check` builds an unpublished tarball and verifies it in clean temporary React and Next consumers. It does not publish the package.

See [Package delivery](docs/delivery/package-delivery.md) for the registry, clean-consumer, and trusted-publishing contract.
