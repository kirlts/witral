// Witral - Tag Management
// Modular system for managing message tags

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { sanitizeTagName, sanitizeSeparator, sanitizeFilename } from '../../utils/sanitize.js';

export type TagField = 'AUTOR' | 'HORA' | 'FECHA' | 'CONTENIDO';

export type TagFileMode = 'new-file' | 'append';

export interface Tag {
  name: string;
  description?: string;
  enabledFields: TagField[];
  separator: string; // Separator to detect tag (default: ",,")
  fileMode?: TagFileMode; // Individual file mode for this tag (overrides global setting)
  createdAt: string;
}

export class TagManager {
  private config = getConfig();
  private tagsPath: string;
  private tags: Map<string, Tag> = new Map();

  constructor() {
    // Store tags.json in the data directory
    // This allows tags to be version-controlled separately from vault content
    this.tagsPath = join(process.cwd(), 'data', 'tags.json');
  }

  /**
   * Load tags from file
   */
  async load(): Promise<void> {
    try {

      if (existsSync(this.tagsPath)) {
        const data = await readFile(this.tagsPath, 'utf-8');
        const tagsArray = JSON.parse(data) as Tag[];
        
        this.tags.clear();
        for (const tag of tagsArray) {
          this.tags.set(tag.name.toLowerCase(), tag);
        }
        
        logger.debug({ count: this.tags.size }, 'Tags loaded');
      } else {
        logger.debug('No tags configured');
      }
    } catch (error) {
      logger.error({ error }, 'Error loading tags');
      this.tags.clear();
    }
  }

  /**
   * Save tags to file
   */
  private async save(): Promise<void> {
    try {
      const tagsArray = Array.from(this.tags.values());
      const dir = join(this.tagsPath, '..');
      
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(this.tagsPath, JSON.stringify(tagsArray, null, 2), 'utf-8');
      logger.debug({ count: tagsArray.length }, 'Tags saved');
    } catch (error) {
      logger.error({ error }, 'Error saving tags');
      throw error;
    }
  }

  /**
   * Add a new tag
   * @param name - Tag name (will be sanitized and lowercased)
   * @param description - Optional description
   * @param enabledFields - Fields to include in markdown output
   * @param separator - Separator to detect tag in messages (default: ",,")
   * @param fileMode - File mode for this tag (overrides global setting)
   */
  async addTag(name: string, description?: string, enabledFields?: TagField[], separator?: string, fileMode?: TagFileMode): Promise<boolean> {
    // Sanitize and normalize tag name
    const sanitizedName = sanitizeTagName(name);
    const normalizedName = sanitizedName.toLowerCase();
    
    if (this.tags.has(normalizedName)) {
      return false; // Already exists
    }

    // CONTENT is always enabled
    const fields: TagField[] = enabledFields || ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO'];
    if (!fields.includes('CONTENIDO')) {
      fields.push('CONTENIDO');
    }

    // Sanitize separator (1-3 characters, default: ",,")
    const validSeparator = sanitizeSeparator(separator || ',,');

    const tag: Tag = {
      name: sanitizedName, // Save sanitized name (lowercase for consistency)
      description: description?.trim(),
      enabledFields: fields,
      separator: validSeparator,
      fileMode: fileMode, // Individual file mode (undefined = use global default)
      createdAt: new Date().toISOString(),
    };

    this.tags.set(normalizedName, tag);
    await this.save();
    
    return true;
  }

  /**
   * Remove a tag
   */
  async removeTag(name: string): Promise<boolean> {
    const normalizedName = name.toLowerCase();
    
    if (!this.tags.has(normalizedName)) {
      return false; // Does not exist
    }

    this.tags.delete(normalizedName);
    await this.save();
    
    return true;
  }

