// Witral - Google Drive Sync Plugin
// Cloud sync plugin for Google Drive using OAuth Desktop App

import { SyncInterface } from '../../../core/sync/interface.js';
import type { SyncStatus } from '../../../core/sync/types.js';
import { logger } from '../../../utils/logger.js';
import { google } from 'googleapis';
import { getAuthenticatedClient, hasOAuthTokens, isOAuthConfigured } from './oauth.js';

export class GoogleDriveSync implements SyncInterface {
  private drive: any = null;
  private vaultFolderId: string | null = null;
  private driveEnabled: boolean = false;
  private userEmail: string = '';
  private syncStatus: SyncStatus = {
    state: 'disconnected',
    isConfigured: false,
    isConnected: false,
    authMethod: 'none',
  };

  async initialize(): Promise<void> {
    await this.initializeGoogleDrive();
  }

  /**
   * Initialize Google Drive with OAuth Desktop App
   */
  private async initializeGoogleDrive(): Promise<void> {
    // Check if OAuth is configured
    if (await isOAuthConfigured() && await hasOAuthTokens()) {
      try {
        logger.debug({}, '🔐 Initializing Google Drive sync with OAuth');
        const auth = await getAuthenticatedClient();
        // auth is already compatible with googleapis (created via google.auth.OAuth2)
        this.drive = google.drive({ version: 'v3', auth });
        
        // Get user info
        try {
          const oauth2 = google.oauth2({ version: 'v2', auth });
          const userInfo = await oauth2.userinfo.get();
          this.userEmail = userInfo.data.email || 'user';
          logger.debug({ email: this.userEmail }, '✅ Authenticated with OAuth');
        } catch {
          this.userEmail = 'authenticated user';
        }
        
        // Find or create Vault folder
        this.vaultFolderId = await this.findOrCreateVaultFolder();
        
        if (this.vaultFolderId) {
          this.driveEnabled = true;
          this.syncStatus = {
            state: 'connected',
            isConfigured: true,
            isConnected: true,
            authMethod: 'oauth',
            userEmail: this.userEmail,
          };
          logger.debug({ folderId: this.vaultFolderId }, '✅ Google Drive sync enabled (OAuth)');
        } else {
          this.syncStatus = {
            state: 'error',
            isConfigured: true,
            isConnected: false,
            authMethod: 'oauth',
            error: 'Could not find or create Vault folder',
          };
        }
        return;
      } catch (error: any) {
        logger.warn({ error: error.message }, 'Error initializing Google Drive sync');
        this.syncStatus = {
          state: 'error',
          isConfigured: true,
          isConnected: false,
          authMethod: 'oauth',
          error: error.message,
        };
      }
    }

    // Not configured
    this.syncStatus = {
      state: 'disconnected',
      isConfigured: false,
      isConnected: false,
      authMethod: 'none',
    };
    logger.debug('ℹ️ Google Drive sync not configured, using local storage only');
  }

  /**
   * Find or create Vault folder (for OAuth - user has quota)
   * Creates folder in root of user's Google Drive
   */
  private async findOrCreateVaultFolder(): Promise<string | null> {
    try {
      // Find existing folder
      const response = await this.drive.files.list({
        q: "name='Vault' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents",
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (response.data.files && response.data.files.length > 0) {
        logger.debug({ folderId: response.data.files[0].id }, '📁 Vault folder found');
        return response.data.files[0].id!;
      }

      // Create folder if it doesn't exist
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: 'Vault',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id, name',
      });

      logger.debug({ folderId: createResponse.data.id }, '📁 Vault folder created');
      return createResponse.data.id!;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error finding/creating Vault folder');
      return null;
    }
  }

  /**
   * Parse relative path to folder structure
   */
  private parsePath(relativePath: string): { folders: string[]; filename: string } {
    const parts = relativePath.split('/');
    const filename = parts.pop() || '';
    return { folders: parts, filename };
  }

