// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "harmon-silo",
    platforms: [
        .macOS(.v13),
    ],
    dependencies: [
        .package(path: "../Silo"),
    ],
    targets: [
        .executableTarget(
            name: "harmon-silo",
            dependencies: [
                .product(name: "Silo", package: "Silo"),
            ])
    ]
)