  /**
   * Update a tag
   * @param name - Tag name to update
   * @param updates - Partial tag data to update
   */
  async updateTag(name: string, updates: Partial<Omit<Tag, 'name' | 'createdAt'>>): Promise<boolean> {
    const normalizedName = name.toLowerCase();
    const tag = this.tags.get(normalizedName);
    
    if (!tag) {
      return false;
    }

    // Ensure CONTENT is always enabled
    if (updates.enabledFields && !updates.enabledFields.includes('CONTENIDO')) {
      updates.enabledFields.push('CONTENIDO');
    }

    // Sanitize separator if provided
    if (updates.separator) {
      updates.separator = sanitizeSeparator(updates.separator);
    }

    // Sanitize description if provided
    if (updates.description !== undefined) {
      updates.description = updates.description?.trim();
    }

    // Validate fileMode if provided
    if (updates.fileMode !== undefined && updates.fileMode !== 'new-file' && updates.fileMode !== 'append') {
      updates.fileMode = undefined; // Reset to use global default
    }

    Object.assign(tag, updates);
    await this.save();
    
    return true;
  }

  /**
   * Get a tag by name
   */
  getTag(name: string): Tag | undefined {
    return this.tags.get(name.toLowerCase());
  }

  /**
   * Get all tags
   */
  getAllTags(): Tag[] {
    return Array.from(this.tags.values());
  }

  /**
   * Detect if a message belongs to a tag
   * Expected formats:
   * 1. "TAG<separator>content" - Simple format
   * 2. "TAG<separator>TITLE<separator>content" - Dynamic title format (if enabled)
   * Default separator is ",," but can be configured per tag (1-3 characters)
   */
  detectTag(messageContent: string): { tagName: string; content: string; dynamicTitle?: string } | null {
    const config = getConfig();
    const dynamicTitlesEnabled = config.TAG_DYNAMIC_TITLES;
    
    // Iterate over all tags and search for match with separator at START
    for (const tag of this.tags.values()) {
      const separator = tag.separator || ',,';
      
      // Separator must be at the START of the message
      if (!messageContent.startsWith(separator)) {
        continue;
      }

      // Extract content after first separator
      const contentAfterFirstSeparator = messageContent.substring(separator.length).trimStart();
      
      // Check if there's a second separator (for dynamic titles)
      // Format: separator+tag+separator+title+space+content
      const secondSeparatorIndex = contentAfterFirstSeparator.indexOf(separator);
      
      if (dynamicTitlesEnabled && secondSeparatorIndex >= 0) {
        // Dynamic title format: tag+separator+title+space/newline+content
        const potentialTag = contentAfterFirstSeparator.substring(0, secondSeparatorIndex).trim();
        
        // Check if it matches this tag (case-insensitive)
        if (potentialTag.toLowerCase() === tag.name.toLowerCase()) {
          // Extract content after second separator
          const contentAfterSecondSeparator = contentAfterFirstSeparator.substring(secondSeparatorIndex + separator.length);
          
          // Find the first delimiter (space or newline) to separate title from content
          const spaceIndex = contentAfterSecondSeparator.indexOf(' ');
          const newlineIndex = contentAfterSecondSeparator.indexOf('\n');
          
          // Find the earliest delimiter
          let delimiterIndex = -1;
          if (spaceIndex >= 0 && newlineIndex >= 0) {
            delimiterIndex = Math.min(spaceIndex, newlineIndex);
          } else if (spaceIndex >= 0) {
            delimiterIndex = spaceIndex;
          } else if (newlineIndex >= 0) {
            delimiterIndex = newlineIndex;
          }
          
          if (delimiterIndex >= 0) {
            // Extract title (before delimiter) and content (after delimiter)
            const dynamicTitle = contentAfterSecondSeparator.substring(0, delimiterIndex).trim();
            const content = contentAfterSecondSeparator.substring(delimiterIndex + 1).trim();
            
            if (dynamicTitle.length > 0) {
              return {
                tagName: tag.name,
                content: content,
                dynamicTitle: dynamicTitle,
              };
            }
          } else if (contentAfterSecondSeparator.trim().length > 0) {
            // Title without content (no space or newline after)
            return {
              tagName: tag.name,
              content: '',
              dynamicTitle: contentAfterSecondSeparator.trim(),
            };
          }
        }
      }
      
      // Simple format: tag+separator+content (or tag+separator if no content)
      // Find first delimiter (space or newline) to separate tag from rest
      const firstSpaceIndex = contentAfterFirstSeparator.indexOf(' ');
      const firstNewlineIndex = contentAfterFirstSeparator.indexOf('\n');
      
      // Find the earliest delimiter
      let firstDelimiterIndex = -1;
      if (firstSpaceIndex >= 0 && firstNewlineIndex >= 0) {
        firstDelimiterIndex = Math.min(firstSpaceIndex, firstNewlineIndex);
      } else if (firstSpaceIndex >= 0) {
        firstDelimiterIndex = firstSpaceIndex;
      } else if (firstNewlineIndex >= 0) {
        firstDelimiterIndex = firstNewlineIndex;
      }
      
      let potentialTag: string;
      let remainingContent: string;
      
      if (firstDelimiterIndex === -1) {
        // No delimiter, everything is the tag (no content)
        potentialTag = contentAfterFirstSeparator;
        remainingContent = '';
      } else {
        // Separate tag (before first delimiter) and remaining content (after)
        potentialTag = contentAfterFirstSeparator.substring(0, firstDelimiterIndex);
        remainingContent = contentAfterFirstSeparator.substring(firstDelimiterIndex + 1).trim();
      }

      if (!potentialTag || potentialTag.length === 0) {
        continue;
      }

      // Check if it matches this tag (case-insensitive)
      if (potentialTag.toLowerCase() !== tag.name.toLowerCase()) {
        continue;
      }

      // Simple format: tag+separator+content
      return {
        tagName: tag.name,
        content: remainingContent,
      };
    }

    // No tag found - don't log (too verbose)
    return null;
  }

