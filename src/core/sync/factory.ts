// Witral - Sync Factory
// Factory to create sync plugin instances based on configuration

import { SyncInterface } from './interface.js';
import type { SyncStatus } from './types.js';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { getSyncMetadata, getAvailableSyncPlugins } from '../plugins/registry.js';

/**
 * Placeholder sync plugin used when SYNC_TYPE is not configured
 * Allows wizard to run and configure the plugin
 */
class PlaceholderSync implements SyncInterface {
  private syncState: SyncStatus = {
    state: 'disconnected',
    isConfigured: false,
    isConnected: false,
  };

  async initialize(): Promise<void> {
    // No-op
  }

  isConfigured(): boolean {
    return false;
  }

  isConnected(): boolean {
    return false;
  }

  async uploadFile(path: string, content: string): Promise<void> {
    // No-op - placeholder doesn't sync
  }

  async deleteFile(path: string): Promise<void> {
    // No-op - placeholder doesn't sync
  }

  getConnectionStatus(): SyncStatus {
    return this.syncState;
  }

  getSetupInstructions(): string {
    return 'Please configure SYNC_TYPE in .env file first.';
  }

  requiresConfiguration(): boolean {
    return true;
  }
}

function createPlaceholderSync(): SyncInterface {
  return new PlaceholderSync();
}

/**
 * Create a sync plugin instance based on configuration
 * If SYNC_TYPE is not set, returns a placeholder that allows wizard to run
 */
export async function createSync(): Promise<SyncInterface> {
  // Always check process.env first (in case .env was just updated)
  // Then fall back to config cache
  const syncType = process.env.SYNC_TYPE || getConfig().SYNC_TYPE || 'local';

  // 'local' means no cloud sync (always available, no-op)
  if (syncType.toLowerCase() === 'local' || syncType.trim() === '') {
    const { LocalSync } = await import('../../plugins/sync/local/index.js');
    return new LocalSync();
  }

  try {
    const pluginName = syncType.toLowerCase();
    const metadata = getSyncMetadata(pluginName);
    
    if (!metadata) {
      const available = getAvailableSyncPlugins().join(', ');
      throw new Error(
        `Unknown sync type: ${syncType}\n` +
        `Available plugins: ${available}\n` +
        'To add a new plugin, add it to src/plugins/registry.json'
      );
    }

    // Dynamic import based on registry
    // Registry paths are relative to plugins/ directory in src/
    // When running from dist/core/sync/, we need: ../../plugins/sync/googledrive/index.js
    // registry.json has: ../../plugins/sync/googledrive/index.js (relative to src/plugins/)
    // From dist/core/sync/: same path works (../../plugins/ = dist/plugins/)
    const modulePath = metadata.module;
    const pluginModule = await import(modulePath);
    
    // Try to find the main export
    // Priority: 1) explicit exportName, 2) {PluginName}Sync, 3) {PluginName}, 4) default, 5) first export
    const pluginNameKey = metadata.name.replace(/\s+/g, '');
    const firstKey = Object.keys(pluginModule)[0];
    const PluginClass = (metadata.exportName ? pluginModule[metadata.exportName] : undefined)
                      || pluginModule[`${pluginNameKey}Sync`] 
                      || pluginModule[pluginNameKey]
                      || pluginModule.default
                      || (firstKey ? pluginModule[firstKey] : undefined);
    
    if (!PluginClass) {
      throw new Error(
        `Plugin "${pluginName}" module does not export a valid sync class. ` +
        `Expected export: ${metadata.name.replace(/\s+/g, '')}Sync or default`
      );
    }
    
    return new PluginClass();
  } catch (error) {
    const isModuleNotFound = error instanceof Error && (
      (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' || 
      error.message.includes('Cannot find module')
    );
    
    if (isModuleNotFound) {
      const metadata = getSyncMetadata(syncType.toLowerCase());
      if (metadata && metadata.dependencies.length > 0) {
        logger.error(
          `Plugin "${syncType}" not installed. Install with:\n` +
          `  npm install ${metadata.dependencies.join(' ')}`
        );
      }
      throw new Error(
        `Sync plugin "${syncType}" not available. ` +
        'Please install the required optional dependencies.'
      );
    }
    throw error;
  }
}

