// Witral - Local Sync Plugin
// No-op sync plugin for local-only storage (no cloud sync)

import { SyncInterface } from '../../../core/sync/interface.js';
import type { SyncStatus } from '../../../core/sync/types.js';

/**
 * Local sync plugin - no cloud synchronization
 * Always available, always "connected" (but does nothing)
 */
export class LocalSync implements SyncInterface {
  private syncStatus: SyncStatus = {
    state: 'connected',
    isConfigured: true,
    isConnected: true,
    authMethod: 'none',
  };

  async initialize(): Promise<void> {
    // No-op - local sync doesn't need initialization
  }

  isConfigured(): boolean {
    return true;
  }

  isConnected(): boolean {
    return true;
  }

  async uploadFile(path: string, content: string): Promise<void> {
    // No-op - local sync doesn't upload anywhere
  }

  async deleteFile(path: string): Promise<void> {
    // No-op - local sync doesn't delete from cloud
  }

  getConnectionStatus(): SyncStatus {
    return this.syncStatus;
  }

  getSetupInstructions(): string {
    return 'Local sync is always enabled. No configuration needed.';
  }

  requiresConfiguration(): boolean {
    return false;
  }
}

