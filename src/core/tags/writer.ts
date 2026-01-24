// Witral - Tag Markdown Writer
// System for writing tagged messages to markdown files

import { TagManager, TagField, Tag, TagFileMode } from './index.js';
import { Message } from '../ingestor/interface.js';
import { StorageInterface } from '../storage/interface.js';
import { SyncInterface } from '../sync/interface.js';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';

interface TaggedMessage {
  content: string;
  sender: string;
  time: string;
  date: string;
  timestamp: number; // For sorting by date
}

export interface FeedbackCallback {
  (message: string): Promise<void> | void;
}

export class TagWriter {
  private tagManager: TagManager;
  private storage: StorageInterface;
  private sync: SyncInterface;
  private config = getConfig();
  private feedbackCallback?: FeedbackCallback;

  constructor(tagManager: TagManager, storage: StorageInterface, sync: SyncInterface, feedbackCallback?: FeedbackCallback) {
    this.tagManager = tagManager;
    this.storage = storage;
    this.sync = sync;
    this.feedbackCallback = feedbackCallback;
  }

  /**
   * Update the sync instance dynamically (e.g., when sync plugin changes)
   */
  updateSync(newSync: SyncInterface): void {
    this.sync = newSync;
  }

  /**
   * Helper function to log detailed message processing information
   */
  private logMessageProcessing(
    action: 'saved' | 'appended' | 'error',
    tag: Tag,
    message: TaggedMessage,
    detectedContent: string,
    dynamicTitle?: string,
    localPath?: string,
    cloudPath?: string,
    error?: any,
    dynamicTitleIgnored?: boolean
  ): void {
    const contentPreview = detectedContent.length > 100 
      ? detectedContent.substring(0, 100) + '...' 
      : detectedContent;
    
    const logData: any = {
      action,
      tag: tag.name,
      sender: message.sender,
      group: message.sender, // Could be enhanced with group info
      time: `${message.time} - ${message.date}`,
      contentPreview,
      dynamicTitle: dynamicTitle || undefined,
      fileMode: tag.fileMode || this.config.TAG_FILE_MODE || 'new-file',
    };

    if (dynamicTitleIgnored) {
      logData.dynamicTitleIgnored = true;
    }

    if (localPath) {
      logData.localPath = localPath;
    }

    if (cloudPath) {
      logData.cloudPath = cloudPath;
      logData.syncStatus = 'synced';
    } else if (this.sync.isConnected()) {
      logData.syncStatus = 'pending';
    } else {
      logData.syncStatus = 'local-only';
    }

    if (error) {
      logData.error = error instanceof Error ? error.message : String(error);
      logger.error(logData, `❌ Error processing message for tag "${tag.name}"`);
    } else {
      let logMessage = `✅ Message ${action} to tag "${tag.name}"`;
      if (dynamicTitle) {
        logMessage += ` (${dynamicTitle})`;
      }
      if (dynamicTitleIgnored) {
        logMessage += ` [title ignored - append mode]`;
      }
      logger.info(logData, logMessage);
    }
  }

