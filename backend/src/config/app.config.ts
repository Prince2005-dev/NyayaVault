import { initializeEnvironment } from './encryption.config.js';

export interface AppConfig {
  port: number;
}

/**
 * Loads application server configuration from environment variables.
 * Defaults PORT to 4000 for local development.
 *
 * Security:
 * - Does not print, log, or expose secret environment variables.
 */
export function loadAppConfig(): AppConfig {
  initializeEnvironment();

  const rawPort = process.env.PORT?.trim();
  let port = 4000;

  if (rawPort) {
    const parsed = parseInt(rawPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed;
    }
  }

  return { port };
}
