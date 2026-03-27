import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'apps/harmon-cli',
  'packages/harmon-apple',
  'packages/harmon-flow',
  'packages/harmon-spotify',
  'packages/harmon-core',
  'packages/harmon-store',
  'packages/harmon-crypto',
  'packages/harmon-protocol',
  'packages/harmon-youtube',
  'apps/harmond',
])
