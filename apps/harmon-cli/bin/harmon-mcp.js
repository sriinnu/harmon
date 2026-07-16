#!/usr/bin/env node
/**
 * harmon-mcp — Standalone MCP server entry point for the bundled distribution.
 *
 * Bundled by esbuild into dist/bin/harmon-mcp.js alongside the CLI and
 * daemon binaries. Delegates to harmon-flow's MCP CLI (stdio by default,
 * streamable HTTP with --http), so `npm i -g @sriinnu/harmon` provides the
 * same `harmon-mcp` binary the monorepo does.
 */
import '@sriinnu/harmon-flow/mcp-cli';
