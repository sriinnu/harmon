// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "harmon-menubar",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "HarmonMenubar"
        ),
        .testTarget(
            name: "HarmonMenubarTests",
            dependencies: ["HarmonMenubar"]
        ),
    ]
)
