import { describe, it, expect } from 'vitest'
import { DeviceKind, DeviceOS, SourceInfo, HardConstraints } from './index.js'

describe('harmon-protocol', () => {
  describe('DeviceKind', () => {
    it('should accept valid device kinds', () => {
      expect(() => DeviceKind.parse('cli')).not.toThrow()
      expect(() => DeviceKind.parse('menubar')).not.toThrow()
      expect(() => DeviceKind.parse('voice')).not.toThrow()
    })

    it('should reject invalid device kinds', () => {
      expect(() => DeviceKind.parse('invalid')).toThrow()
    })
  })

  describe('DeviceOS', () => {
    it('should accept valid OS types', () => {
      expect(() => DeviceOS.parse('macos')).not.toThrow()
      expect(() => DeviceOS.parse('windows')).not.toThrow()
      expect(() => DeviceOS.parse('wsl')).not.toThrow()
      expect(() => DeviceOS.parse('linux')).not.toThrow()
    })

    it('should reject invalid OS types', () => {
      expect(() => DeviceOS.parse('android')).toThrow()
    })
  })

  describe('SourceInfo', () => {
    it('should validate valid source info', () => {
      const validSource = {
        kind: 'cli' as const,
        device: 'macos' as const,
      }
      expect(() => SourceInfo.parse(validSource)).not.toThrow()
    })

    it('should reject invalid source info', () => {
      const invalidSource = {
        kind: 'invalid',
        device: 'macos',
      }
      expect(() => SourceInfo.parse(invalidSource)).toThrow()
    })
  })

  describe('HardConstraints', () => {
    it('should validate valid hard constraints', () => {
      const validConstraints = {
        noVocals: true,
        explicit: 'avoid' as const,
        tempo: { min: 100, max: 140 },
        energy: { min: 0.5, max: 0.9 },
        instrumentalnessMin: 0.7,
      }
      expect(() => HardConstraints.parse(validConstraints)).not.toThrow()
    })

    it('should accept empty constraints', () => {
      expect(() => HardConstraints.parse({})).not.toThrow()
    })

    it('should reject out-of-range energy values', () => {
      const invalidConstraints = {
        energy: { min: -0.1, max: 0.9 },
      }
      expect(() => HardConstraints.parse(invalidConstraints)).toThrow()
    })

    it('should reject out-of-range instrumentalness values', () => {
      const invalidConstraints = {
        instrumentalnessMin: 1.5,
      }
      expect(() => HardConstraints.parse(invalidConstraints)).toThrow()
    })
  })
})
