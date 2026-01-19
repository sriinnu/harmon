/**
 * Harmon Apple - Apple Music API client
 */
const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';
class AppleMusicClientImpl {
    developerToken;
    userToken;
    storefront;
    constructor(config) {
        if (!config.developerToken) {
            throw new Error('Missing Apple Music developer token');
        }
        this.developerToken = config.developerToken;
        this.userToken = config.userToken;
        this.storefront = config.storefront || 'us';
    }
    async search(term, types, options = {}) {
        const data = await this.request(`/catalog/${this.storefront}/search`, {
            term,
            types: types.join(','),
            ...listQuery(options),
        });
        return {
            songs: (data.results?.songs?.data || []).map(mapSong),
            albums: (data.results?.albums?.data || []).map(mapAlbum),
            artists: (data.results?.artists?.data || []).map(mapArtist),
            playlists: (data.results?.playlists?.data || []).map(mapPlaylist),
        };
    }
    async getSong(id) {
        const data = await this.request(`/catalog/${this.storefront}/songs/${id}`);
        return data.data?.[0] ? mapSong(data.data[0]) : null;
    }
    async getAlbum(id) {
        const data = await this.request(`/catalog/${this.storefront}/albums/${id}`);
        return data.data?.[0] ? mapAlbum(data.data[0]) : null;
    }
    async getArtist(id) {
        const data = await this.request(`/catalog/${this.storefront}/artists/${id}`);
        return data.data?.[0] ? mapArtist(data.data[0]) : null;
    }
    async getPlaylist(id) {
        const data = await this.request(`/catalog/${this.storefront}/playlists/${id}`);
        return data.data?.[0] ? mapPlaylist(data.data[0]) : null;
    }
    async getLibrarySongs(options = {}) {
        const data = await this.request('/me/library/songs', listQuery(options), true);
        return (data.data || []).map(mapLibrarySong);
    }
    async getLibraryAlbums(options = {}) {
        const data = await this.request('/me/library/albums', listQuery(options), true);
        return (data.data || []).map(mapLibraryAlbum);
    }
    async getLibraryPlaylists(options = {}) {
        const data = await this.request('/me/library/playlists', listQuery(options), true);
        return (data.data || []).map(mapLibraryPlaylist);
    }
    async request(path, query, requireUserToken = false) {
        const url = new URL(`${APPLE_MUSIC_API_BASE}${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                url.searchParams.set(key, value);
            }
        }
        const headers = {
            Authorization: `Bearer ${this.developerToken}`,
        };
        if (requireUserToken) {
            if (!this.userToken) {
                throw new Error('Apple Music user token required for library endpoints');
            }
            headers['Music-User-Token'] = this.userToken;
        }
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Apple Music API error: ${response.status} ${detail}`);
        }
        return (await response.json());
    }
}
function listQuery(options) {
    const query = {};
    if (typeof options.limit === 'number') {
        query.limit = options.limit.toString();
    }
    if (typeof options.offset === 'number') {
        query.offset = options.offset.toString();
    }
    return query;
}
function mapSong(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        artistName: resource.attributes.artistName,
        albumName: resource.attributes.albumName,
        durationMs: resource.attributes.durationInMillis,
        url: resource.attributes.url,
    };
}
function mapAlbum(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        artistName: resource.attributes.artistName,
        releaseDate: resource.attributes.releaseDate,
        trackCount: resource.attributes.trackCount,
        url: resource.attributes.url,
    };
}
function mapArtist(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        url: resource.attributes.url,
    };
}
function mapPlaylist(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        curatorName: resource.attributes.curatorName,
        trackCount: resource.attributes.trackCount,
        url: resource.attributes.url,
    };
}
function mapLibrarySong(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        artistName: resource.attributes.artistName,
        albumName: resource.attributes.albumName,
    };
}
function mapLibraryAlbum(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        artistName: resource.attributes.artistName,
        trackCount: resource.attributes.trackCount,
    };
}
function mapLibraryPlaylist(resource) {
    return {
        id: resource.id,
        name: resource.attributes.name,
        trackCount: resource.attributes.trackCount,
    };
}
export function createAppleMusicClient(config) {
    return new AppleMusicClientImpl(config);
}
//# sourceMappingURL=index.js.map