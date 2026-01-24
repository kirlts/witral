// Witral - Sync Interface
// Abstract interface for cloud sync plugin implementations
// Sync plugins handle uploading files to cloud storage services

import type { SyncStatus } from './types.js';

/**
 * Interface for cloud sync plugins
 * Sync plugins handle uploading files to cloud storage services
 * Local storage is always handled separately by StorageInterface
 */
export interface SyncInterface {
  /**
   * Initialize the sync plugin
   */
  initialize(): Promise<void>;

  /**
   * Check if the sync plugin is configured
   * @returns true if all required configuration is present
   */
  isConfigured(): boolean;

  /**
   * Check if the sync plugin is connected to the cloud service
   * @returns true if connected and ready to sync
   */
  isConnected(): boolean;

  /**
   * Upload a file to the cloud service
   * @param path Relative path of the file (e.g., "tags/test.md")
   * @param content File content
   */
  uploadFile(path: string, content: string): Promise<void>;

  /**
   * Delete a file from the cloud service
   * @param path Relative path of the file
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Get current connection status
   * @returns SyncStatus object with connection details
   */
  getConnectionStatus(): SyncStatus;

  /**
   * Get setup instructions for this sync plugin
   * @returns Human-readable instructions for configuring the plugin
   */
  getSetupInstructions(): string;

  /**
   * Check if this sync plugin requires manual configuration
   * @returns true if user needs to configure credentials/settings
   */
  requiresConfiguration(): boolean;
}

/**
 * Interface for sync plugins
 * Plugins must implement SyncInterface
 */
export interface SyncPlugin {
  createSync(): SyncInterface;
}

