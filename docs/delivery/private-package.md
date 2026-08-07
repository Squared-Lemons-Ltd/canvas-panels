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

- `npm whoami` returns `jonathangill`.
- The npm profile has a verified email address and two-factor authentication set to `auth-and-writes`.
- `npm org ls squaredlemons --json` confirms that `jonathangill` owns the `squaredlemons` organization.
- `npm team ls squaredlemons:developers --json` confirms that `jonathangill` belongs to the default developers team.
- `npm access list packages squaredlemons --json` succeeds and currently returns an empty package list.
- An authenticated lookup of `@squaredlemons/canvas-panels` returns `E404`. Because the organization owner can see its private packages, this confirms that the intended package name has not been published within the scope.

The npm CLI does not expose the organization's billing plan. The organization owner confirmed on 7 August 2026 that the **Unlimited private packages** plan is active. No placeholder package was published to reserve the name.

Reverify the access path without printing credentials:

```sh
npm whoami
npm org ls squaredlemons --json
npm team ls squaredlemons:developers --json
npm access list packages squaredlemons --json
npm view @squaredlemons/canvas-panels name version --json
```

The final command should continue to return `E404` until the first approved release.

## Trusted publishing route

npm's trusted-publishing documentation supports GitHub Actions through OIDC. Trusted publishers are configured in an existing package's settings, so they cannot be registered before the first real package version exists. When the complete Package Gate authorizes that release:

1. Bootstrap the first approved restricted release from an organization owner's authenticated local npm session with write-protected 2FA; do not create an automation token.
2. Add a trusted publisher in the new package's npm settings for GitHub organization `Squared-Lemons-Ltd`, repository `canvas-panels`, and the exact release workflow filename.
3. Use a GitHub-hosted runner with `permissions: id-token: write` and `contents: read`.
4. Configure `actions/setup-node` for `https://registry.npmjs.org`.
5. Install private dependencies with a separate read-only token if needed; do not use it for publishing.
6. Run the complete Package Gate before every `npm publish`.
7. Publish subsequent releases with OIDC and no long-lived publish token.

The normal CI workflow deliberately has only `contents: read` and contains no publishing command. A release workflow must not be added until a real package release is approved and the exact workflow identity can be registered on npm.

Because this is a private GitHub repository, npm provenance attestations are not supported. `publishConfig.provenance` is explicitly `false`; this does not prevent OIDC trusted publishing.

Primary reference: [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/), reviewed 7 August 2026.
