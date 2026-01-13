/**
 * Harmon Spotify - Spotify API client, OAuth, and device control
 */
export function createSpotifyClient() {
    return {
        isConnected() { return false; },
        async getDevices() { return []; },
        async transferTo() { },
        async play() { },
        async pause() { },
        async next() { },
        async getNowPlaying() { return null; },
        async addToQueue() { },
    };
}
//# sourceMappingURL=index.js.map