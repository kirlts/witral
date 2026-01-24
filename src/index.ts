// Witral - Universal Ingestion Framework
// Application entry point

import { createIngestor } from './core/ingestor/factory.js';
import { createStorage } from './core/storage/factory.js';
import { createSync } from './core/sync/factory.js';
import { startWebServer, stopWebServer } from './web/index.js';
import { WitralCLI } from './cli/index.js';
import { logger } from './utils/logger.js';
import { GroupManager } from './core/groups/index.js';
import { TagManager } from './core/tags/index.js';
import { getConfig } from './config/index.js';
import { checkPortInUse } from './utils/port-check.js';

// Initialize managers
const groupManager = new GroupManager();
await groupManager.load();

const tagManager = new TagManager();
await tagManager.load();

// Create storage using factory (always local filesystem)
const storage = await createStorage();
await storage.initialize();

// Create sync plugin (cloud synchronization)
const sync = await createSync();
await sync.initialize();

// Create ingestor using factory (loads plugin based on configuration)
const ingestor = await createIngestor(groupManager);

// Configure tagManager in ingestor if it supports commands (e.g., Baileys plugin)
// Don't log info here - will be logged after wizard completes to avoid noise
if ('setTagManager' in ingestor && typeof (ingestor as any).setTagManager === 'function') {
  logger.debug('Configuring TagManager in ingestor for command support');
  (ingestor as any).setTagManager(tagManager);
} else {
  logger.debug('Ingestor does not support setTagManager (commands not available)');
}

// Handle termination signals
process.on('SIGTERM', async () => {
  logger.debug('🛑 Received SIGTERM, shutting down...');
  await stopWebServer();
  await ingestor.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  // CLI will handle SIGINT, but handle it here as fallback
  logger.debug('🛑 Received SIGINT, shutting down...');
  await stopWebServer();
  await ingestor.stop();
  process.exit(0);
});

// Initialize ingestor, CLI and Web Server
ingestor.initialize().then(async () => {
  // Check if we're in CLI-only mode (when accessing CLI via docker exec while service is running)
  // Detect by checking if the web server port is already in use
  const config = getConfig();
  const isCLIOnlyMode = config.WEB_ENABLED ? await checkPortInUse(config.WEB_PORT) : false;
  
  if (isCLIOnlyMode) {
    logger.info('🔧 CLI-only mode detected (service already running) - skipping auto-connect and web server');
  } else {
    // Try to connect automatically FIRST (before CLI starts showing menu)
    // This ensures the menu shows correct connection state from the start
    // Don't await - let it connect in background while we continue initialization
    logger.info('🚀 Starting automatic reconnection to messaging service...');
    ingestor.start().catch((error) => {
      // Log error but don't fail - user can generate QR manually
      logger.info({ error: error instanceof Error ? error.message : String(error) }, '⚠️  Auto-connect failed - use CLI menu option 1 to generate QR');
    });
  }

  // Start interactive CLI (wizard will run if needed)
  const cli = new WitralCLI(ingestor, groupManager, tagManager, storage, sync);
  const wizardResult = await cli.start();

  // If we're in setup mode and wizard completed, exit gracefully to allow background service start
  if (process.env.WITRAL_SETUP_MODE === 'true' && wizardResult) {
    logger.info('Setup mode: wizard completed, exiting to allow background service start');
    logger.debug({ WITRAL_SETUP_MODE: process.env.WITRAL_SETUP_MODE, hasWizardResult: !!wizardResult }, 'Exiting in setup mode');
    // Stop services gracefully
    await ingestor.stop();
    await stopWebServer();
    // Exit successfully - start.sh will detect wizard completion and start background service
    process.exit(0);
  } else {
    logger.debug({ WITRAL_SETUP_MODE: process.env.WITRAL_SETUP_MODE, hasWizardResult: !!wizardResult }, 'Not exiting - continuing normal startup');
  }

  // Reload config after wizard (it may have changed WEB_ENABLED)
  // Note: getConfig() caches, so we need to check if wizard changed it
  // Reuse config variable from above
  const shouldStartWeb = wizardResult?.webEnabled !== undefined 
    ? wizardResult.webEnabled 
    : config.WEB_ENABLED;

  // Start web server only if enabled and not in CLI-only mode
  if (shouldStartWeb && !isCLIOnlyMode) {
    await startWebServer({
      ingestor,
      groupManager,
      tagManager,
      storage,
      sync,
    });
  } else if (isCLIOnlyMode) {
    logger.debug('CLI-only mode: web server skipped (service already running)');
  } else {
    logger.debug('Web dashboard disabled');
  }
}).catch((error) => {
  logger.error({ error }, 'Error during initialization');
  process.exit(1);
});
