/**
 * Harmon CLI - Thin client that calls the daemon
 */
type Command = {
    id: string;
    ts: number;
    source: {
        kind: string;
        device: string;
    };
    type: string;
    payload: Record<string, unknown>;
};
export interface CLIConfig {
    endpoint: string;
}
export declare function createCLI(config: CLIConfig): {
    status(): Promise<unknown>;
    command(cmd: Command): Promise<unknown>;
    devices(): Promise<unknown>;
    useDevice(deviceId: string): Promise<unknown>;
};
export declare function getDefaultEndpoint(): string;
export {};
//# sourceMappingURL=index.d.ts.map