import Foundation
import Silo

struct CookieRecord: Codable {
    let domain: String
    let name: String
    let path: String
    let value: String
    let expires: String?
    let isSecure: Bool
    let isHTTPOnly: Bool
}

struct ExportSource: Codable {
    let browser: String
    let label: String
    let count: Int
}

struct ExportResult: Codable {
    let browser: String?
    let profile: String?
    let domain: String
    let records: [CookieRecord]
    let sources: [ExportSource]
}

struct ExportOptions {
    var browser: Browser?
    var profile: String?
    var domain: String = "spotify.com"
    var includeExpired = false
}

func parseBrowser(_ value: String) -> Browser? {
    switch value.lowercased() {
    case "safari": return .safari
    case "chrome": return .chrome
    case "chrome-beta": return .chromeBeta
    case "chrome-canary": return .chromeCanary
    case "edge": return .edge
    case "edge-beta": return .edgeBeta
    case "edge-canary": return .edgeCanary
    case "firefox": return .firefox
    case "brave": return .brave
    case "brave-beta": return .braveBeta
    case "brave-nightly": return .braveNightly
    case "arc": return .arc
    case "arc-beta": return .arcBeta
    case "arc-canary": return .arcCanary
    case "chromium": return .chromium
    case "vivaldi": return .vivaldi
    case "helium": return .helium
    default: return nil
    }
}

func parseExportOptions(_ args: [String]) -> ExportOptions {
    var options = ExportOptions()
    var index = 0

    while index < args.count {
        let arg = args[index]
        switch arg {
        case "--browser":
            if index + 1 < args.count {
                options.browser = parseBrowser(args[index + 1])
                index += 1
            }
        case "--browser-profile":
            if index + 1 < args.count {
                options.profile = args[index + 1]
                index += 1
            }
        case "--domain":
            if index + 1 < args.count {
                options.domain = args[index + 1]
                index += 1
            }
        case "--include-expired":
            options.includeExpired = true
        default:
            break
        }
        index += 1
    }

    return options
}

func formatDate(_ date: Date?) -> String? {
    guard let date else { return nil }
    return ISO8601DateFormatter().string(from: date)
}

func exportCookies(options: ExportOptions) throws -> ExportResult {
    let client = BrowserCookieClient()
    let query = BrowserCookieQuery(
        domains: [options.domain],
        domainMatch: .suffix,
        includeExpired: options.includeExpired
    )

    let browsers = options.browser.map { [$0] } ?? Browser.defaultImportOrder
    var records: [CookieRecord] = []
    var sources: [ExportSource] = []

    for browser in browsers {
        do {
            let storeRecords = try client.records(matching: query, in: browser)
            for store in storeRecords where !store.records.isEmpty {
                sources.append(ExportSource(
                    browser: store.browser.rawValue,
                    label: store.label,
                    count: store.records.count
                ))
                records.append(contentsOf: store.records.map {
                    CookieRecord(
                        domain: $0.domain,
                        name: $0.name,
                        path: $0.path,
                        value: $0.value,
                        expires: formatDate($0.expires),
                        isSecure: $0.isSecure,
                        isHTTPOnly: $0.isHTTPOnly
                    )
                })
            }
        } catch {
            continue
        }
    }

    return ExportResult(
        browser: options.browser?.rawValue,
        profile: options.profile,
        domain: options.domain,
        records: records,
        sources: sources
    )
}

func writeJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    if let data = try? encoder.encode(value) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}

let args = Array(CommandLine.arguments.dropFirst())
let command = args.first ?? "export"
let options = parseExportOptions(command == "export" ? Array(args.dropFirst()) : args)

switch command {
case "export":
    do {
        let result = try exportCookies(options: options)
        if result.records.isEmpty {
            fputs("No cookies found for domain \(result.domain).\n", stderr)
            exit(3)
        }
        writeJSON(result)
    } catch {
        fputs("Cookie export failed: \(error.localizedDescription)\n", stderr)
        exit(2)
    }
default:
    fputs("Usage: harmon-silo export [--browser <name>] [--browser-profile <name>] [--domain <host>] [--include-expired]\n", stderr)
    exit(1)
}