  /**
   * Process a message and save it if it belongs to a tag
   */
  async processMessage(message: Message): Promise<boolean> {
    const detected = this.tagManager.detectTag(message.content);
    if (!detected) {
      return false;
    }

    const tag = this.tagManager.getTag(detected.tagName);
    if (!tag) {
      logger.warn({ tagName: detected.tagName }, 'Tag detected but not found in configuration');
      return false;
    }

    // Extract date and time from time string (format: "HH:MM:SS - DD/MM/YYYY")
    const parts = message.time.split(' - ');
    const timePart = parts[0] || '';
    const datePart = parts[1] || '';
    const timestamp = this.parseTimestamp(timePart, datePart);

    const taggedMessage: TaggedMessage = {
      content: detected.content,
      sender: message.sender,
      time: timePart,
      date: datePart,
      timestamp,
    };

    try {
      // Use tag's individual fileMode if defined, otherwise use global config
      const fileMode: TagFileMode = tag.fileMode || this.config.TAG_FILE_MODE || 'new-file';
      let dynamicTitle = detected.dynamicTitle;
      let dynamicTitleIgnored = false;
      
      // In append mode, dynamic titles are not supported - warn and ignore
      if (fileMode === 'append' && dynamicTitle) {
        dynamicTitleIgnored = true;
        logger.info({ 
          tag: tag.name, 
          ignoredTitle: dynamicTitle,
          content: detected.content.substring(0, 50) 
        }, `⚠️ Dynamic title "${dynamicTitle}" ignored - tag "${tag.name}" is in append mode`);
        dynamicTitle = undefined; // Ignore the dynamic title
      }
      
      let localPath: string | undefined;
      let cloudPath: string | undefined;
      
      // Track if sync was attempted (uploadFile is called inside save methods)
      let wasSynced = false;
      const syncWasConnectedBefore = this.sync.isConnected();
      
      if (fileMode === 'new-file') {
        localPath = await this.saveToNewFile(tag, taggedMessage, dynamicTitle);
      } else {
        // Append mode: always save to tags/tagname.md (no dynamic title, no subfolder)
        localPath = await this.appendToTagFile(tag, taggedMessage);
      }
      
      // Check if file was synced to cloud (for logging and feedback)
      // Note: uploadFile is called inside saveToNewFile/appendToTagFile
      // If sync is connected and no errors were thrown, assume it was synced
      if (syncWasConnectedBefore && this.sync.isConnected() && localPath) {
        try {
          const syncStatus = this.sync.getConnectionStatus();
          if (syncStatus.isConnected && syncStatus.authMethod === 'oauth') {
            // Construct Google Drive link (approximate, actual link would require file ID)
            cloudPath = `Google Drive > Vault > ${localPath}`;
            wasSynced = true;
          }
        } catch {
          // Ignore - cloud path is optional for logging
        }
      }
      
      // Log detailed processing information
      this.logMessageProcessing('saved', tag, taggedMessage, detected.content, dynamicTitle, localPath, cloudPath, undefined, dynamicTitleIgnored);
      
      // Send feedback if callback is configured
      if (this.feedbackCallback) {
        const feedbackMessage = this.generateFeedbackMessage(tag, fileMode, dynamicTitle, dynamicTitleIgnored, wasSynced);
        try {
          await this.feedbackCallback(feedbackMessage);
        } catch (error) {
          logger.debug({ error }, 'Could not send feedback message');
        }
      }
      
      return true;
    } catch (error) {
      this.logMessageProcessing('error', tag, taggedMessage, detected.content, detected.dynamicTitle, undefined, undefined, error);
      return false;
    }
  }

  /**
   * Generate feedback message for captured message
   */
  private generateFeedbackMessage(
    tag: Tag,
    fileMode: TagFileMode,
    dynamicTitle?: string,
    dynamicTitleIgnored?: boolean,
    wasSynced?: boolean
  ): string {
    const tagName = tag.name;
    let message = `✅ Message saved to *${tagName}*`;
    
    // Add dynamic title info for new-file mode
    if (fileMode === 'new-file' && dynamicTitle) {
      message += ` (${dynamicTitle}.md)`;
    }
    
    // Add cloud sync info if available
    if (wasSynced) {
      // Detect sync type from sync status
      const syncStatus = this.sync.getConnectionStatus();
      const syncType = syncStatus.authMethod === 'oauth' ? 'Google Drive' : 'cloud';
      message += ` and uploaded to ${syncType}`;
    }
    
    return message;
  }

  /**
   * Get file path for a tag, with optional dynamic title
   */
  private getTagFilePath(tagName: string, dynamicTitle?: string): string {
    // Use TagManager's method which handles dynamic titles correctly
    return this.tagManager.getTagMarkdownRelativePath(tagName, dynamicTitle);
  }

