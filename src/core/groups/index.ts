// Witral - Group Management
// Modular system for managing monitored groups

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { sanitizeGroupName } from '../../utils/sanitize.js';

export interface MonitoredGroup {
  name: string;
  jid?: string; // Automatically filled when found
  addedAt: string;
}

export class GroupManager {
  private config = getConfig();
  private groupsPath: string;
  private groups: Map<string, MonitoredGroup> = new Map();

  constructor() {
    // Store groups.json in the data directory (same level as vault would be if it was in data)
    // Since vault is now at root, we keep groups.json in data directory for consistency
    this.groupsPath = join(process.cwd(), 'data', 'monitored-groups.json');
  }

  /**
   * Load monitored groups from file
   */
  async load(): Promise<void> {
    try {
      if (existsSync(this.groupsPath)) {
        const data = await readFile(this.groupsPath, 'utf-8');
        const groupsArray = JSON.parse(data) as MonitoredGroup[];
        
        this.groups.clear();
        for (const group of groupsArray) {
          this.groups.set(group.name.toLowerCase(), group);
        }
        
        logger.debug({ count: this.groups.size }, 'Monitored groups loaded');
      } else {
        logger.debug('No monitored groups configured');
      }
    } catch (error) {
      logger.error({ error }, 'Error loading monitored groups');
      this.groups.clear();
    }
  }

  /**
   * Save monitored groups to file
   */
  private async save(): Promise<void> {
    try {
      const groupsArray = Array.from(this.groups.values());
      const dir = join(this.groupsPath, '..');
      
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(this.groupsPath, JSON.stringify(groupsArray, null, 2), 'utf-8');
      logger.debug({ count: groupsArray.length }, 'Monitored groups saved');
    } catch (error) {
      logger.error({ error }, 'Error saving monitored groups');
      throw error;
    }
  }

  /**
   * Add a group to the monitored list
   */
  async addGroup(name: string, jid?: string): Promise<boolean> {
    // Sanitize group name (removes control characters, trims)
    const sanitizedName = sanitizeGroupName(name);
    if (!sanitizedName) {
      return false; // Invalid name
    }

    const normalizedName = sanitizedName.toLowerCase();
    
    if (this.groups.has(normalizedName)) {
      return false; // Already exists
    }

    const group: MonitoredGroup = {
      name: sanitizedName, // Save sanitized name
      jid,
      addedAt: new Date().toISOString(),
    };

    this.groups.set(normalizedName, group);
    await this.save();
    
    // Log removed: CLI already shows confirmation to user
    return true;
  }

  /**
   * Remove a group from the monitored list
   */
  async removeGroup(name: string): Promise<boolean> {
    const normalizedName = name.toLowerCase();
    
    if (!this.groups.has(normalizedName)) {
      return false; // Does not exist
    }

    this.groups.delete(normalizedName);
    await this.save();
    
    // Log removed: CLI already shows confirmation to user
    return true;
  }

  /**
   * Check if a group is being monitored
   */
  isMonitored(groupName: string): boolean {
    return this.groups.has(groupName.toLowerCase());
  }

  /**
   * Get information of a monitored group
   */
  getGroup(groupName: string): MonitoredGroup | undefined {
    return this.groups.get(groupName.toLowerCase());
  }

  /**
   * Update the JID of a group (when found)
   */
  async updateGroupJid(groupName: string, jid: string): Promise<void> {
    const normalizedName = groupName.toLowerCase();
    const group = this.groups.get(normalizedName);
    
    if (group) {
      group.jid = jid;
      await this.save();
    }
  }

  /**
   * Get all monitored groups
   */
  getAllGroups(): MonitoredGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get original name of a group (case-sensitive)
   */
  getOriginalName(groupName: string): string | undefined {
    const group = this.groups.get(groupName.toLowerCase());
    return group?.name;
  }
}

