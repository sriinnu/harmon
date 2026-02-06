import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/harmon-core',
  'packages/harmon-store',
  'packages/harmon-crypto',
  'packages/harmon-protocol',
  'apps/harmond',
])
