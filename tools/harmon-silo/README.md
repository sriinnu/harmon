# harmon-silo helper

Small Swift helper for exporting browser cookies using the Silo library.

## Requirements

- macOS 13+
- Swift 6 (Xcode 15+ or Swift toolchain)

## Build + Run

```
swift run --package-path tools/harmon-silo harmon-silo export --browser chrome --domain spotify.com
```

## Output

The helper prints JSON to stdout:

```
{
  "browser": "chrome",
  "profile": null,
  "domain": "spotify.com",
  "records": [ ... ],
  "sources": [ ... ]
}
```

## CLI integration

`harmon auth import` will call this helper automatically. To use a prebuilt
binary, set:

```
HARMON_SILO_HELPER=/path/to/harmon-silo
```
