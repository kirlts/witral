// Witral - Google Drive OAuth (Desktop App)
// OAuth authentication for Google Drive using Desktop App configuration
// This is the working implementation (not Web Application)

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { promises as fs } from 'fs';
import path from 'path';
import { getConfig } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Get tokens file path
 */
function getTokensPath(): string {
  const config = getConfig();
  return path.join(config.VAULT_PATH, '.google-oauth-tokens.json');
}

/**
 * Get OAuth credentials file path
 */
function getCredentialsPath(): string {
  return process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './data/googledrive/oauth-credentials.json';
}

/**
 * Check if OAuth is configured
 */
export async function isOAuthConfigured(): Promise<boolean> {
  try {
    const credentialsPath = getCredentialsPath();
    await fs.access(credentialsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if OAuth tokens are saved
 */
export async function hasOAuthTokens(): Promise<boolean> {
  try {
    const tokensPath = getTokensPath();
    await fs.access(tokensPath);
    const content = await fs.readFile(tokensPath, 'utf-8');
    const tokens = JSON.parse(content);
    return !!tokens.refresh_token;
  } catch {
    return false;
  }
}

/**
 * Load OAuth credentials from file
 */
async function loadOAuthCredentials(): Promise<OAuthConfig> {
  const credentialsPath = getCredentialsPath();
  
  try {
    const content = await fs.readFile(credentialsPath, 'utf-8');
    const credentials = JSON.parse(content);
    
    // Support both Web Application and Desktop App formats
    // Web Application format: { web: { client_id, client_secret } }
    // Desktop App format: { installed: { client_id, client_secret } }
    const config = credentials.web || credentials.installed;
    
    if (!config) {
      throw new Error('Invalid credentials format. Download JSON from Google Cloud Console as "Web application" or "Desktop app".');
    }
    
    return {
      clientId: config.client_id,
      clientSecret: config.client_secret,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`OAuth credentials file not found: ${credentialsPath}`);
    }
    throw error;
  }
}

/**
 * Create OAuth2 client for Desktop App flow
 * @param port - Local port for OAuth callback
 * @param callbackPath - Optional path for callback (for web dashboard)
 */
async function createOAuth2Client(port: number = 3000, callbackPath: string = ''): Promise<any> {
  const config = await loadOAuthCredentials();
  
  // Desktop App flow: always use localhost with specified port
  const redirectUri = `http://localhost:${port}${callbackPath}`;
  
  // Use google.auth.OAuth2 which is the proper way to create OAuth2Client for googleapis
  // This ensures compatibility with googleapis library
  // google.auth.OAuth2 is actually OAuth2Client from google-auth-library, just accessed through googleapis
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri
  );
}

/**
 * Generate authorization URL for Desktop App flow
 * @param port - Local port for OAuth callback (default 3000)
 * @param callbackPath - Optional path for callback (for web dashboard)
 */
export async function getAuthorizationUrl(port: number = 3000, callbackPath: string = ''): Promise<string> {
  const oauth2Client = await createOAuth2Client(port, callbackPath);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh_token
  });
  
  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from OAuth callback
 * @param port - Local port used for OAuth callback (must match getAuthorizationUrl)
 * @param callbackPath - Optional path for callback (must match getAuthorizationUrl)
 */
export async function exchangeCodeForTokens(code: string, port: number = 3000, callbackPath: string = ''): Promise<OAuthTokens> {
  const oauth2Client = await createOAuth2Client(port, callbackPath);
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh_token received. Try revoking access at https://myaccount.google.com/permissions and re-authorize.');
    }
    
    // Save tokens
    const tokensPath = getTokensPath();
    await fs.mkdir(path.dirname(tokensPath), { recursive: true });
    await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
    
    logger.debug('✅ OAuth tokens saved successfully');
    
    return tokens as OAuthTokens;
  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error exchanging code for tokens');
    throw new Error(`Error getting tokens: ${error.message}`);
  }
}

/**
 * Load saved tokens
 */
async function loadTokens(): Promise<OAuthTokens | null> {
  try {
    const tokensPath = getTokensPath();
    const content = await fs.readFile(tokensPath, 'utf-8');
    return JSON.parse(content) as OAuthTokens;
  } catch {
    return null;
  }
}

/**
 * Save updated tokens
 */
async function saveTokens(tokens: OAuthTokens): Promise<void> {
  const tokensPath = getTokensPath();
  await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
}

/**
 * Get authenticated OAuth2 client
 */
export async function getAuthenticatedClient(): Promise<any> {
  const tokens = await loadTokens();
  
  if (!tokens) {
    throw new Error('No OAuth tokens saved. Authorize first.');
  }
  
  const oauth2Client = await createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  
  // Configure auto-refresh of tokens
  oauth2Client.on('tokens', async (newTokens: any) => {
    const updatedTokens = { 
      ...tokens, 
      ...newTokens,
      // Ensure required fields have values
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
    } as OAuthTokens;
    await saveTokens(updatedTokens);
    logger.debug('🔄 OAuth tokens updated');
  });
  
  return oauth2Client;
}

/**
 * Revoke tokens (logout)
 */
export async function revokeTokens(): Promise<void> {
  try {
    const tokens = await loadTokens();
    
    if (tokens?.access_token) {
      const oauth2Client = await createOAuth2Client();
      await oauth2Client.revokeToken(tokens.access_token);
    }
    
    // Delete tokens file
    const tokensPath = getTokensPath();
    await fs.unlink(tokensPath);
    
    logger.debug('✅ OAuth session closed');
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Error revoking tokens');
    
    // Try to delete file anyway
    try {
      const tokensPath = getTokensPath();
      await fs.unlink(tokensPath);
    } catch {}
  }
}

/**
 * Get authenticated user information
 */
export async function getAuthenticatedUserInfo(): Promise<{ email: string; name: string } | null> {
  try {
    const auth = await getAuthenticatedClient();
    // auth is already compatible with googleapis (created via google.auth.OAuth2)
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const response = await oauth2.userinfo.get();
    
    return {
      email: response.data.email || 'unknown',
      name: response.data.name || response.data.email || 'User',
    };
  } catch (error) {
    return null;
  }
}

