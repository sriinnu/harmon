import { describe, expect, it } from 'vitest';
import { appleSongIdFromUrl } from './apple';

describe('appleSongIdFromUrl', () => {
  it('extracts the i= track param from album URLs', () => {
    expect(appleSongIdFromUrl('https://music.apple.com/us/album/thriller/269572838?i=269573364')).toBe('269573364');
  });

  it('extracts trailing ids from song URLs', () => {
    expect(appleSongIdFromUrl('https://music.apple.com/us/song/billie-jean/269573364')).toBe('269573364');
  });

  it('rejects non-apple and malformed URLs', () => {
    expect(appleSongIdFromUrl('https://open.spotify.com/track/x')).toBeNull();
    expect(appleSongIdFromUrl('https://music.apple.com/us/album/no-track-param/123')).toBeNull();
    expect(appleSongIdFromUrl('not a url')).toBeNull();
  });
});