  /**
   * Generate filename with timestamp for new-file mode
   * Format: tags/[tagname]/DD-MM-YYYY - HH-MM.md
   */
  private generateTimestampFilename(tagName: string, message: TaggedMessage): string {
    const sanitizedTag = tagName.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Parse date (expected format: MM/DD/YYYY or DD/MM/YYYY)
    const dateParts = message.date.split('/');
    let day: string, month: string, year: string;
    
    // Try to detect format based on values
    if (dateParts.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]) {
      const first = parseInt(dateParts[0], 10);
      const second = parseInt(dateParts[1], 10);
      
      if (first > 12) {
        // DD/MM/YYYY format
        day = dateParts[0].padStart(2, '0');
        month = dateParts[1].padStart(2, '0');
        year = dateParts[2];
      } else if (second > 12) {
        // MM/DD/YYYY format
        month = dateParts[0].padStart(2, '0');
        day = dateParts[1].padStart(2, '0');
        year = dateParts[2];
      } else {
        // Ambiguous - assume MM/DD/YYYY (US format from Baileys)
        month = dateParts[0].padStart(2, '0');
        day = dateParts[1].padStart(2, '0');
        year = dateParts[2];
      }
    } else {
      // Fallback
      const now = new Date();
      day = String(now.getDate()).padStart(2, '0');
      month = String(now.getMonth() + 1).padStart(2, '0');
      year = String(now.getFullYear());
    }
    
    // Parse time - handle both 24h and 12h formats
    let hours: string, minutes: string;
    const timeClean = message.time.replace(/\s*(AM|PM)\s*/i, '');
    const timeParts = timeClean.split(':');
    
    if (timeParts.length >= 2 && timeParts[0] && timeParts[1]) {
      let h = parseInt(timeParts[0], 10);
      const m = parseInt(timeParts[1], 10);
      
      // Convert 12h to 24h if needed
      if (message.time.toLowerCase().includes('pm') && h < 12) {
        h += 12;
      } else if (message.time.toLowerCase().includes('am') && h === 12) {
        h = 0;
      }
      
      hours = String(h).padStart(2, '0');
      minutes = String(m).padStart(2, '0');
    } else {
      const now = new Date();
      hours = String(now.getHours()).padStart(2, '0');
      minutes = String(now.getMinutes()).padStart(2, '0');
    }
    
