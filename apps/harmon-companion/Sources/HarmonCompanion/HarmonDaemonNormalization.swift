import Foundation

/// I normalize one heterogeneous daemon payload into a stable companion item list.
func normalizeMediaItems(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: Any
) -> [CompanionMediaItem] {
    switch payload {
    case let dictionary as [String: Any]:
        return normalizeDictionaryPayload(provider: provider, kind: kind, payload: dictionary)
    case let array as [[String: Any]]:
        return normalizeArrayPayload(provider: provider, kind: kind, payload: array)
    default:
        return []
    }
}

/// I unwrap the mixed search/list payloads the daemon exposes per provider.
func normalizeDictionaryPayload(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: [String: Any]
) -> [CompanionMediaItem] {
    switch (provider, kind) {
    case (.spotify, .song):
        return normalizeTrackArray(provider: provider, kind: kind, payload: unwrapSpotifyItems(payload["tracks"]))
    case (.spotify, .playlist):
        return normalizeCatalogArray(provider: provider, kind: kind, payload: unwrapSpotifyItems(payload["playlists"]))
    case (.spotify, .album):
        return normalizeCatalogArray(provider: provider, kind: kind, payload: unwrapSpotifyItems(payload["albums"]))
    case (.spotify, .artist):
        return normalizeCatalogArray(provider: provider, kind: kind, payload: unwrapSpotifyItems(payload["artists"]))
    case (.apple, _):
        return normalizeAppleDictionary(provider: provider, kind: kind, payload: payload)
    case (.youtube, _):
        return normalizeYouTubeDictionary(provider: provider, kind: kind, payload: payload)
    }
}

/// I unwrap array-first payloads like library and playlist-track routes.
func normalizeArrayPayload(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: [[String: Any]]
) -> [CompanionMediaItem] {
    switch kind {
    case .song:
        return normalizeTrackArray(provider: provider, kind: kind, payload: payload)
    case .playlist, .album, .artist:
        return normalizeCatalogArray(provider: provider, kind: kind, payload: payload)
    }
}

private func normalizeAppleDictionary(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: [String: Any]
) -> [CompanionMediaItem] {
    let key = kind == .song ? "songs" : "\(kind.rawValue)s"
    let candidates = payload[key]
    if kind == .song {
        return normalizeTrackArray(provider: provider, kind: kind, payload: candidates as Any)
    }
    return normalizeCatalogArray(provider: provider, kind: kind, payload: candidates as Any)
}

private func normalizeYouTubeDictionary(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: [String: Any]
) -> [CompanionMediaItem] {
    let key = kind == .song ? "songs" : "\(kind.rawValue)s"
    let candidates = payload[key]
    if kind == .song {
        return normalizeTrackArray(provider: provider, kind: kind, payload: candidates as Any)
    }
    return normalizeCatalogArray(provider: provider, kind: kind, payload: candidates as Any)
}

private func normalizeTrackArray(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: Any
) -> [CompanionMediaItem] {
    guard let array = payload as? [Any] else {
        return []
    }

    return array.compactMap { candidate in
        guard let item = candidate as? [String: Any] else {
            return nil
        }

        let title = firstString(item["name"], item["title"])
        guard let title else {
            return nil
        }

        let identifier = firstString(item["id"]) ?? title
        return CompanionMediaItem(
            album: firstString(item["album"], item["albumName"]),
            durationMs: firstInt(item["durationMs"]),
            id: identifier,
            imageURL: firstString(item["imageUrl"], item["thumbnailUrl"]),
            kind: kind,
            provider: provider,
            subtitle: firstString(item["artist"], item["artistName"]),
            title: title,
            uri: firstString(item["uri"]) ?? defaultTrackURI(provider: provider, kind: kind, id: identifier),
            url: firstString(item["url"])
        )
    }
}

private func normalizeCatalogArray(
    provider: CompanionProvider,
    kind: CompanionSearchKind,
    payload: Any
) -> [CompanionMediaItem] {
    guard let array = payload as? [Any] else {
        return []
    }

    return array.compactMap { candidate in
        guard let item = candidate as? [String: Any] else {
            return nil
        }

        let title = firstString(item["name"], item["title"])
        guard let title else {
            return nil
        }

        let identifier = firstString(item["id"]) ?? title
        return CompanionMediaItem(
            id: identifier,
            imageURL: firstString(item["imageUrl"], item["thumbnailUrl"]),
            kind: kind,
            provider: provider,
            subtitle: firstString(item["artistName"], item["owner"], item["curatorName"], item["author"], item["publisher"]),
            title: title,
            uri: firstString(item["uri"]) ?? defaultCatalogURI(provider: provider, kind: kind, id: identifier),
            url: firstString(item["url"])
        )
    }
}

private func unwrapSpotifyItems(_ payload: Any?) -> Any {
    if let dictionary = payload as? [String: Any], let items = dictionary["items"] {
        return items
    }
    return payload as Any
}

private func firstString(_ values: Any?...) -> String? {
    for value in values {
        if let text = value as? String, !text.isEmpty {
            return text
        }
    }
    return nil
}

private func firstInt(_ value: Any?) -> Int? {
    if let number = value as? Int {
        return number
    }
    if let number = value as? Double {
        return Int(number)
    }
    return nil
}

private func defaultTrackURI(provider: CompanionProvider, kind: CompanionSearchKind, id: String) -> String? {
    switch provider {
    case .spotify:
        return "spotify:\(kind == .song ? "track" : kind.rawValue):\(id)"
    case .apple:
        return "apple:\(kind.rawValue):\(id)"
    case .youtube:
        return "youtube:video:\(id)"
    }
}

private func defaultCatalogURI(provider: CompanionProvider, kind: CompanionSearchKind, id: String) -> String? {
    switch provider {
    case .spotify:
        return "spotify:\(kind.rawValue):\(id)"
    case .apple:
        return "apple:\(kind.rawValue):\(id)"
    case .youtube:
        return kind == .playlist ? "youtube:playlist:\(id)" : nil
    }
}