  /**
   * Find or create folder structure in Drive
   */
  private async findOrCreateFolderPath(folders: string[], parentId: string): Promise<string | null> {
    let currentParentId = parentId;

    for (const folderName of folders) {
      if (!folderName) continue;

      try {
        const response = await this.drive.files.list({
          q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed=false`,
          fields: 'files(id, name)',
          spaces: 'drive',
        });

        if (response.data.files && response.data.files.length > 0) {
          currentParentId = response.data.files[0].id!;
        } else {
          const createResponse = await this.drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [currentParentId],
            },
            fields: 'id, name',
          });
          currentParentId = createResponse.data.id!;
        }
      } catch (error: any) {
        logger.error({ error: error.message, folderName }, '❌ Error creating subfolder');
        return null;
      }
    }

    return currentParentId;
  }

  /**
   * Find file by name and parent folder
   */
  private async findFile(filename: string, parentId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.list({
        q: `name='${filename}' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id!;
      }

      return null;
    } catch {
      return null;
    }
  }

  isConfigured(): boolean {
    return this.syncStatus.isConfigured;
  }

  isConnected(): boolean {
    const connected = this.syncStatus.isConnected && this.driveEnabled && !!this.drive && !!this.vaultFolderId;
    return connected;
  }

  async uploadFile(path: string, content: string): Promise<void> {
    if (!this.driveEnabled || !this.drive || !this.vaultFolderId) {
      logger.debug({ 
        driveEnabled: this.driveEnabled, 
        hasDrive: !!this.drive, 
        hasVaultFolderId: !!this.vaultFolderId,
        path 
      }, 'Skipping upload - Drive not ready');
      return;
    }

    try {
      const { folders, filename } = this.parsePath(path);
      
      // Path is already relative to vault/ (e.g., "tags/javi/titulo.md")
      // So we create the structure directly inside Vault folder
      const parentId = await this.findOrCreateFolderPath(folders, this.vaultFolderId);
      if (!parentId) {
        throw new Error('Could not create folder structure');
      }
      
      const existingFileId = await this.findFile(filename, parentId);
      
      if (existingFileId) {
        await this.drive.files.update({
          fileId: existingFileId,
          media: {
            mimeType: 'text/markdown',
            body: content,
          },
        });
        const fileLink = `https://drive.google.com/file/d/${existingFileId}/view`;
        logger.info({ 
          path, 
          fileId: existingFileId,
          fileLink,
          folderId: this.vaultFolderId 
        }, '☁️ File updated in Google Drive');
      } else {
        const createResponse = await this.drive.files.create({
          requestBody: {
            name: filename,
            mimeType: 'text/markdown',
            parents: [parentId],
          },
          media: {
            mimeType: 'text/markdown',
            body: content,
          },
          fields: 'id, name, webViewLink',
        });
        const fileId = createResponse.data.id;
        const fileLink = createResponse.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
        logger.info({ 
          path, 
          fileId,
          fileLink,
          folderId: this.vaultFolderId 
        }, '☁️ File uploaded to Google Drive');
      }
    } catch (error: any) {
      logger.warn({ 
        error: error.message, 
        path,
      }, 'Error syncing to Drive (file saved locally)');
      
      // Disable Drive if there are quota/permission errors
      if (error.code === 403) {
        this.driveEnabled = false;
        this.syncStatus.state = 'error';
        this.syncStatus.error = 'Permission/quota error. Check Google Drive permissions.';
        logger.error('❌ Google Drive sync disabled due to error. Check permissions.');
      }
      // Don't throw - local storage already saved the file
    }
  }

  async deleteFile(path: string): Promise<void> {
    // Do not delete files from Google Drive - only create and update
    // This prevents accidental deletion of user data
    // Files are preserved in Google Drive even if removed locally
    return;
  }

  getConnectionStatus(): SyncStatus {
    return {
      ...this.syncStatus,
      vaultFolderId: this.vaultFolderId || undefined,
    };
  }
  
  /**
   * Get Vault folder information (ID and link)
   */
  getVaultFolderInfo(): { folderId: string | null; folderLink: string | null } {
    if (!this.vaultFolderId) {
      return { folderId: null, folderLink: null };
    }
    
    return {
      folderId: this.vaultFolderId,
      folderLink: `https://drive.google.com/drive/folders/${this.vaultFolderId}`,
    };
  }

  getSetupInstructions(): string {
    return `Google Drive Sync Setup:
1. Go to Google Cloud Console (https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google Drive API
4. Create OAuth 2.0 credentials as "Desktop App"
5. Download the credentials JSON file
6. Save it to: ./data/googledrive/oauth-credentials.json
7. Run the setup wizard to complete OAuth authorization`;
  }

  requiresConfiguration(): boolean {
    return !this.isConfigured();
  }

  /**
   * Reinitialize Drive connection (after authorizing OAuth)
   */
  async reinitializeDrive(): Promise<void> {
    this.drive = null;
    this.vaultFolderId = null;
    this.driveEnabled = false;
    this.userEmail = '';
    this.syncStatus = {
      state: 'disconnected',
      isConfigured: false,
      isConnected: false,
      authMethod: 'none',
    };
    
    await this.initializeGoogleDrive();
  }
}

