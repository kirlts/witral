// Witral - Local Storage Plugin
// StorageInterface implementation using local filesystem

import { readFile, writeFile, mkdir, unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { StorageInterface } from '../../../core/storage/interface.js';
import { getConfig } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

export class LocalStorage implements StorageInterface {
  private config = getConfig();
  private basePath: string;

  constructor() {
    // Use VAULT_PATH as base for markdown files
    this.basePath = this.config.VAULT_PATH;
  }

  async initialize(): Promise<void> {
    // Ensure base directory exists (create if it doesn't, preserve if it does)
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true });
      logger.debug({ basePath: this.basePath }, 'Local storage directory created');
    }
  }

  async saveFile(path: string, content: string): Promise<void> {
    // Security: Prevent path traversal attacks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      logger.warn({ path }, '❌ Attempted path traversal in saveFile');
      throw new Error('Invalid file path - path traversal detected');
    }
    
    const fullPath = join(this.basePath, path);
    
    // Security: Ensure resolved path is within basePath
    const { resolve, normalize } = await import('path');
    const resolvedBase = resolve(this.basePath);
    const resolvedPath = resolve(fullPath);
    const normalizedPath = normalize(resolvedPath);
    
    if (!normalizedPath.startsWith(resolvedBase)) {
      logger.warn({ path, resolvedPath, resolvedBase }, '❌ Attempted to save file outside base path');
      throw new Error('Invalid file path - outside allowed directory');
    }
    
    const dir = dirname(fullPath);

    // Create directory if it doesn't exist
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write file
    await writeFile(fullPath, content, 'utf-8');
  }

  async readFile(path: string): Promise<string | null> {
    // Security: Prevent path traversal attacks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      logger.warn({ path }, '❌ Attempted path traversal in readFile');
      return null;
    }
    
    const fullPath = join(this.basePath, path);
    
    // Security: Ensure resolved path is within basePath
    const { resolve, normalize } = await import('path');
    const resolvedBase = resolve(this.basePath);
    const resolvedPath = resolve(fullPath);
    const normalizedPath = normalize(resolvedPath);
    
    if (!normalizedPath.startsWith(resolvedBase)) {
      logger.warn({ path, resolvedPath, resolvedBase }, '❌ Attempted to read file outside base path');
      return null;
    }
    
    if (!existsSync(fullPath)) {
      return null;
    }

    try {
      return await readFile(fullPath, 'utf-8');
    } catch (error) {
      logger.error({ error, path }, 'Error reading file');
      return null;
    }
  }

  async exists(path: string): Promise<boolean> {
    // Security: Prevent path traversal attacks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      logger.warn({ path }, '❌ Attempted path traversal in exists');
      return false;
    }
    
    const fullPath = join(this.basePath, path);
    
    // Security: Ensure resolved path is within basePath
    const { resolve, normalize } = await import('path');
    const resolvedBase = resolve(this.basePath);
    const resolvedPath = resolve(fullPath);
    const normalizedPath = normalize(resolvedPath);
    
    if (!normalizedPath.startsWith(resolvedBase)) {
      logger.warn({ path, resolvedPath, resolvedBase }, '❌ Attempted to check file outside base path');
      return false;
    }
    
    return existsSync(fullPath);
  }

  async deleteFile(path: string): Promise<void> {
    // Security: Prevent path traversal attacks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      logger.warn({ path }, '❌ Attempted path traversal in deleteFile');
      throw new Error('Invalid file path - path traversal detected');
    }
    
    const fullPath = join(this.basePath, path);
    
    // Security: Ensure resolved path is within basePath
    const { resolve, normalize } = await import('path');
    const resolvedBase = resolve(this.basePath);
    const resolvedPath = resolve(fullPath);
    const normalizedPath = normalize(resolvedPath);
    
    if (!normalizedPath.startsWith(resolvedBase)) {
      logger.warn({ path, resolvedPath, resolvedBase }, '❌ Attempted to delete file outside base path');
      throw new Error('Invalid file path - outside allowed directory');
    }
    
    // CRITICAL: Never delete the vault directory itself, only individual files
    // This protects user's valuable markdown files from accidental deletion
    if (fullPath === this.basePath || fullPath === join(this.basePath, '..')) {
      logger.warn({ path, basePath: this.basePath }, 'Attempted to delete vault directory - operation blocked');
      throw new Error('Cannot delete vault directory - only individual files can be deleted');
    }
    
    if (existsSync(fullPath)) {
      // Verify it's a file, not a directory
      const { statSync } = await import('fs');
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        logger.warn({ path }, 'Attempted to delete directory - operation blocked');
        throw new Error('Cannot delete directories - only individual files can be deleted');
      }
      await unlink(fullPath);
    }
  }

  async listFiles(path: string): Promise<string[]> {
    // Security: Prevent path traversal attacks
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      logger.warn({ path }, '❌ Attempted path traversal in listFiles');
      return [];
    }
    
    const fullPath = join(this.basePath, path);
    
    // Security: Ensure resolved path is within basePath
    const { resolve, normalize } = await import('path');
    const resolvedBase = resolve(this.basePath);
    const resolvedPath = resolve(fullPath);
    const normalizedPath = normalize(resolvedPath);
    
    if (!normalizedPath.startsWith(resolvedBase)) {
      logger.warn({ path, resolvedPath, resolvedBase }, '❌ Attempted to list files outside base path');
      return [];
    }
    
    if (!existsSync(fullPath)) {
      return [];
    }

    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const files: string[] = [];
      
      for (const entry of entries) {
        if (entry.isFile()) {
          // Security: Ensure returned paths don't contain directory traversal
          const relativePath = join(path, entry.name);
          if (!relativePath.includes('..')) {
            files.push(relativePath);
          }
        }
      }
      
      return files;
    } catch (error) {
      logger.error({ error, path }, 'Error listing files');
      return [];
    }
  }
}

