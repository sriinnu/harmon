import { describe, it, expect } from 'vitest'
import { DaemonStatus, DeviceKind, DeviceOS, Event, SourceInfo, HardConstraints, MusicProviderName, TrackInfo, validateCommand, validatePolicy } from './index.js'

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

  describe('MusicProviderName', () => {
    it('should accept supported provider names', () => {
      expect(() => MusicProviderName.parse('spotify')).not.toThrow()
      expect(() => MusicProviderName.parse('apple')).not.toThrow()
      expect(() => MusicProviderName.parse('youtube')).not.toThrow()
    })

    it('should reject unsupported provider names', () => {
      expect(() => MusicProviderName.parse('tidal')).toThrow()
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

  describe('TrackInfo', () => {
    it('should accept track info with non-empty identity fields', () => {
      expect(() =>
        TrackInfo.parse({
          id: 'track_1',
          name: 'Track Name',
          artist: 'Artist Name',
          album: 'Album Name',
          durationMs: 123000,
        })
      ).not.toThrow()
    })

    it('should reject empty id, name, or artist fields', () => {
      expect(() =>
        TrackInfo.parse({
          id: '',
          name: 'Track Name',
          artist: 'Artist Name',
          album: 'Album Name',
          durationMs: 123000,
        })
      ).toThrow()

      expect(() =>
        TrackInfo.parse({
          id: 'track_1',
          name: '',
          artist: 'Artist Name',
          album: 'Album Name',
          durationMs: 123000,
        })
      ).toThrow()
    })
  })

  describe('Command', () => {
    it('should accept supported command types', () => {
      expect(() =>
        validateCommand({
          id: 'c_1',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.stop',
        })
      ).not.toThrow()
    })

    it('should reject endpoint-specific command types that are not part of the shared command envelope', () => {
      expect(() =>
        validateCommand({
          id: 'c_2',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'device.use',
          payload: { deviceId: 'abc123' },
        })
      ).toThrow()

      expect(() =>
        validateCommand({
          id: 'c_3',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'auth.spotify.login',
        })
      ).toThrow()
    })
  })

  describe('Event', () => {
    it('should accept emitted daemon event types', () => {
      expect(() =>
        Event.parse({
          id: 'e_1',
          ts: Date.now(),
          type: 'track.skipped',
          payload: { reason: 'manual-skip' },
        })
      ).not.toThrow()
    })

    it('should reject event types that the daemon does not emit', () => {
      expect(() =>
        Event.parse({
          id: 'e_2',
          ts: Date.now(),
          type: 'track.ended',
          payload: {},
        })
      ).toThrow()
    })
  })

  describe('DaemonStatus', () => {
    it('should accept provider capability and auth details', () => {
      expect(() =>
        DaemonStatus.parse({
          isRunning: true,
          version: '0.1.0',
          spotifyConnected: true,
          providers: {
            spotify: {
              connected: true,
              status: 'configured',
              auth: 'oauth',
              playbackMode: 'native',
              capabilities: {
                playback: true,
                search: true,
              },
            },
          },
        })
      ).not.toThrow()
    })
  })

  describe('SessionPolicy', () => {
    it('should accept provider-selected sessions with search-seeded sources', () => {
      expect(() =>
        validatePolicy({
          version: 1,
          provider: 'youtube',
          mode: 'focus',
          sources: {
            searchQueries: ['focus music'],
          },
        })
      ).not.toThrow()
    })
  })
})
