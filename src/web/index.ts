// Witral - Web Dashboard
// Lightweight dashboard for configuration and monitoring

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { IngestorInterface } from '../core/ingestor/interface.js';
import { GroupManager } from '../core/groups/index.js';
import { TagManager } from '../core/tags/index.js';
import { StorageInterface } from '../core/storage/interface.js';
import { SyncInterface } from '../core/sync/interface.js';
import { setupRoutes } from './routes.js';
import { setupSSE } from './sse.js';
import { enableLoggerSSE } from '../utils/logger-sse.js';

export interface WebServerContext {
  ingestor: IngestorInterface;
  groupManager: GroupManager;
  tagManager: TagManager;
  storage: StorageInterface;
  sync: SyncInterface;
}

let serverInstance: ReturnType<typeof serve> | null = null;
let webServerContext: WebServerContext | null = null;

/**
 * Start web server
 */
export async function startWebServer(context: WebServerContext): Promise<void> {
  const config = getConfig();
  
  if (!config.WEB_ENABLED) {
    logger.debug('Web dashboard disabled');
    return;
  }

  // Store context for dynamic updates
  webServerContext = context;

  const app = new Hono();

  // Enable logger SSE integration
  enableLoggerSSE();

  // Setup routes
  setupRoutes(app, context);
  
  // Setup SSE for real-time logs
  setupSSE(app, context);

  // Start server
  const port = config.WEB_PORT;
  const host = config.WEB_HOST;

  // Check if port is already in use before starting server
  const { checkPortInUse } = await import('../utils/port-check.js');
  const portInUse = await checkPortInUse(port);
  
  if (portInUse) {
    logger.debug({ port, host }, '⚠️  Port already in use - running in CLI-only mode (web server skipped)');
    return;
  }

  serverInstance = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  }, (info) => {
    logger.debug({ port, host }, `🌐 Web dashboard available at http://${host}:${port}/web`);
  });
  
  // Handle server errors (e.g., if port becomes unavailable after check)
  serverInstance.on?.('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      logger.debug({ port, host }, '⚠️  Port conflict detected - web server not started');
      serverInstance = null;
    } else {
      logger.error({ error }, '❌ Web server error');
    }
  });
}

/**
 * Stop web server
 */
export async function stopWebServer(): Promise<void> {
  if (serverInstance) {
    await new Promise<void>((resolve) => {
      serverInstance?.close(() => {
        logger.debug('✅ Web dashboard stopped');
        resolve();
      });
    });
    serverInstance = null;
  }
  webServerContext = null;
}

/**
 * Update sync plugin in web server context (for dynamic reloading)
 */
export async function updateWebServerSync(sync: SyncInterface): Promise<void> {
  if (webServerContext) {
    webServerContext.sync = sync;
  }
}

/**
 * Get current web server context
 */
export function getWebServerContext(): WebServerContext | null {
  return webServerContext;
}

/**
 * Update CLI writers sync instance (for dynamic reloading)
 * This function is called when sync plugin changes from dashboard
 */
export async function updateCLIWritersSync(sync: SyncInterface): Promise<void> {
  // Try to get CLI instance from global scope or module
  // The CLI instance stores tagWriter and groupWriter
  try {
    // Import CLI module to access the instance
    // Note: This is a workaround - ideally CLI would expose a method to update writers
    const cliModule = await import('../cli/index.js');
    
    // Check if there's a way to access the CLI instance
    // For now, we'll use a global registry pattern
    if (typeof (global as any).witralCLIInstance !== 'undefined') {
      const cli = (global as any).witralCLIInstance;
      if (cli && typeof cli.updateWritersSync === 'function') {
        await cli.updateWritersSync(sync);
        logger.debug({}, '✅ CLI writers updated with new sync instance');
        return;
      }
    }
    
    // If no global instance, log warning but don't fail
    logger.debug({}, '⚠️ CLI instance not available, writers will use new sync on next message');
  } catch (error: any) {
    logger.debug({ error: error.message }, '⚠️ Could not update CLI writers (non-critical)');
  }
}

