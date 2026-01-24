// Witral - Ingestor Factory
// Factory to create ingestor instances based on configuration

import { IngestorInterface, Message, Group, ConnectionState } from './interface.js';
import { GroupManager } from '../groups/index.js';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { getIngestorMetadata, getAvailableIngestors } from '../plugins/registry.js';

/**
 * Placeholder ingestor used when INGESTOR_TYPE is not configured
 * Allows wizard to run and configure the plugin
 */
class PlaceholderIngestor implements IngestorInterface {
  private groupManager?: GroupManager;
  private connectionState: ConnectionState = 'disconnected';
  private connectedCallbacks: (() => void)[] = [];
  private messageCallbacks: ((message: Message) => void)[] = [];

  constructor(groupManager?: GroupManager) {
    this.groupManager = groupManager;
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async start(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    // No-op
  }

  async generateQR(): Promise<void> {
    throw new Error('No ingestor plugin configured. Please configure INGESTOR_TYPE in .env file.');
  }

  isConnected(): boolean {
    return false;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  onConnected(callback: () => void): void {
    this.connectedCallbacks.push(callback);
  }

  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.push(callback);
  }

  async listGroups(): Promise<Group[]> {
    return [];
  }

  requiresQR(): boolean {
    return false;
  }

  getConnectionInstructions(): string {
    return 'Please configure INGESTOR_TYPE in .env file first.';
  }
}

function createPlaceholderIngestor(groupManager?: GroupManager): IngestorInterface {
  return new PlaceholderIngestor(groupManager);
}

/**
 * Create an ingestor instance based on configuration
 * If INGESTOR_TYPE is not set, returns a placeholder that allows wizard to run
 */
export async function createIngestor(groupManager?: GroupManager): Promise<IngestorInterface> {
  // Always check process.env first (in case .env was just updated)
  // Then fall back to config cache
  const ingestorType = process.env.INGESTOR_TYPE || getConfig().INGESTOR_TYPE;

  if (!ingestorType || ingestorType.trim() === '') {
    // Return a placeholder ingestor that allows wizard to run
    // The wizard will configure INGESTOR_TYPE and user can restart
    return createPlaceholderIngestor(groupManager);
  }

  try {
    const pluginName = ingestorType.toLowerCase();
    const metadata = getIngestorMetadata(pluginName);
    
    if (!metadata) {
      const available = getAvailableIngestors().join(', ');
      throw new Error(
        `Unknown ingestor type: ${ingestorType}\n` +
        `Available plugins: ${available}\n` +
        'To add a new plugin, add it to src/plugins/registry.json'
      );
    }

    // Dynamic import based on registry
    // Registry paths are relative to plugins/ directory in src/
    // When running from dist/core/ingestor/, we need: ../../plugins/baileys/index.js
    // registry.json has: ../../plugins/baileys/index.js (relative to src/plugins/)
    // From dist/core/ingestor/: same path works (../../plugins/ = dist/plugins/)
    const modulePath = metadata.module;
    const pluginModule = await import(modulePath);
    
    // Try to find the main export
    // Priority: 1) explicit exportName, 2) {PluginName}Ingestor, 3) {PluginName}, 4) default, 5) first export
    const pluginNameKey = metadata.name.replace(/\s+/g, '');
    const firstKey = Object.keys(pluginModule)[0];
    const PluginClass = (metadata.exportName ? pluginModule[metadata.exportName] : undefined)
                      || pluginModule[`${pluginNameKey}Ingestor`] 
                      || pluginModule[pluginNameKey]
                      || pluginModule.default
                      || (firstKey ? pluginModule[firstKey] : undefined);
    
    if (!PluginClass) {
      throw new Error(
        `Plugin "${pluginName}" module does not export a valid ingestor class. ` +
        `Expected export: ${metadata.name.replace(/\s+/g, '')}Ingestor or default`
      );
    }
    
    return new PluginClass(groupManager);
  } catch (error) {
    const isModuleNotFound = error instanceof Error && (
      (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' || 
      error.message.includes('Cannot find module')
    );
    
    if (isModuleNotFound) {
      const metadata = getIngestorMetadata(ingestorType.toLowerCase());
      if (metadata && metadata.dependencies.length > 0) {
        logger.error(
          `Plugin "${ingestorType}" not installed. Install with:\n` +
          `  npm install ${metadata.dependencies.join(' ')}`
        );
      }
      throw new Error(
        `Ingestor plugin "${ingestorType}" not available. ` +
        'Please install the required optional dependencies.'
      );
    }
    throw error;
  }
}

