// Witral - Sync Types
// Shared types for sync plugins

export type SyncState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SyncStatus {
  state: SyncState;
  isConfigured: boolean;
  isConnected: boolean;
  authMethod?: 'oauth' | 'service-account' | 'none';
  userEmail?: string;
  error?: string;
  vaultFolderId?: string; // For Google Drive: ID of the Vault folder
}

