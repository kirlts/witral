// Witral - Storage Factory
// Factory to create storage instances
// Storage is always local - cloud sync is handled separately by SyncInterface

import { StorageInterface } from './interface.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a storage instance
 * Storage is always local filesystem - cloud sync is handled by sync plugins
 */
export async function createStorage(): Promise<StorageInterface> {
  try {
    const { LocalStorage } = await import('../../plugins/storage/local/index.js');
    return new LocalStorage();
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
      logger.error('Local storage plugin not available.');
      throw new Error('Storage plugin not available. Please install required dependencies.');
    }
    throw error;
  }
}

