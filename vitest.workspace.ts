import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'apps/harmon-cli',
  'packages/harmon-flow',
  'packages/harmon-spotify',
  'packages/harmon-core',
  'packages/harmon-store',
  'packages/harmon-crypto',
  'packages/harmon-protocol',
  'apps/harmond',
])
