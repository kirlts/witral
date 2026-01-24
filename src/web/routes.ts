// Witral - Web Dashboard Routes
// Web dashboard API routes

import { Hono } from 'hono';
import { WebServerContext } from './index.js';
import { getDashboardHTML } from './templates/dashboard.js';
import { getGroupsHTML } from './templates/groups.js';
import { getTagsHTML } from './templates/tags.js';
import { broadcastSSE } from './sse.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, normalize } from 'path';
import { getAvailableIngestors, getIngestorMetadata, getAvailableSyncPlugins, getSyncMetadata } from '../core/plugins/registry.js';
import { getWebServerContext } from './index.js';

// Get package.json version dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');

// Security: Validate package.json path to prevent path traversal
const resolvedPackagePath = resolve(packageJsonPath);
const normalizedPackagePath = normalize(resolvedPackagePath);

// Ensure we're reading from the expected location (basic validation)
if (!normalizedPackagePath.endsWith('package.json')) {
  logger.error({ path: normalizedPackagePath }, '❌ Invalid package.json path - security check failed');
  throw new Error('Invalid package.json path');
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

// Helper functions for escaping HTML and JS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

function escapeJs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function setupRoutes(app: Hono, context: WebServerContext): void {
  const { ingestor, groupManager, tagManager, storage } = context;
  
  // Helper to get current sync (allows dynamic updates)
  const getSync = () => {
    const currentContext = getWebServerContext();
    return currentContext?.sync || context.sync;
  };

  // Main dashboard route
  app.get('/web', async (c) => {
    const html = await getDashboardHTML(context);
    return c.html(html);
  });

  // Health check endpoint
  app.get('/web/api/health', async (c) => {
    const config = getConfig();
    return c.json({
      status: 'ok',
      version: version,
      ingestor: config.INGESTOR_TYPE || 'not configured',
      sync: config.SYNC_TYPE || 'local',
      webEnabled: config.WEB_ENABLED,
      timestamp: new Date().toISOString()
    });
  });

  // API: Connection status (JSON)
  app.get('/web/api/status', async (c) => {
    const state = ingestor.getConnectionState();
    const isConnected = ingestor.isConnected();
    
    return c.json({
      state,
      isConnected,
      timestamp: new Date().toISOString(),
    });
  });

  // API: Connection status HTML (for HTMX)
  app.get('/web/api/status/html', async (c) => {
    try {
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      logger.debug({ state, isConnected }, '[Dashboard] GET /web/api/status/html - Current connection status');
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionStatusHTML(state, isConnected));
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting connection status HTML');
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionStatusHTML('disconnected', false), 500);
    }
  });

  // API: Connection buttons HTML (for HTMX)
  app.get('/web/api/status/buttons', async (c) => {
    try {
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      const { getConnectionButtonsHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionButtonsHTML(state, isConnected));
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting connection buttons HTML');
      const { getConnectionButtonsHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionButtonsHTML('disconnected', false), 500);
    }
  });

  // API: Get QR (if available)
  app.get('/web/api/qr', async (c) => {
    // QR is obtained via SSE when generated
    return c.json({ qr: null, message: 'QR is generated automatically when requested' });
  });

  // API: Generate QR
  app.post('/web/api/qr/generate', async (c) => {
    try {
      logger.debug({}, '🔄 Generating QR code');
      await ingestor.generateQR();
      // QR will be sent via SSE when available
      broadcastSSE('qr', { message: 'QR generated, waiting for code...' });
      return c.json({ success: true, message: 'QR generated' });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error generating QR code');
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // API: Disconnect
  app.post('/web/api/disconnect', async (c) => {
    try {
      logger.debug({}, '🔌 Disconnecting');
      await ingestor.stop();
      logger.debug({}, '✅ Disconnected successfully');
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      
      // Broadcast status update via SSE
      const { broadcastSSE } = await import('./sse.js');
      broadcastSSE('connection-status', { state, isConnected });
      
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      // Add HTMX trigger to update buttons
      const html = getConnectionStatusHTML(state, isConnected);
      c.header('HX-Trigger', 'connection-changed');
      return c.html(html);
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error disconnecting');
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      
      // Broadcast status update via SSE even on error
      const { broadcastSSE } = await import('./sse.js');
      broadcastSSE('connection-status', { state, isConnected });
      
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionStatusHTML(state, isConnected), 500);
    }
  });

  // API: Connect
  app.post('/web/api/connect', async (c) => {
    try {
      logger.debug({}, '🔌 Connecting');
      
      // Check if already connected
      if (ingestor.isConnected()) {
        const state = ingestor.getConnectionState();
        const isConnected = ingestor.isConnected();
        const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
        const html = getConnectionStatusHTML(state, isConnected);
        c.header('HX-Trigger', 'connection-changed');
        return c.html(html);
      }
      
      await ingestor.start();
      
      // Wait for connection to establish (poll up to 5 seconds)
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts && !ingestor.isConnected()) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      
      logger.debug({ state, isConnected, attempts }, '[Dashboard] POST /web/api/connect - Connection status after start');
      
      // Broadcast status update via SSE
      const { broadcastSSE } = await import('./sse.js');
      logger.debug({ state, isConnected }, '[Dashboard] Broadcasting connection-status SSE event');
      broadcastSSE('connection-status', { state, isConnected });
      
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      // Add HTMX trigger to update buttons
      const html = getConnectionStatusHTML(state, isConnected);
      c.header('HX-Trigger', 'connection-changed');
      return c.html(html);
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error connecting');
      const state = ingestor.getConnectionState();
      const isConnected = ingestor.isConnected();
      
      // Broadcast status update via SSE even on error
      const { broadcastSSE } = await import('./sse.js');
      broadcastSSE('connection-status', { state, isConnected });
      
      const { getConnectionStatusHTML } = await import('./templates/dashboard.js');
      return c.html(getConnectionStatusHTML(state, isConnected), 500);
    }
  });

  // API: List available groups (JSON)
  app.get('/web/api/groups/available', async (c) => {
    try {
      const isConnected = ingestor.isConnected();
      
      if (!isConnected) {
        return c.json({ 
          error: 'No active connection. Connect to your messaging platform first.',
          groups: []
        }, 200);
      }

      const groups = await ingestor.listGroups();
      const monitoredGroups = groupManager.getAllGroups();
      const monitoredNames = new Set(monitoredGroups.map(g => g.name.toLowerCase()));
      
      const groupsWithStatus = groups.map(group => ({
        ...group,
        isMonitored: monitoredNames.has(group.name.toLowerCase()),
      }));
      
      return c.json({ groups: groupsWithStatus });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error listing available groups');
      return c.json({ 
        error: error.message || 'Error getting groups',
        groups: []
      }, 200);
    }
  });

  // API: List monitored groups (HTML for HTMX)
  app.get('/web/api/groups', async (c) => {
    try {
      const monitoredGroups = groupManager.getAllGroups();
      return c.html(getGroupsHTML(monitoredGroups.map(g => ({ name: g.name, jid: g.jid, isMonitored: true }))));
    } catch (error: any) {
      return c.html(`<p class="text-red-500">Error: ${error.message}</p>`);
    }
  });

  // API: Add monitored group
  app.post('/web/api/groups', async (c) => {
    try {
      const { name, jid } = await c.req.json();
      // Validate input
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Group name is required and must be a non-empty string' }, 400);
      }
      // Validate jid if provided
      if (jid !== undefined && (typeof jid !== 'string' || jid.trim().length === 0)) {
        return c.json({ error: 'JID must be a non-empty string if provided' }, 400);
      }
      
      await groupManager.addGroup(name, jid);
      logger.debug({ group: name }, `✅ Group "${name}" added to monitoring`);
      return c.json({ success: true, message: `Group "${name}" added` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error adding group');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Remove monitored group
  app.delete('/web/api/groups/:name', async (c) => {
    try {
      const name = c.req.param('name');
      // Sanitize input - group names are sanitized by GroupManager, but validate here too
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Invalid group name' }, 400);
      }
      await groupManager.removeGroup(name);
      logger.debug({ group: name }, `🗑️ Group "${name}" removed from monitoring`);
      return c.json({ success: true, message: `Group "${name}" removed` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error removing group');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: List tags (HTML for HTMX)
  app.get('/web/api/tags', async (c) => {
    try {
      const tags = tagManager.getAllTags();
      return c.html(getTagsHTML(tags));
    } catch (error: any) {
      return c.html(`<p class="text-red-500">Error: ${error.message}</p>`);
    }
  });

  // API: Create tag
  app.post('/web/api/tags', async (c) => {
    try {
      const { name, description, enabledFields, separator } = await c.req.json();
      // Validate input
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Tag name is required and must be a non-empty string' }, 400);
      }
      // Validate enabledFields is an array if provided
      if (enabledFields !== undefined && !Array.isArray(enabledFields)) {
        return c.json({ error: 'enabledFields must be an array' }, 400);
      }
      // Validate separator is a string if provided
      if (separator !== undefined && typeof separator !== 'string') {
        return c.json({ error: 'separator must be a string' }, 400);
      }
      
      await tagManager.addTag(name, description, enabledFields, separator);
      logger.debug({ tag: name, fields: enabledFields, separator }, `✅ Tag "${name}" created`);
      return c.json({ success: true, message: `Tag "${name}" created` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error creating tag');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Delete tag
  app.delete('/web/api/tags/:name', async (c) => {
    try {
      const name = c.req.param('name');
      // Sanitize input - tag names are sanitized by TagManager, but validate here too
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Invalid tag name' }, 400);
      }
      const { deleteFile } = await c.req.json().catch(() => ({ deleteFile: false }));
      
      await tagManager.removeTag(name);
      
      if (deleteFile) {
        await tagManager.deleteTagMarkdown(name);
        logger.debug({ tag: name, fileDeleted: true }, `🗑️ Tag "${name}" deleted (with markdown file)`);
      } else {
        logger.debug({ tag: name, fileDeleted: false }, `🗑️ Tag "${name}" deleted`);
      }
      
      return c.json({ success: true, message: `Tag "${name}" deleted` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error deleting tag');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Configure tag fields and separator
  app.put('/web/api/tags/:name/fields', async (c) => {
    try {
      const name = c.req.param('name');
      // Validate tag name
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Invalid tag name' }, 400);
      }
      
      const { enabledFields, separator } = await c.req.json();
      
      // Validate enabledFields
      if (!Array.isArray(enabledFields)) {
        return c.json({ error: 'enabledFields must be an array' }, 400);
      }
      
      // Validate enabledFields contains only valid field names
      const validFields = ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO'];
      const invalidFields = enabledFields.filter((f: string) => !validFields.includes(f));
      if (invalidFields.length > 0) {
        return c.json({ error: `Invalid field names: ${invalidFields.join(', ')}` }, 400);
      }
      
      // Validate separator
      if (separator !== undefined) {
        if (typeof separator !== 'string') {
          return c.json({ error: 'separator must be a string' }, 400);
        }
        if (separator.length < 1 || separator.length > 3) {
          return c.json({ error: 'separator must be 1-3 characters' }, 400);
        }
      }
      
      const updates: { enabledFields?: any; separator?: string } = {};
      updates.enabledFields = enabledFields;
      if (separator && separator.length >= 1 && separator.length <= 3) {
        updates.separator = separator;
      }
      
      await tagManager.updateTag(name, updates);
      logger.debug({ tag: name, fields: enabledFields, separator }, `⚙️ Tag "${name}" configured`);
      return c.json({ success: true, message: `Tag "${name}" updated` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error configuring tag');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Get tag markdown
  app.get('/web/api/tags/:name/markdown', async (c) => {
    try {
      const name = c.req.param('name');
      // Security: Validate tag name
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.text('Invalid tag name', 400);
      }
      
      const tag = tagManager.getTag(name);
      
      if (!tag) {
        return c.text('Tag not found', 404);
      }
      
      // Use StorageInterface instead of fs directly
      // StorageInterface handles path sanitization internally
      const relativePath = tagManager.getTagMarkdownRelativePath(name);
      
      // Security: Additional validation - ensure path doesn't contain directory traversal
      if (relativePath.includes('..') || relativePath.startsWith('/')) {
        logger.warn({ name, relativePath }, '❌ Attempted path traversal in tag markdown request');
        return c.text('Invalid path', 400);
      }
      
      const fileExists = await storage.exists(relativePath);
      
      if (!fileExists) {
        return c.text('No messages in this tag yet', 404);
      }
      
      const content = await storage.readFile(relativePath);
      if (!content) {
        return c.text('No messages in this tag yet', 404);
      }
      
      return c.text(content);
    } catch (error: any) {
      logger.error({ error: error.message, tag: c.req.param('name') }, 'Error getting tag markdown');
      return c.text(`Error: ${error.message}`, 500);
    }
  });

  // API: Wizard status
  app.get('/web/api/wizard/status', async (c) => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const wizardFlag = join(process.cwd(), 'data', '.wizard-completed');
    const completed = existsSync(wizardFlag);
    const needed = !completed;
    
    return c.json({ needed, completed });
  });

  // API: Complete wizard
  app.post('/web/api/wizard/complete', async (c) => {
    try {
      const { writeFile, mkdir } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      
      const wizardFlag = join(process.cwd(), 'data', '.wizard-completed');
      const dir = join(wizardFlag, '..');
      
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(wizardFlag, new Date().toISOString(), 'utf-8');
      logger.debug({}, '✅ First-run wizard completed');
      
      return c.json({ success: true, message: 'Wizard completed' });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error completing wizard');
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // API: Wizard - Set ingestor type
  app.post('/web/api/wizard/set-ingestor', async (c) => {
    try {
      const { plugin } = await c.req.json();
      
      // Security: Validate plugin name
      if (!plugin || typeof plugin !== 'string' || plugin.trim().length === 0) {
        return c.json({ error: 'Plugin name is required and must be a non-empty string' }, 400);
      }
      
      // Security: Validate plugin name format (alphanumeric, hyphens, underscores only)
      if (!/^[a-z0-9_-]+$/.test(plugin.toLowerCase())) {
        return c.json({ error: 'Invalid plugin name format' }, 400);
      }
      
      const availablePlugins = getAvailableIngestors();
      if (!availablePlugins.includes(plugin.toLowerCase())) {
        return c.json({ error: 'Invalid plugin name' }, 400);
      }
      
      // Update .env file
      const { readFile, writeFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
      }
      
      // Update or add INGESTOR_TYPE
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith('INGESTOR_TYPE=')) {
          found = true;
          return `INGESTOR_TYPE=${plugin}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`INGESTOR_TYPE=${plugin}`);
      }
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      
      // Update process.env
      process.env.INGESTOR_TYPE = plugin;
      
      logger.debug({ plugin }, '✅ Ingestor type set via wizard');
      return c.json({ success: true, message: `Ingestor set to ${plugin}` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error setting ingestor type');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Wizard - Update env variable
  app.post('/web/api/wizard/set-env', async (c) => {
    try {
      const { key, value } = await c.req.json();
      
      if (!key || value === undefined) {
        return c.json({ error: 'Key and value required' }, 400);
      }
      
      // Security: Validate key format (alphanumeric and underscore only)
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        return c.json({ error: 'Invalid environment variable name format' }, 400);
      }
      
      // Whitelist of allowed env vars for security
      const allowedKeys = [
        'INGESTOR_TYPE', 'SYNC_TYPE', 'WEB_ENABLED', 
        'TAG_FILE_MODE', 'TAG_DYNAMIC_TITLES'
      ];
      
      if (!allowedKeys.includes(key)) {
        return c.json({ error: 'Setting this variable is not allowed' }, 400);
      }
      
      // Security: Validate value type based on key
      if (key === 'WEB_ENABLED' && value !== 'true' && value !== 'false' && value !== true && value !== false) {
        return c.json({ error: 'WEB_ENABLED must be true or false' }, 400);
      }
      if (key === 'TAG_FILE_MODE' && value !== 'new-file' && value !== 'append') {
        return c.json({ error: 'TAG_FILE_MODE must be "new-file" or "append"' }, 400);
      }
      if (key === 'TAG_DYNAMIC_TITLES' && value !== 'true' && value !== 'false' && value !== true && value !== false) {
        return c.json({ error: 'TAG_DYNAMIC_TITLES must be true or false' }, 400);
      }
      if (key === 'SYNC_TYPE' && typeof value !== 'string') {
        return c.json({ error: 'SYNC_TYPE must be a string' }, 400);
      }
      if (key === 'INGESTOR_TYPE' && typeof value !== 'string') {
        return c.json({ error: 'INGESTOR_TYPE must be a string' }, 400);
      }
      
      // Security: Sanitize value - remove newlines and control characters to prevent injection
      const sanitizedValue = String(value).replace(/[\r\n\x00-\x1F\x7F]/g, '');
      
      // Update .env file
      const { readFile, writeFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
      }
      
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
          found = true;
          return `${key}=${sanitizedValue}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`${key}=${sanitizedValue}`);
      }
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      
      // Update process.env
      process.env[key] = sanitizedValue;
      
      logger.debug({ key, value }, '✅ Env variable set via wizard');
      return c.json({ success: true, message: `${key} set to ${value}` });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error setting env variable');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Get available plugins
  app.get('/web/api/plugins/ingestors', async (c) => {
    try {
      const plugins = getAvailableIngestors();
      const config = getConfig();
      const currentPlugin = config.INGESTOR_TYPE || null;
      
      // Validate: ensure we always return valid data structure
      const pluginsWithMetadata = (Array.isArray(plugins) ? plugins : []).map(pluginName => {
        const metadata = getIngestorMetadata(pluginName);
        return {
          id: pluginName || 'unknown',
          name: metadata?.name || pluginName || 'Unknown',
          description: metadata?.description || 'No description',
          isConfigured: pluginName === currentPlugin
        };
      });
      
      // Always return valid structure, even on empty
      return c.json({ 
        plugins: pluginsWithMetadata || [], 
        configured: currentPlugin || null 
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting ingestor plugins');
      // Return valid empty structure instead of error
      return c.json({ plugins: [], configured: null, error: error.message }, 500);
    }
  });

  app.get('/web/api/plugins/sync', async (c) => {
    try {
      const plugins = getAvailableSyncPlugins();
      const config = getConfig();
      const currentPlugin = config.SYNC_TYPE || 'local';
      
      // Validate: ensure we always return valid data structure
      const pluginsWithMetadata = (Array.isArray(plugins) ? plugins : []).map(pluginName => {
        const metadata = getSyncMetadata(pluginName);
        return {
          id: pluginName || 'local',
          name: metadata?.name || pluginName || 'Local',
          description: metadata?.description || 'No description',
          isConfigured: pluginName === currentPlugin
        };
      });
      
      // Always return valid structure, even on empty (should at least have 'local')
      return c.json({ 
        plugins: pluginsWithMetadata.length > 0 ? pluginsWithMetadata : [{ id: 'local', name: 'Local Sync', description: 'Local storage only', isConfigured: true }],
        configured: currentPlugin || 'local'
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting sync plugins');
      // Return valid structure with default 'local' plugin
      return c.json({ 
        plugins: [{ id: 'local', name: 'Local Sync', description: 'Local storage only', isConfigured: true }],
        configured: 'local',
        error: error.message 
      }, 500);
    }
  });

  // API: Cloud sync status (JSON)
  app.get('/web/api/storage/status', async (c) => {
    try {
      const sync = getSync();
      const syncStatus = sync.getConnectionStatus();
      const config = getConfig();
      
      // Get vault folder info if available (for Google Drive)
      let vaultFolderLink = null;
      if (syncStatus?.vaultFolderId && config.SYNC_TYPE === 'googledrive') {
        vaultFolderLink = `https://drive.google.com/drive/folders/${syncStatus.vaultFolderId}`;
      }
      
      // Validate: ensure we always return valid data structure
      const response = {
        local: true, // Local storage is always available
        isConnected: Boolean(syncStatus?.isConnected),
        authMethod: syncStatus?.authMethod || 'none',
        userEmail: syncStatus?.userEmail || null,
        syncType: config.SYNC_TYPE || 'local',
        vaultFolderLink: vaultFolderLink, // Link to Vault folder in Google Drive
      };
      
      return c.json(response);
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting sync status');
      // Return valid fallback structure
      return c.json({ 
        local: true,
        isConnected: false,
        authMethod: 'none',
        userEmail: null,
        syncType: 'local',
        folderId: null,
        error: error.message 
      }, 500);
    }
  });

  // API: Cloud sync status HTML (for HTMX)
  app.get('/web/api/storage/status/html', async (c) => {
    try {
      const sync = getSync();
      const syncStatus = sync.getConnectionStatus();
      const config = getConfig();
      
      const data = {
        isConnected: Boolean(syncStatus?.isConnected),
        authMethod: syncStatus?.authMethod || 'none',
        userEmail: syncStatus?.userEmail || null,
        syncType: config.SYNC_TYPE || 'local',
      };
      
      const { getStorageStatusHTML } = await import('./templates/dashboard.js');
      return c.html(getStorageStatusHTML(data, config));
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting storage status HTML');
      return c.html('<p class="text-red-500">❌ Error loading status</p>', 500);
    }
  });

  // API: Storage actions HTML (for HTMX)
  app.get('/web/api/storage/actions/html', async (c) => {
    try {
      const sync = getSync();
      const syncStatus = sync.getConnectionStatus();
      const config = getConfig();
      
      const data = {
        isConnected: Boolean(syncStatus?.isConnected),
        authMethod: syncStatus?.authMethod || 'none',
        userEmail: syncStatus?.userEmail || null,
        syncType: config.SYNC_TYPE || 'local',
      };
      
      const { getStorageActionsHTML } = await import('./templates/dashboard.js');
      return c.html(getStorageActionsHTML(data, config));
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting storage actions HTML');
      return c.html('', 500);
    }
  });

  // ============ Cloud Sync OAuth (plugin-specific) ============

  // API: Check if OAuth is configured
  app.get('/web/api/oauth/status', async (c) => {
    try {
      const { isOAuthConfigured, hasOAuthTokens, getAuthenticatedUserInfo } = await import('../plugins/sync/googledrive/oauth.js');
      
      const configured = await isOAuthConfigured();
      const hasTokens = await hasOAuthTokens();
      let userInfo = null;
      
      if (hasTokens) {
        userInfo = await getAuthenticatedUserInfo();
      }
      
      return c.json({
        configured,
        authorized: hasTokens,
        user: userInfo,
      });
    } catch (error: any) {
      return c.json({
        configured: false,
        authorized: false,
        error: error.message,
      });
    }
  });

  // API: Save OAuth credentials
  app.post('/web/api/oauth/credentials', async (c) => {
    try {
      const { credentials } = await c.req.json();
      
      if (!credentials) {
        return c.json({ error: 'Credentials JSON is required' }, 400);
      }
      
      // Validate JSON format
      let parsed;
      try {
        parsed = JSON.parse(credentials);
        if (!parsed.web && !parsed.installed) {
          return c.json({ error: 'Invalid format: JSON must contain "web" or "installed" property' }, 400);
        }
      } catch (e: any) {
        return c.json({ error: 'Invalid JSON: ' + e.message }, 400);
      }
      
      // Save credentials
      const { promises: fs } = await import('fs');
      const path = await import('path');
      const { resolve, dirname, normalize } = await import('path');
      
      // Security: Resolve and normalize path to prevent directory traversal
      const basePath = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './data/googledrive/oauth-credentials.json';
      const resolvedPath = resolve(basePath);
      const normalizedPath = normalize(resolvedPath);
      
      // Security: Ensure path is within expected directory (prevent directory traversal)
      const expectedBase = resolve('./data/googledrive');
      if (!normalizedPath.startsWith(expectedBase) && !basePath.startsWith('./data/googledrive')) {
        logger.error({ path: normalizedPath, expectedBase }, '❌ Attempted to save credentials outside allowed directory');
        return c.json({ error: 'Invalid credentials path' }, 400);
      }
      
      const credentialsPath = normalizedPath;
      const dir = dirname(credentialsPath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });
      
      // Save file with restricted permissions (owner read/write only)
      await fs.writeFile(credentialsPath, credentials, { encoding: 'utf-8', mode: 0o600 });
      
      logger.debug({ path: credentialsPath }, '✅ OAuth credentials saved');
      
      return c.json({
        success: true,
        message: 'Credentials saved successfully',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error saving OAuth credentials');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Get authorization URL
  app.get('/web/api/oauth/authorize', async (c) => {
    try {
      const { isOAuthConfigured, getAuthorizationUrl } = await import('../plugins/sync/googledrive/oauth.js');
      
      const configured = await isOAuthConfigured();
      
      if (!configured) {
        return c.json({
          error: 'OAuth credentials not found',
          message: 'You need to configure OAuth credentials first before connecting.',
          instructions: [
            '1. Go to Google Cloud Console → APIs & Services → Credentials',
            '2. Create an OAuth 2.0 Client ID (type: Desktop app)',
            '3. Copy the Client ID and Client Secret',
            '4. Enter them in the form below',
          ],
        }, 400);
      }
      
      // Use web dashboard port (3000) with callback path
      const appConfig = getConfig();
      const port = appConfig.WEB_PORT || 3000;
      const authUrl = await getAuthorizationUrl(port, '/web/oauth/callback');
      
      return c.json({
        authUrl,
        automatic: true, // Indicates this is an automatic flow
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error generating authorization URL');
      return c.json({ error: error.message }, 500);
    }
  });

  // OAuth callback page (GET - receives code as query parameter)
  app.get('/web/oauth/callback', async (c) => {
    try {
      const code = c.req.query('code') || '';
      const error = c.req.query('error') || '';
      
      if (error) {
        const errorEscaped = escapeHtml(error);
        const errorJsEscaped = escapeJs(error);
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>OAuth Error</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1 class="error">Authorization Failed</h1>
  <p>${errorEscaped}</p>
  <p>You can close this window.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-error', error: '${errorJsEscaped}' }, '*');
    }
  </script>
</body>
</html>`;
        return c.html(errorHtml);
      }
      
      if (!code) {
        const noCodeHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>OAuth Error</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1 class="error">No Authorization Code</h1>
  <p>Authorization code was not provided.</p>
  <p>You can close this window.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-error', error: 'No authorization code provided' }, '*');
    }
  </script>
</body>
</html>`;
        return c.html(noCodeHtml);
      }
      
      const { exchangeCodeForTokens } = await import('../plugins/sync/googledrive/oauth.js');
      
      // Use web dashboard port with callback path
      const port = getConfig().WEB_PORT || 3000;
      await exchangeCodeForTokens(code.trim(), port, '/web/oauth/callback');
      
      // Reinitialize sync with OAuth
      const sync = getSync();
      if ((sync as any).reinitializeDrive) {
        await (sync as any).reinitializeDrive();
      }
      
      logger.debug({}, '✅ OAuth authorized successfully');
      
      const successHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Successful</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    .success { color: #16a34a; }
    .spinner { border: 3px solid #f3f4f6; border-top: 3px solid #16a34a; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <h1 class="success">Authorization Successful!</h1>
  <p>Google Drive is now connected.</p>
  <p>Closing window...</p>
  <div class="spinner"></div>
  <script>
    // Notify parent window and wait a bit for sync to initialize
    if (window.opener) {
      setTimeout(() => {
        window.opener.postMessage({ type: 'oauth-success', message: 'Cloud sync connected successfully' }, '*');
        setTimeout(() => window.close(), 500);
      }, 500);
    } else {
      setTimeout(() => window.location.href = '/web', 2000);
    }
  </script>
</body>
</html>`;
      
      return c.html(successHtml);
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error in OAuth callback');
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>OAuth Error</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1 class="error">Authorization Failed</h1>
  <p>${escapeHtml(error.message)}</p>
  <p>You can close this window.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-error', error: '${escapeJs(error.message)}' }, '*');
    }
  </script>
</body>
</html>`;
      return c.html(errorHtml);
    }
  });

  // API: Exchange authorization code for tokens (POST endpoint for manual OAuth flow)
  app.post('/web/api/oauth/callback', async (c) => {
    try {
      const { code } = await c.req.json();
      
      // Security: Validate authorization code
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return c.json({ error: 'Authorization code is required and must be a non-empty string' }, 400);
      }
      
      // Security: Validate code format (OAuth codes are typically alphanumeric with some special chars)
      // Allow alphanumeric, hyphens, underscores, and dots
      if (!/^[A-Za-z0-9._/-]+$/.test(code.trim())) {
        return c.json({ error: 'Invalid authorization code format' }, 400);
      }
      
      const { exchangeCodeForTokens } = await import('../plugins/sync/googledrive/oauth.js');
      
      // Use web dashboard port with callback path
      const port = getConfig().WEB_PORT || 3000;
      await exchangeCodeForTokens(code.trim(), port, '/web/oauth/callback');
      
      // Reinitialize sync with OAuth
      const sync = getSync();
      if ((sync as any).reinitializeDrive) {
        await (sync as any).reinitializeDrive();
      }
      
      logger.debug({}, '✅ OAuth authorized successfully');
      
      // Broadcast sync status update via SSE
      try {
        const sync = getSync();
        const syncStatus = sync.getConnectionStatus();
        const config = getConfig();
        broadcastSSE('sync-status', {
          isConnected: syncStatus.isConnected,
          authMethod: syncStatus.authMethod || 'none',
          userEmail: syncStatus.userEmail || null,
          syncType: config.SYNC_TYPE || 'local'
        });
      } catch (error) {
        // Ignore SSE errors
      }
      
      return c.json({
        success: true,
        message: 'Authorization successful! Cloud sync is now connected.',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error exchanging authorization code');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Revoke tokens (Google Drive logout)
  // API: Get tag file modes status
  app.get('/web/api/tag-modes/status', async (c) => {
    try {
      const config = getConfig();
      
      // Validate: ensure we always return valid data structure
      const response = {
        fileMode: config.TAG_FILE_MODE === 'append' ? 'append' : 'new-file', // Ensure valid enum
        dynamicTitles: config.TAG_DYNAMIC_TITLES !== false, // Default true
      };
      
      return c.json(response);
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error getting tag modes status');
      // Return valid fallback structure with defaults
      return c.json({ 
        fileMode: 'new-file',
        dynamicTitles: true,
        error: error.message 
      }, 500);
    }
  });

  // API: Toggle tag file mode
  app.post('/web/api/tag-modes/toggle-file-mode', async (c) => {
    try {
      const { readFile, writeFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
      }
      
      const config = getConfig();
      const currentMode = config.TAG_FILE_MODE || 'new-file';
      const newMode = currentMode === 'new-file' ? 'append' : 'new-file';
      
      // Update or add TAG_FILE_MODE
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith('TAG_FILE_MODE=')) {
          found = true;
          return `TAG_FILE_MODE=${newMode}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`TAG_FILE_MODE=${newMode}`);
      }
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      
      logger.debug({ newMode }, '✅ Tag file mode updated');
      return c.json({ success: true, newMode, message: 'File mode updated. Restart Witral for changes to take effect.' });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error updating tag file mode');
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // API: Toggle dynamic titles
  app.post('/web/api/tag-modes/toggle-dynamic-titles', async (c) => {
    try {
      const { readFile, writeFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
      }
      
      const config = getConfig();
      const current = config.TAG_DYNAMIC_TITLES !== false; // Default true
      const newValue = !current;
      
      // Update or add TAG_DYNAMIC_TITLES
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith('TAG_DYNAMIC_TITLES=')) {
          found = true;
          return `TAG_DYNAMIC_TITLES=${newValue}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`TAG_DYNAMIC_TITLES=${newValue}`);
      }
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      
      logger.debug({ newValue }, '✅ Dynamic titles setting updated');
      return c.json({ success: true, newValue, message: 'Dynamic titles setting updated. Restart Witral for changes to take effect.' });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error updating dynamic titles setting');
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/web/api/oauth/revoke', async (c) => {
    try {
      const { revokeTokens } = await import('../plugins/sync/googledrive/oauth.js');
      
      await revokeTokens();
      
      // Reinitialize sync without OAuth
      const sync = getSync();
      if ((sync as any).reinitializeDrive) {
        await (sync as any).reinitializeDrive();
      }
      
      logger.debug({}, '🔌 Google Drive session closed');
      
      // Broadcast sync status update via SSE
      try {
        const sync = getSync();
        const syncStatus = sync.getConnectionStatus();
        const config = getConfig();
        broadcastSSE('sync-status', {
          isConnected: syncStatus.isConnected,
          authMethod: syncStatus.authMethod || 'none',
          userEmail: syncStatus.userEmail || null,
          syncType: config.SYNC_TYPE || 'local'
        });
      } catch (error) {
        // Ignore SSE errors
      }
      
      return c.json({
        success: true,
        message: 'Google Drive session closed',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error revoking tokens');
      return c.json({ error: error.message }, 500);
    }
  });

  // API: Change sync plugin (dynamic - no restart required)
  app.post('/web/api/sync/change-plugin', async (c) => {
    try {
      const { plugin } = await c.req.json();
      
      if (!plugin) {
        return c.json({ error: 'Plugin name required' }, 400);
      }
      
      const availablePlugins = getAvailableSyncPlugins();
      if (!availablePlugins.includes(plugin)) {
        return c.json({ error: 'Invalid plugin name' }, 400);
      }
      
      // Update .env file
      const { readFile, writeFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
      }
      
      // Update or add SYNC_TYPE
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith('SYNC_TYPE=')) {
          found = true;
          return `SYNC_TYPE=${plugin}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`SYNC_TYPE=${plugin}`);
      }
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      
      // Update process.env and reload config
      process.env.SYNC_TYPE = plugin;
      const { _clearCache } = await import('../config/index.js');
      _clearCache();
      const { config: loadEnv } = await import('dotenv');
      loadEnv();
      
      // Recreate sync plugin dynamically (like CLI does)
      const { createSync } = await import('../core/sync/factory.js');
      const { updateWebServerSync, updateCLIWritersSync } = await import('./index.js');
      const { getWebServerContext } = await import('./index.js');
      
      logger.debug({ plugin }, '🔄 Loading sync plugin dynamically...');
      const newSync = await createSync();
      await newSync.initialize();
      
      // Update web server context
      await updateWebServerSync(newSync);
      
      // Update CLI writers with new sync instance
      await updateCLIWritersSync(newSync);
      
      logger.debug({ plugin }, '✅ Sync plugin updated dynamically (no restart required)');
      
      // Broadcast sync status update
      try {
        const syncStatus = newSync.getConnectionStatus();
        const config = getConfig();
        let vaultFolderLink = null;
        if (syncStatus?.vaultFolderId && config.SYNC_TYPE === 'googledrive') {
          vaultFolderLink = `https://drive.google.com/drive/folders/${syncStatus.vaultFolderId}`;
        }
        broadcastSSE('sync-status', {
          isConnected: syncStatus.isConnected,
          authMethod: syncStatus.authMethod || 'none',
          userEmail: syncStatus.userEmail || null,
          syncType: config.SYNC_TYPE || 'local',
          vaultFolderLink: vaultFolderLink
        });
      } catch (error) {
        // Ignore SSE errors
      }
      
      c.header('HX-Trigger', 'storage-changed');
      return c.json({
        success: true,
        message: `Sync plugin changed to ${plugin}. The change is active immediately. No restart required.`,
        plugin
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error changing sync plugin');
      return c.json({ error: error.message }, 500);
    }
  });
}

