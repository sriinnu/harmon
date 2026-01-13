/**
 * Harmon CLI - Thin client that calls the daemon
 */
const DEFAULT_ENDPOINT = 'http://127.0.0.1:17373';
export function createCLI(config) {
    return {
        async status() {
            const res = await fetch(`${config.endpoint}/v1/status`);
            return res.json();
        },
        async command(cmd) {
            const res = await fetch(`${config.endpoint}/v1/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cmd),
            });
            return res.json();
        },
        async devices() {
            const res = await fetch(`${config.endpoint}/v1/devices`);
            return res.json();
        },
        async useDevice(deviceId) {
            const res = await fetch(`${config.endpoint}/v1/device/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId }),
            });
            return res.json();
        },
    };
}
export function getDefaultEndpoint() {
    return process.env.HARMON_ENDPOINT || DEFAULT_ENDPOINT;
}
//# sourceMappingURL=index.js.map