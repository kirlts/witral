// Witral - Configuration
// Platform-agnostic configuration management
import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync } from 'fs';

// Load environment variables
// Priority: 1) ./data/.env (persisted in volume), 2) ./.env (fallback for local dev)
config({ path: './data/.env' }); // Primary location (persists in Docker volume)
config(); // Fallback to ./.env if ./data/.env doesn't exist

const configSchema = z.object({
  // Ingestor (platform-agnostic)
  INGESTOR_SESSION_PATH: z.string().default('./data/session'),
  INGESTOR_ALLOWED_GROUPS: z.string().default('').transform((val) => 
    val ? val.split(',').map(g => g.trim()).filter(Boolean) : []
  ),
  INGESTOR_QR_TIMEOUT: z.coerce.number().default(60000),
  INGESTOR_RECONNECT_INTERVAL: z.coerce.number().default(5000),
  INGESTOR_TYPE: z.string().default(''),
  
  // Vault
  VAULT_PATH: z.string().default('./vault'),
  VAULT_DATE_FORMAT: z.string().default('yyyy-MM-dd'),
  VAULT_ENABLE_FRONTMATTER: z.coerce.boolean().default(true),
  
  // Cloud Sync
  SYNC_TYPE: z.enum(['local', 'googledrive']).default('local'),
  
  // Google Drive OAuth (for sync plugin)
  GOOGLE_OAUTH_CREDENTIALS_PATH: z.string().optional(),
  OAUTH_REDIRECT_HOST: z.string().optional(), // For server deployments (e.g., 'example.com')
  OAUTH_REDIRECT_PROTOCOL: z.string().optional().default('http'), // 'http' or 'https'
  
  // Feedback
  FEEDBACK_CONFIRMATIONS: z.coerce.boolean().default(true),
  FEEDBACK_ERRORS: z.coerce.boolean().default(true),
  FEEDBACK_RATE_LIMIT: z.coerce.number().default(1000),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'), // pretty by default for better QR visibility
  
  // Memory
  NODE_MAX_OLD_SPACE: z.coerce.number().default(1024),
  
  // Timezone
  TZ: z.string().default('UTC'),
  
  // Web Dashboard
  WEB_ENABLED: z.coerce.boolean().default(true),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_HOST: z.string().default('0.0.0.0'),
  
  // Storage (always local - cloud sync handled by SYNC_TYPE)
  // STORAGE_TYPE removed - storage is always local filesystem

  
  // Tag File Modes
  TAG_FILE_MODE: z.enum(['append', 'new-file']).default('new-file'), // new-file: create new file per message (default for Obsidian compatibility), append: add to same file
  TAG_DYNAMIC_TITLES: z.coerce.boolean().default(true), // Enable dynamic title extraction from messages (format: tag+separator+title+space+content)
});

export type Config = z.infer<typeof configSchema>;

let appConfig: Config | null = null;

export function getConfig(): Config {
  if (!appConfig) {
    appConfig = configSchema.parse(process.env);
  }
  return appConfig;
}

/**
 * Get .env file path (prioritizes ./data/.env for Docker volume persistence)
 * Always returns ./data/.env for Docker environments, .env only as fallback for local dev
 */
export function getEnvPath(): string {
  // Always prefer ./data/.env when running in Docker (inside container)
  // This ensures persistence across container restarts
  // Only use .env for local development outside Docker
  const isDocker = process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production' || 
                   existsSync('/.dockerenv') || 
                   existsSync('./data');
  
  if (isDocker || existsSync('./data')) {
    return './data/.env';
  }
  return '.env'; // Fallback for local development outside Docker
}

/**
 * Clear config cache (useful when .env is updated)
 */
export function _clearCache(): void {
  appConfig = null;
}

