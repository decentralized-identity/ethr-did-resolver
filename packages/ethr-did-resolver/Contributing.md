# How to contribute to ethr-did-resolver

We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features

## Report a bug with detail, background and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
    - Be specific!
    - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)
- You get extra kudos if you attach a failing test demonstrating that bug

## Submitting improvements

### Commit messages

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.
[Changesets](https://changesets.dev) is used to manage automated release versioning, changelogs and
publication, triggered from the conventional commit messages.
Please see some [commit message examples](https://github.com/semantic-release/semantic-release#commit-message-format)

Every PR that changes published code must include a changeset (run `pnpm changeset` and answer the
prompts), otherwise the release automation won't know what to release. The Changesets Action opens
a versioning PR and publishes new versions when it lands on `master`.

### Code style

Use the built-in code formatter (`pnpm run format`) before committing code. It makes lives much easier.

### Submitting a fix

- Branch off of `master`
- Wherever possible, commit at least one test to demonstrate the bug
- Commit your code to fix that bug
- Create a PR for it
    - Mention the issue you're fixing in the PR (Example: **Closes #17**)

### Submitting a proposal

We prefer to discuss proposals before accepting them into the codebase.
Open an issue with as much detail and background as possible to make your case.
Small proposals can come in directly as PRs, but it's generally better to discuss before starting work.

Any contributions you make will be under the Apache-2.0 License

### Posting PRs

- Describe your changes in the PR description.
- Mention issues that should be fixed or closed when the PR is merged.
- Make sure any new code has tests associated!
- Make sure the documentation is still valid if your changes get included.

Thank you for your contribution!
