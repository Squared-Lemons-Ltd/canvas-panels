# Private package delivery

`@squaredlemons/canvas-panels` is intended for restricted publication on the npm registry. This repository does not contain npm credentials and the package remains marked `private` until the Package Gate authorizes the first real `0.x` release.

## Verified delivery path

The package is built as ES2022 ESM, packed with `npm pack`, and installed from the generated tarball into clean temporary React 19 and Next.js consumers by:

```sh
pnpm pack:check
```

The check verifies the tarball manifest, rejects source and build-script leakage, confirms lockfile integrity for the installed tarball, imports every JavaScript subpath, resolves the stylesheet, and production-builds the clean Next consumer. It does not publish anything.

Repository fixtures exercise the same package exports through the pnpm workspace:

```sh
pnpm build
```

## npm registry status

Checked on 7 August 2026:

- `npm whoami` returns `ENEEDAUTH`; this machine is not authenticated to npm.
- npm CLI organization access lookup returns `E404 Scope not found` for `squaredlemons`.
- `https://www.npmjs.com/org/squaredlemons` returns `NotFoundError: Scope not found` while signed out.
- `@squaredlemons/canvas-panels` returns `E404`, so there is no publicly visible package occupying the intended name. A private package cannot be distinguished from an absent package while unauthenticated.

Therefore organization ownership, private-package billing/access, and developer read access remain an external prerequisite. An npm organization owner must create or confirm the `squaredlemons` organization and authenticate locally before those checks can be completed. No placeholder package should be published to reserve the name.

After authentication, verify without printing credentials:

```sh
npm whoami
npm access list packages squaredlemons --json
npm view @squaredlemons/canvas-panels name version --json
```

The final command should continue to return `E404` until the first approved release.

## Trusted publishing route

npm's trusted-publishing documentation supports GitHub Actions through OIDC. When the first real release is authorized:

1. Add a trusted publisher for GitHub organization `Squared-Lemons-Ltd`, repository `canvas-panels`, and the exact release workflow filename.
2. Use a GitHub-hosted runner with `permissions: id-token: write` and `contents: read`.
3. Configure `actions/setup-node` for `https://registry.npmjs.org`.
4. Install private dependencies with a separate read-only token if needed; do not use it for publishing.
5. Run the complete Package Gate before `npm publish`.
6. Publish with OIDC and no long-lived publish token.

The normal CI workflow deliberately has only `contents: read` and contains no publishing command. A release workflow must not be added until a real package release is approved and the exact workflow identity can be registered on npm.

Because this is a private GitHub repository, npm provenance attestations are not supported. `publishConfig.provenance` is explicitly `false`; this does not prevent OIDC trusted publishing.

Primary reference: [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/), reviewed 7 August 2026.