    // Format: tags/[tag]/DD-MM-YYYY - HH-MM.md
    return `tags/${sanitizedTag}/${day}-${month}-${year} - ${hours}-${minutes}.md`;
  }

  /**
   * Add message to a tag file (append mode)
   * SIMPLIFIED: Only appends content as a new line, no fields/headers
   * File is always saved as tags/tagname.md (no subfolder, no dynamic titles)
   * Returns the relative path of the file
   */
  private async appendToTagFile(
    tag: Tag,
    message: TaggedMessage
  ): Promise<string> {
    // In append mode: always save to tags/tagname.md (flat structure, no subfolders)
    const normalizedName = tag.name.toLowerCase();
    const relativePath = `tags/${normalizedName}.md`;

    // Read existing content or start empty
    let existingContent = '';
    const fileExists = await this.storage.exists(relativePath);
    if (fileExists) {
      const fileContent = await this.storage.readFile(relativePath);
      if (fileContent) {
        existingContent = fileContent.trimEnd();
      }
    }

    // Simply append the new content as a new line
    const newContent = message.content.trim();
    let finalContent: string;
    
    if (existingContent) {
      // Add new content on a new line
      finalContent = existingContent + '\n' + newContent + '\n';
    } else {
      // First entry
      finalContent = newContent + '\n';
    }
    
    // Write file using StorageInterface (always local first)
    try {
      await this.storage.saveFile(relativePath, finalContent);
      
      // Sync to cloud if configured
      if (this.sync.isConnected()) {
        try {
          logger.info({ relativePath }, '☁️ Uploading to Google Drive...');
          await this.sync.uploadFile(relativePath, finalContent);
          logger.info({ relativePath }, '✅ Google Drive upload complete');
        } catch (error: any) {
          // Don't throw - sync is optional, file is already saved locally
          logger.warn({ error: error.message, tag: tag.name, relativePath }, '⚠️ Cloud sync failed (file saved locally)');
        }
      }
    } catch (error) {
      logger.error({ error, tag: tag.name, relativePath }, 'Error writing markdown file');
      throw error;
    }
    
    return relativePath;
  }

  /**
   * Save message to a new file (new-file mode)
   * For Obsidian compatibility, only saves CONTENT
   * Returns the relative path of the file
   */
  private async saveToNewFile(
    tag: Tag,
    message: TaggedMessage,
    dynamicTitle?: string
  ): Promise<string> {
    let relativePath: string;
    
    if (dynamicTitle) {
      // Dynamic title: save in tag subdirectory (e.g., tags/idea/Christmas.md)
      relativePath = this.tagManager.getTagMarkdownRelativePath(tag.name, dynamicTitle);
    } else {
      // Generate filename with timestamp (e.g., tags/idea_20231229_143000.md)
      relativePath = this.generateTimestampFilename(tag.name, message);
    }

    // In new-file mode, only save CONTENT (for Obsidian compatibility)
    const content = message.content.trim() + '\n';
    
    // Write file using StorageInterface (always local first)
    try {
      await this.storage.saveFile(relativePath, content);
      
      // Sync to cloud if configured
      const syncConnected = this.sync.isConnected();
      logger.debug({ syncConnected, relativePath }, 'Checking sync status for upload');
      
      if (syncConnected) {
        try {
          logger.info({ relativePath }, '☁️ Uploading to Google Drive...');
          await this.sync.uploadFile(relativePath, content);
          logger.info({ relativePath }, '✅ Google Drive upload complete');
        } catch (error: any) {
          // Don't throw - sync is optional, file is already saved locally
          logger.warn({ error: error.message, tag: tag.name, relativePath }, '⚠️ Cloud sync failed (file saved locally)');
        }
      }
    } catch (error) {
      logger.error({ error, tag: tag.name, relativePath }, 'Error writing markdown file');
      throw error;
    }
    
    return relativePath;
  }

  /**
   * Generate markdown file header
   */
  private generateHeader(tag: Tag, dynamicTitle?: string): string {
    let header = `**TAG:** ${tag.name}\n\n`;
    
    if (dynamicTitle) {
      header += `**TITLE:** ${dynamicTitle}\n\n`;
    }
    
    if (tag.description) {
      header += `**Description:** ${tag.description}\n\n`;
    }
    
    header += '**MESSAGES** (sorted from most to least recent):\n\n';
    return header;
  }

  /**
   * Parse existing markdown file
   */
  private parseMarkdownFile(content: string): { header: string; messages: TaggedMessage[] } {
    const lines = content.split('\n');
    
    // Find where messages start (after "MESSAGES")
    // Supports both "MESSAGES" and "MENSAJES" for backwards compatibility
    let headerEndIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && (line.includes('MESSAGES') || line.includes('MENSAJES'))) {
        headerEndIndex = i;
        break;
      }
    }
    
    if (headerEndIndex === -1) {
      // Fallback format: search by separator ---
      const separatorIndex = lines.findIndex(line => line.trim() === '---');
      if (separatorIndex === -1) {
        return { header: content, messages: [] };
      }
      const header = lines.slice(0, separatorIndex + 1).join('\n') + '\n\n';
      const messagesContent = lines.slice(separatorIndex + 2).join('\n');
      const messages = this.parseMessagesFromContent(messagesContent);
      return { header, messages };
    }

    // Standard format: header until "MESSAGES"
    const headerLines = lines.slice(0, headerEndIndex + 1);
    const header = headerLines.join('\n') + '\n\n';
    const messagesContent = lines.slice(headerEndIndex + 1).join('\n');
    const messages = this.parseMessagesFromContent(messagesContent);

    return { header, messages };
  }

  /**
   * Parse messages from content (format with --- separators)
   */
  private parseMessagesFromContent(content: string): TaggedMessage[] {
    const messages: TaggedMessage[] = [];
    
    // Split by --- separators
    const messageBlocks = content.split(/\n---\n/).filter(block => block.trim());
    
    for (const block of messageBlocks) {
      const parsed = this.parseMessageBlock(block);
      if (parsed) {
        messages.push(parsed);
      }
    }
    
    return messages;
  }

  /**
   * Parse a message block from markdown
   */
  private parseMessageBlock(block: string): TaggedMessage | null {
    try {
      const lines = block.split('\n');
      if (lines.length === 0) return null;

      // Expected format:
      // ## Message #1
      // - **DATE:** DD/MM/YYYY
      // - **TIME:** HH:MM:SS
      // - **AUTHOR:** Name
      // 
      // **CONTENT:**
      // 
      // ```
      // message content
      // ```

      let datePart = '';
      let timePart = '';
      let author = 'Unknown';
      let content = '';

      let inContentBlock = false;
      const contentLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Search for fields in list format
        if (trimmed.startsWith('- **FECHA:**') || trimmed.startsWith('- **DATE:**')) {
          datePart = trimmed.replace(/- \*\*(FECHA|DATE):\*\*/, '').trim();
        } else if (trimmed.startsWith('- **HORA:**') || trimmed.startsWith('- **TIME:**')) {
          timePart = trimmed.replace(/- \*\*(HORA|TIME):\*\*/, '').trim();
        } else if (trimmed.startsWith('- **AUTOR:**') || trimmed.startsWith('- **AUTHOR:**')) {
          author = trimmed.replace(/- \*\*(AUTOR|AUTHOR):\*\*/, '').trim();
        } else if (trimmed === '```') {
          // Start or end of code block
          inContentBlock = !inContentBlock;
        } else if (inContentBlock) {
          // Inside code block - preserve original format
          contentLines.push(line);
        } else if (trimmed.startsWith('**CONTENIDO:**') || trimmed.startsWith('**CONTENT:**')) {
          // Wait for code block after
          continue;
        }
      }

      content = contentLines.join('\n').trim();

      if (!datePart || !timePart || !content) {
        return null;
      }

      const timestamp = this.parseTimestamp(timePart, datePart);

      return {
        content,
        sender: author,
        time: timePart,
        date: datePart,
        timestamp,
      };
    } catch (error) {
      logger.warn({ error, block }, 'Error parsing message block');
      return null;
    }
  }

  /**
   * Generate complete markdown content
   */
  private generateMarkdownContent(
    header: string,
    tag: Tag,
    messages: TaggedMessage[]
  ): string {
    let content = header;

    if (messages.length === 0) {
      content += '---\n\n';
      content += '_No messages in this tag yet._\n';
      return content;
    }

    messages.forEach((message, index) => {
      const messageNumber = messages.length - index; // Most recent = highest number
      content += '---\n\n';
      content += this.formatMessage(message, tag.enabledFields, messageNumber);
      content += '\n\n';
    });

    return content.trim() + '\n';
  }

  /**
   * Format a message according to enabled fields
   */
  private formatMessage(message: TaggedMessage, enabledFields: TagField[], messageNumber: number): string {
    const parts: string[] = [];

    // Message title with number
    parts.push(`## Message #${messageNumber}`);

    // Add fields according to enabled ones in a list
    const fieldParts: string[] = [];
    
    if (enabledFields.includes('FECHA')) {
      fieldParts.push(`- **DATE:** ${message.date}`);
    }

    if (enabledFields.includes('HORA')) {
      fieldParts.push(`- **TIME:** ${message.time}`);
    }

    if (enabledFields.includes('AUTOR')) {
      fieldParts.push(`- **AUTHOR:** ${message.sender}`);
    }

    if (fieldParts.length > 0) {
      parts.push(fieldParts.join('\n'));
    }

    // CONTENT is always present - formatted as code block for better readability
    if (enabledFields.includes('CONTENIDO')) {
      parts.push(`\n**CONTENT:**\n\n\`\`\`\n${message.content}\n\`\`\``);
    }

    return parts.join('\n');
  }

  /**
   * Parse timestamp from date and time
   */
  private parseTimestamp(time: string, date: string): number {
    try {
      // Expected format: "DD/MM/YYYY" and "HH:MM:SS"
      const dateParts = date.split('/').map(Number);
      const timeParts = time.split(':').map(Number);
      
      const day = dateParts[0];
      const month = dateParts[1];
      const year = dateParts[2];
      const hour = timeParts[0] || 0;
      const minute = timeParts[1] || 0;
      const second = timeParts[2] || 0;
      
      if (!day || !month || !year) {
        throw new Error('Incomplete date');
      }
      
      const dateObj = new Date(year, month - 1, day, hour, minute, second);
      return dateObj.getTime();
    } catch (error) {
      logger.warn({ error, time, date }, 'Error parsing timestamp');
      return Date.now(); // Fallback to current timestamp
    }
  }
}

