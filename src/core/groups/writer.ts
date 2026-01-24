// Witral - Group Message Writer
// System for writing all messages from monitored groups to markdown files

import { Message } from '../ingestor/interface.js';
import { StorageInterface } from '../storage/interface.js';
import { SyncInterface } from '../sync/interface.js';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { sanitizeGroupName, sanitizeMessageContent } from '../../utils/sanitize.js';

interface GroupMessage {
  content: string;
  sender: string;
  time: string;
  date: string;
  timestamp: number;
}

export class GroupWriter {
  private storage: StorageInterface;
  private sync: SyncInterface;
  private config = getConfig();

  constructor(storage: StorageInterface, sync: SyncInterface) {
    this.storage = storage;
    this.sync = sync;
  }

  /**
   * Update the sync instance dynamically (e.g., when sync plugin changes)
   */
  updateSync(newSync: SyncInterface): void {
    this.sync = newSync;
  }

  /**
   * Write a message to the group's markdown file
   * @param groupName - Name of the group
   * @param message - Message to write
   */
  async writeMessage(groupName: string, message: Message): Promise<void> {
    // Sanitize group name for file path
    const sanitizedName = sanitizeGroupName(groupName);
    if (!sanitizedName) {
      logger.warn({ groupName }, 'Invalid group name, skipping message');
      return;
    }

    // Extract date and time from time string (format: "HH:MM:SS - DD/MM/YYYY")
    const parts = message.time.split(' - ');
    const timePart = parts[0] || '';
    const datePart = parts[1] || '';
    const timestamp = this.parseTimestamp(timePart, datePart);

    // Sanitize message content
    const sanitizedContent = sanitizeMessageContent(message.content);

    const groupMessage: GroupMessage = {
      content: sanitizedContent,
      sender: message.sender,
      time: timePart,
      date: datePart,
      timestamp,
    };

    try {
      await this.appendToGroupFile(sanitizedName, groupMessage);
      logger.debug({ 
        group: sanitizedName, 
        sender: message.sender,
        contentPreview: sanitizedContent.substring(0, 50) + (sanitizedContent.length > 50 ? '...' : '')
      }, `✅ Message saved to group file "${sanitizedName}.md"`);
    } catch (error) {
      logger.error({ error, group: sanitizedName }, 'Error saving message to group file');
    }
  }

  /**
   * Append message to group markdown file
   */
  private async appendToGroupFile(
    groupName: string,
    message: GroupMessage
  ): Promise<void> {
    // Get relative path (e.g.: "groups/group-name.md")
    const relativePath = this.getGroupMarkdownRelativePath(groupName);

    // Read existing file or create new
    let existingMessages: GroupMessage[] = [];
    let header = '';

    const fileExists = await this.storage.exists(relativePath);
    if (fileExists) {
      const fileContent = await this.storage.readFile(relativePath);
      if (fileContent) {
        const parsed = this.parseMarkdownFile(fileContent);
        header = parsed.header;
        existingMessages = parsed.messages;
      }
    } else {
      // Create new header
      header = this.generateHeader(groupName);
    }

    // Add new message (don't duplicate if already exists)
    const messageExists = existingMessages.some(
      (m) => m.content === message.content && 
             m.sender === message.sender && 
             m.timestamp === message.timestamp
    );

    if (!messageExists) {
      existingMessages.push(message);
    }

    // Sort by timestamp descending (most recent first)
    existingMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Generate file content
    const content = this.generateMarkdownContent(header, existingMessages);
    
    // Write file using StorageInterface (always local first)
    try {
      await this.storage.saveFile(relativePath, content);
      
      // Sync to cloud if configured
      if (this.sync.isConnected()) {
        try {
          await this.sync.uploadFile(relativePath, content);
        } catch (error) {
          // Don't throw - sync is optional, file is already saved locally
          logger.debug({ error, group: groupName, relativePath }, 'Cloud sync failed (file saved locally)');
        }
      }
    } catch (error) {
      logger.error({ error, group: groupName, relativePath }, 'Error writing group markdown file');
      throw error;
    }
  }

  /**
   * Generate markdown file header
   */
  private generateHeader(groupName: string): string {
    return `**GROUP:** ${groupName}\n\n**MESSAGES** (sorted from most to least recent):\n\n`;
  }

  /**
   * Parse existing markdown file
   */
  private parseMarkdownFile(content: string): { header: string; messages: GroupMessage[] } {
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
  private parseMessagesFromContent(content: string): GroupMessage[] {
    const messages: GroupMessage[] = [];
    
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
  private parseMessageBlock(block: string): GroupMessage | null {
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
    messages: GroupMessage[]
  ): string {
    let content = header;

    if (messages.length === 0) {
      content += '---\n\n';
      content += '_No messages in this group yet._\n';
      return content;
    }

    messages.forEach((message, index) => {
      const messageNumber = messages.length - index; // Most recent = highest number
      content += '---\n\n';
      content += this.formatMessage(message, messageNumber);
      content += '\n\n';
    });

    return content.trim() + '\n';
  }

  /**
   * Format a message for markdown
   */
  private formatMessage(message: GroupMessage, messageNumber: number): string {
    const parts: string[] = [];

    // Message title with number
    parts.push(`## Message #${messageNumber}`);

    // Add fields in a list
    const fieldParts: string[] = [];
    fieldParts.push(`- **DATE:** ${message.date}`);
    fieldParts.push(`- **TIME:** ${message.time}`);
    fieldParts.push(`- **AUTHOR:** ${message.sender}`);

    if (fieldParts.length > 0) {
      parts.push(fieldParts.join('\n'));
    }

    // Content formatted as code block for better readability
    parts.push(`\n**CONTENT:**\n\n\`\`\`\n${message.content}\n\`\`\``);

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

  /**
   * Get relative path of markdown file for a group
   * Example: "groups/group-name.md"
   */
  getGroupMarkdownRelativePath(groupName: string): string {
    const sanitizedName = sanitizeGroupName(groupName).toLowerCase().replace(/\s+/g, '-');
    return `groups/${sanitizedName}.md`;
  }
}

