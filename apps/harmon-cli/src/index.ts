/**
 * Harmon CLI - Thin client that calls the daemon
 */

// Placeholder type - will be imported from built harmon-protocol
type Command = {
  id: string;
  ts: number;
  source: { kind: string; device: string };
  type: string;
  payload: Record<string, unknown>;
};

const DEFAULT_ENDPOINT = 'http://127.0.0.1:17373';

export interface CLIConfig {
  endpoint: string;
  token?: string;
}

export function createCLI(config: CLIConfig) {
  const authHeaders = config.token ? { Authorization: `Bearer ${config.token}` } : {};

  return {
    async status() {
      const res = await fetch(`${config.endpoint}/v1/status`, {
        headers: authHeaders,
      });
      return res.json();
    },
    async command(cmd: Command) {
      const res = await fetch(`${config.endpoint}/v1/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(cmd),
      });
      return res.json();
    },
    async devices() {
      const res = await fetch(`${config.endpoint}/v1/devices`, {
        headers: authHeaders,
      });
      return res.json();
    },
    async useDevice(deviceId: string) {
      const res = await fetch(`${config.endpoint}/v1/device/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ deviceId }),
      });
      return res.json();
    },
  };
}

export function getDefaultEndpoint(): string {
  return process.env.HARMON_ENDPOINT || DEFAULT_ENDPOINT;
}
