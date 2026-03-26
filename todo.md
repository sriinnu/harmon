# Harmon - TODO

## Completed
- Monorepo setup with Turborepo, TypeScript, ESM
- harmon-protocol with Zod schemas (Command, Event, Policy)
- harmon-store with SQLite (libsql) migrations
- harmon-core session engine
- harmon-spotify integration
- harmon-flow MCP server with graph-based pattern detection
- harmond daemon with HTTP+SSE API
- harmon-cli CLI application
- Comprehensive README with SVG logo
- All packages build successfully

## Next Steps

### Testing & Validation
- Test harmond daemon starts correctly
- Test SSE event streaming
- Test SQLite persistence
- Test MCP server tools
- Test harmon-cli commands

### Bug Fixes
- harmon-flow imports harmon-store (may have build issues)
- Verify all package.json exports are correct
- Check for any TypeScript strict mode errors

### Polish
- Add .gitignore
- Add CI/CD configuration (GitHub Actions)
- Add contributing guidelines
- Create example configuration files
- Add Docker support

## Commands to Continue

```bash
# Start the daemon
cd /mnt/c/sriinnu/personal/harmon
pnpm --filter @athena/harmond start

# Test health endpoint
curl http://localhost:17373/health

# Run MCP server
pnpm --filter @athena/harmon-flow start

# Run CLI
pnpm --filter @athena/harmon -- help
```
