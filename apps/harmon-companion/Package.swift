// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "harmon-companion",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "HarmonCompanion",
            targets: ["HarmonCompanion"]
        ),
    ],
    targets: [
        .target(
            name: "HarmonCompanion"
        ),
        .testTarget(
            name: "HarmonCompanionTests",
            dependencies: ["HarmonCompanion"]
        ),
    ]
)
