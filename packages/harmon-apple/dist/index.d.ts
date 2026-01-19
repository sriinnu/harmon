/**
 * Harmon Apple - Apple Music API client
 */
export interface AppleMusicConfig {
    developerToken: string;
    userToken?: string;
    storefront?: string;
}
export type AppleSearchType = 'songs' | 'albums' | 'artists' | 'playlists';
export interface AppleListOptions {
    limit?: number;
    offset?: number;
}
export interface AppleMusicSearchResult {
    songs: AppleMusicSong[];
    albums: AppleMusicAlbum[];
    artists: AppleMusicArtist[];
    playlists: AppleMusicPlaylist[];
}
export interface AppleMusicSong {
    id: string;
    name: string;
    artistName: string;
    albumName?: string;
    durationMs?: number;
    url?: string;
}
export interface AppleMusicAlbum {
    id: string;
    name: string;
    artistName: string;
    releaseDate?: string;
    trackCount?: number;
    url?: string;
}
export interface AppleMusicArtist {
    id: string;
    name: string;
    url?: string;
}
export interface AppleMusicPlaylist {
    id: string;
    name: string;
    curatorName?: string;
    trackCount?: number;
    url?: string;
}
export interface AppleMusicLibrarySong {
    id: string;
    name: string;
    artistName: string;
    albumName?: string;
}
export interface AppleMusicLibraryAlbum {
    id: string;
    name: string;
    artistName: string;
    trackCount?: number;
}
export interface AppleMusicLibraryPlaylist {
    id: string;
    name: string;
    trackCount?: number;
}
export interface AppleMusicClient {
    search(term: string, types: AppleSearchType[], options?: AppleListOptions): Promise<AppleMusicSearchResult>;
    getSong(id: string): Promise<AppleMusicSong | null>;
    getAlbum(id: string): Promise<AppleMusicAlbum | null>;
    getArtist(id: string): Promise<AppleMusicArtist | null>;
    getPlaylist(id: string): Promise<AppleMusicPlaylist | null>;
    getLibrarySongs(options?: AppleListOptions): Promise<AppleMusicLibrarySong[]>;
    getLibraryAlbums(options?: AppleListOptions): Promise<AppleMusicLibraryAlbum[]>;
    getLibraryPlaylists(options?: AppleListOptions): Promise<AppleMusicLibraryPlaylist[]>;
}
export declare function createAppleMusicClient(config: AppleMusicConfig): AppleMusicClient;
//# sourceMappingURL=index.d.ts.map