  /**
   * Get absolute path of markdown file for a tag
   * @private Used internally for file operations that require absolute paths
   */
  private getTagMarkdownPath(tagName: string): string {
    const normalizedName = tagName.toLowerCase();
    return join(this.config.VAULT_PATH, 'tags', `${normalizedName}.md`);
  }

  /**
   * Get relative path of markdown file for a tag
   * Example: "tags/test.md" or "tags/idea/Christmas.md" (with dynamic title)
   */
  getTagMarkdownRelativePath(tagName: string, dynamicTitle?: string): string {
    const normalizedName = tagName.toLowerCase();
    
    if (dynamicTitle) {
      // Dynamic title: save in tag subdirectory
      // Example: tags/idea/Christmas.md or tags/idea/título.md
      // Preserves Unicode characters, only removes problematic filename characters
      const sanitizedTitle = sanitizeFilename(dynamicTitle);
      return `tags/${normalizedName}/${sanitizedTitle}.md`;
    }
    
    // Default: save in tags root
    return `tags/${normalizedName}.md`;
  }

  /**
   * Delete markdown file of a tag
   * NOTE: Only deletes the specific tag file, never the vault directory or other files
   */
  async deleteTagMarkdown(tagName: string): Promise<boolean> {
    const { unlink } = await import('fs/promises');
    const { existsSync, statSync } = await import('fs');
    
    try {
      const filePath = this.getTagMarkdownPath(tagName);
      
      // CRITICAL: Verify it's a file, not a directory, and not the vault root
      if (filePath === this.config.VAULT_PATH || filePath.startsWith(this.config.VAULT_PATH + '/..')) {
        logger.warn({ tagName, filePath }, 'Attempted to delete vault directory - operation blocked');
        return false;
      }
      
      if (existsSync(filePath)) {
        // Verify it's actually a file, not a directory
        const stats = await statSync(filePath);
        if (stats.isDirectory()) {
          logger.warn({ tagName, filePath }, 'Attempted to delete directory - operation blocked');
          return false;
        }
        
        await unlink(filePath);
        logger.debug({ tag: tagName, filePath }, 'Tag markdown file deleted');
        return true;
      }
      return false; // File does not exist
    } catch (error) {
      logger.error({ error, tag: tagName }, 'Error deleting tag markdown file');
      return false;
    }
  }
}

