# ethr-did monorepo

Monorepo workspace for the `did:ethr` ecosystem libraries, managed with [pnpm workspaces](https://pnpm.io/workspaces)
and released with [changesets](https://changesets.dev).

## Packages

| Package | Description |
| --- | --- |
| [`ethr-did-resolver`](packages/ethr-did-resolver) | Resolve DID documents for Ethereum addresses and public keys |

## Getting started

Requires Node.js ≥ 20 and pnpm (see `packageManager` in the root `package.json`; enable
[Corepack](https://nodejs.org/api/corepack.html) or install with `npm i -g pnpm@11.20.0`).

```sh
pnpm install        # install all workspace dependencies
pnpm build          # build every package (CJS + ESM)
pnpm test           # run every package's test suite
pnpm lint           # lint every package
pnpm format         # format every package
```

Individual packages can be targeted with `pnpm --filter <name> <script>`:

```sh
pnpm --filter ethr-did-resolver test -- --watch
```

## Project layout

```
packages/
  <package>/        # one publishable library per folder
  ethr-did-resolver/
    src/            # package source
    lib.commonjs/   # build output (CJS, generated)
    lib.esm/        # build output (ESM, generated)
.changeset/         # changesets (release management)
```

## Release workflow

Releases are driven by [changesets](https://changesets.dev) — see
[`.changeset/README.md`](.changeset/README.md) for the full flow. In short:

1. Run `pnpm changeset` in the package(s) you changed and commit the generated file.
2. The [Changesets GitHub Action](.github/workflows/release.yml) opens a
   `chore(release): version packages` PR on `master`.
3. Merging it bumps versions, updates `CHANGELOG.md` files, publishes the packages to npm
   and creates GitHub releases.

Each package is versioned and tagged independently (tags look like `ethr-did-resolver@14.2.0`).

The release pipeline needs **no repository secrets**:

- npm publishing uses [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers)
  (`id-token: write`), which also attaches provenance automatically for public packages in
  this public repository. The npm-side publisher (package settings → Access → Trusted
  Publisher) must point at this repository with the workflow file name `release.yml`.
- All GitHub-side work (version PR, tags, releases) uses the built-in `github.token` — the
  Changesets Action's `github-token` input already defaults to it, so no token needs to be passed.

## License

Apache-2.0 — see [LICENSE](LICENSE).