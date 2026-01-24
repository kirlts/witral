// Witral - Plugin Installer CLI
// Command-line tool to install plugin dependencies

import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { getIngestorMetadata, getSyncMetadata, getAvailableIngestors, getAvailableSyncPlugins } from '../core/plugins/registry.js';

/**
 * Install dependencies for a plugin
 */
export async function installPlugin(pluginType: 'ingestor' | 'sync', pluginName: string): Promise<void> {
  const metadata = pluginType === 'ingestor' 
    ? getIngestorMetadata(pluginName)
    : getSyncMetadata(pluginName);

  if (!metadata) {
    const available = pluginType === 'ingestor' 
      ? getAvailableIngestors()
      : getAvailableSyncPlugins();
    throw new Error(
      `Unknown ${pluginType} plugin: ${pluginName}\n` +
      `Available plugins: ${available.join(', ')}`
    );
  }

  if (metadata.dependencies.length === 0) {
    logger.debug(`Plugin "${pluginName}" has no dependencies to install.`);
    return;
  }

  console.log(`\n📦 Installing dependencies for ${pluginType} plugin "${pluginName}"...`);
  console.log(`   Packages: ${metadata.dependencies.join(', ')}`);
  logger.debug({ dependencies: metadata.dependencies }, 'Dependencies to install');

  try {
    const command = `npm install ${metadata.dependencies.join(' ')}`;
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ Successfully installed dependencies for "${pluginName}"`);
    logger.debug(`Successfully installed dependencies for "${pluginName}"`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, `Failed to install dependencies for "${pluginName}"`);
    throw new Error(`Failed to install dependencies: ${errorMessage}`);
  }
}

/**
 * List available plugins
 */
export function listPlugins(pluginType?: 'ingestor' | 'sync'): void {
  // Note: This function uses console.log for CLI output (not logger)
  // as it's meant to be displayed directly to the user in the terminal
  if (!pluginType || pluginType === 'ingestor') {
    console.log('\n📱 Available Ingestor Plugins:');
    const ingestors = getAvailableIngestors();
    ingestors.forEach(name => {
      const metadata = getIngestorMetadata(name);
      if (metadata) {
        console.log(`   • ${name}: ${metadata.description}`);
        if (metadata.dependencies.length > 0) {
          console.log(`     Dependencies: ${metadata.dependencies.join(', ')}`);
        }
      }
    });
  }

  if (!pluginType || pluginType === 'sync') {
    console.log('\n☁️  Available Sync Plugins:');
    const syncPlugins = getAvailableSyncPlugins();
    syncPlugins.forEach(name => {
      const metadata = getSyncMetadata(name);
      if (metadata) {
        console.log(`   • ${name}: ${metadata.description}`);
        if (metadata.dependencies.length > 0) {
          console.log(`     Dependencies: ${metadata.dependencies.join(', ')}`);
        }
      }
    });
  }
}

