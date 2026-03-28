# Testing Guide for Harmon

This document describes how to use the Vitest testing infrastructure in the Harmon monorepo.

## Overview

Harmon uses [Vitest](https://vitest.dev/) for testing across all packages. The testing setup is configured for a pnpm monorepo workspace with the following features:

- TypeScript support
- Coverage reporting with v8
- Workspace-aware configuration
- UI mode for interactive test running
- Fast parallel execution

## Running Tests

### All Packages

```bash
# Run tests in watch mode (default)
pnpm test

# Run tests once
pnpm test:run

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui
```

### Individual Packages

```bash
# Navigate to a package
cd packages/harmon-core

# Run tests for this package only
pnpm test

# Run with coverage
pnpm test:coverage
```

### Using Turbo

You can also use Turbo to run tests across the monorepo:

```bash
# Run all tests via Turbo (uses cached results)
turbo run test:run

# Force run all tests
turbo run test:run --force
```

## Writing Tests

### Test File Location

Place test files alongside your source files with the naming convention:

- `*.test.ts` - For unit tests
- `*.spec.ts` - For integration/spec tests

Example structure:
```
packages/harmon-core/src/
  ├── engine.ts
  ├── engine.test.ts
  ├── ranking.ts
  └── ranking.test.ts
```

### Example Test

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './myFunction.js'

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction('input')).toBe('expected output')
  })
})
```

### Globals

All Vitest configurations have `globals: true` enabled, so you don't need to import `describe`, `it`, `expect`, etc. However, it's recommended to import them explicitly for better IDE support.

## Package-Specific Configurations

### harmon-core

- Environment: Node.js
- Includes path aliases for `@sriinnu/harmon-protocol`
- Test files: `src/**/*.{test,spec}.ts`

### harmon-store

- Environment: Node.js
- Test timeout: 10 seconds (for database operations)
- Test files: `src/**/*.{test,spec}.ts`

### harmon-crypto

- Environment: Node.js
- Standard configuration
- Test files: `src/**/*.{test,spec}.ts`

### harmon-protocol

- Environment: Node.js
- Perfect for testing Zod schemas
- Test files: `src/**/*.{test,spec}.ts`

### harmond

- Environment: Node.js
- Test timeout: 15 seconds (for integration tests)
- Includes path aliases for all workspace packages
- Test files: `src/**/*.{test,spec}.ts`

## Coverage

Coverage is configured to use the v8 provider and generates three formats:

- Text (console output)
- JSON (for CI/tooling)
- HTML (for detailed browsing)

Coverage reports are generated in each package's `coverage/` directory.

### Coverage Exclusions

The following are excluded from coverage:

- Test files (`*.test.ts`, `*.spec.ts`)
- Test directories (`__tests__/`)
- Build output (`dist/`)
- Node modules

## Workspace Configuration

The monorepo uses a Vitest workspace configuration (`vitest.workspace.ts`) that includes:

- `packages/harmon-core`
- `packages/harmon-store`
- `packages/harmon-crypto`
- `packages/harmon-protocol`
- `apps/harmond`

This allows you to run tests across all packages from the root directory.

## Best Practices

1. **Test Naming**: Use descriptive test names that explain what is being tested
2. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification phases
3. **Isolation**: Each test should be independent and not rely on other tests
4. **Mocking**: Use Vitest's mocking capabilities for external dependencies
5. **Coverage**: Aim for high coverage but focus on meaningful tests over raw percentages

## Useful Commands

```bash
# Watch mode with file filtering
pnpm test -- engine

# Run specific test file
pnpm test -- path/to/test.test.ts

# Update snapshots
pnpm test -- -u

# Run tests matching a pattern
pnpm test -- -t "pattern"

# Show verbose output
pnpm test -- --reporter=verbose
```

## CI/CD Integration

For continuous integration, use:

```bash
pnpm test:coverage
```

This runs all tests once and generates coverage reports suitable for CI systems.

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors in tests, ensure:
- The package has been built (`pnpm build`)
- TypeScript types are up to date
- Path aliases are correctly configured in `vitest.config.ts`

### Module Resolution

If you see module resolution errors:
- Check that `type: "module"` is set in package.json
- Ensure imports use `.js` extension for TypeScript files
- Verify path aliases match the workspace structure

### Timeout Errors

If tests timeout:
- Increase `testTimeout` in the relevant `vitest.config.ts`
- Check for unresolved promises or missing awaits
- Ensure async cleanup is handled properly

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Library](https://testing-library.com/) (if needed for UI components)
