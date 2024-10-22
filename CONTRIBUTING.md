# Release Process
This repository uses [semantic-release](https://github.com/semantic-release/semantic-release) for it's releases.  That means that any commit that goes into `main` will potentially trigger a release and contribute to the changelog.

# Pull Request Guidelines
Pull request titles must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format.  

The general format is: `<type>[optional scope]: <description>`

Some examples of this are:

- `feat(diagnostics): Added client-side statistics to the diagnostics view`
- `chore: Added CONTRIBUTING.md`

To see the current list of supported types, see [CI.yml](./.github/workflows/ci.yml#L13)'s 'Lint PR Title' task.

# Tests

Create tests using vitest.
Follow the convention `sourcefilename.test.ts` when adding new files.

To run tests use the command:
```
npm run test
```

Optionally install [vitest extension](https://marketplace.visualstudio.com/items?itemName=vitest.explorer).