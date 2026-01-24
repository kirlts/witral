// Witral - Plugin Registry
// Dynamic plugin discovery and registration system

import { readFileSync } from 'fs';
import { join, dirname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PluginMetadata {
  name: string;
  description: string;
  module: string;
  dependencies: string[];
  optional: boolean;
  exportName?: string; // Optional: explicit export name if not following naming convention
}

interface PluginRegistry {
  ingestors: Record<string, PluginMetadata>;
  sync: Record<string, PluginMetadata>;
}

let registryCache: PluginRegistry | null = null;

/**
 * Load plugin registry from JSON file
 */
function loadRegistry(): PluginRegistry {
  if (registryCache) {
    return registryCache;
  }

  try {
    // Try dist/plugins/registry.json first (production build)
    // Fallback to src/plugins/registry.json (development)
    let registryPath = join(__dirname, '../../plugins/registry.json');
    
    // Check if we're running from dist/ (production) or src/ (development)
    const isProduction = __dirname.includes('dist');
    
    if (isProduction) {
      // In production, registry.json should be in dist/plugins/
      // __dirname is dist/core/plugins, so we need to go up to dist/ then into plugins/
      registryPath = join(__dirname, '../../plugins/registry.json');
    } else {
      // In development, registry.json is in src/plugins/
      // __dirname is src/core/plugins, so we need to go up to src/ then into plugins/
      registryPath = join(__dirname, '../../plugins/registry.json');
    }
    
    // Security: Validate path is within expected directory structure
    const resolvedPath = resolve(registryPath);
    const normalizedPath = normalize(resolvedPath);
    
    // Ensure we're reading from the expected location (prevent path traversal)
    if (!normalizedPath.includes('plugins/registry.json')) {
      logger.error({ path: normalizedPath }, '❌ Invalid registry path - security check failed');
      return { ingestors: {}, sync: {} };
    }
    
    const registryContent = readFileSync(registryPath, 'utf-8');
    registryCache = JSON.parse(registryContent) as PluginRegistry;
    return registryCache;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isProduction = __dirname.includes('dist');
    logger.error({ error: errorMessage, __dirname, isProduction }, 'Failed to load plugin registry');
    // Return empty registry as fallback
    return { ingestors: {}, sync: {} };
  }
}

/**
 * Get available ingestor plugins
 */
export function getAvailableIngestors(): string[] {
  const registry = loadRegistry();
  return Object.keys(registry.ingestors);
}

/**
 * Get available sync plugins
 */
export function getAvailableSyncPlugins(): string[] {
  const registry = loadRegistry();
  return Object.keys(registry.sync);
}

/**
 * Get ingestor plugin metadata
 */
export function getIngestorMetadata(pluginName: string): PluginMetadata | null {
  const registry = loadRegistry();
  return registry.ingestors[pluginName.toLowerCase()] || null;
}

/**
 * Get sync plugin metadata
 */
export function getSyncMetadata(pluginName: string): PluginMetadata | null {
  const registry = loadRegistry();
  return registry.sync[pluginName.toLowerCase()] || null;
}

/**
 * Get dependencies for a plugin
 */
export function getPluginDependencies(pluginType: 'ingestor' | 'sync', pluginName: string): string[] {
  const metadata = pluginType === 'ingestor' 
    ? getIngestorMetadata(pluginName)
    : getSyncMetadata(pluginName);
  
  return metadata?.dependencies || [];
}

/**
 * Check if a plugin is optional
 */
export function isPluginOptional(pluginType: 'ingestor' | 'sync', pluginName: string): boolean {
  const metadata = pluginType === 'ingestor' 
    ? getIngestorMetadata(pluginName)
    : getSyncMetadata(pluginName);
  
  return metadata?.optional ?? true;
}

