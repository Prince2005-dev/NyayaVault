import type { Server } from 'node:http';
import { createApp } from './app.js';
import { loadAppConfig } from './config/app.config.js';

/**
 * Starts the NyayaVault Express HTTP server.
 *
 * Security:
 * - Does not print secrets, keys, or credentials.
 * - Reports only safe local listening port.
 *
 * @param portOverride - Optional port override.
 * @returns Running Node.js HTTP Server instance.
 */
export async function startServer(portOverride?: number): Promise<Server> {
  const config = loadAppConfig();
  const port = portOverride ?? config.port;

  const app = createApp();

  return new Promise<Server>((resolve) => {
    const server = app.listen(port, () => {
      console.log(`NyayaVault server listening on port ${port}`);
      resolve(server);
    });
  });
}

// Auto-start server when invoked directly via node
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'));

if (isMainModule) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
