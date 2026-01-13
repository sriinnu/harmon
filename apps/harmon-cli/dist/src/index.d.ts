/**
 * Harmon CLI - Thin client that calls the daemon
 */
import type { Command } from '../../packages/harmon-protocol/dist/index.js';
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
//# sourceMappingURL=index.d.ts.map