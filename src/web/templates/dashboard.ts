// Witral - Dashboard HTML Template

import { WebServerContext } from '../index.js';
import { logger } from '../../utils/logger.js';

// Helper function to generate connection status HTML
export function getConnectionStatusHTML(state: string, isConnected: boolean): string {
  const statusIcon = isConnected ? '✅' : '❌';
  const statusText = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Disconnected';
  return `<div id="connection-status" class="flex items-center gap-2">
          <span class="text-2xl">${statusIcon}</span>
          <span class="text-lg font-medium">${statusText}</span>
        </div>`;
}

// Helper function to generate connection buttons HTML
export function getConnectionButtonsHTML(state: string, isConnected: boolean): string {
  const connectDisabled = isConnected ? 'disabled' : '';
  const disconnectDisabled = !isConnected ? 'disabled' : '';
  const qrDisabled = isConnected ? 'disabled' : '';
  
  return `<div class="flex gap-2">
          <button 
            hx-post="/web/api/connect"
            hx-target="#connection-status-container"
            hx-swap="innerHTML"
            hx-trigger="click"
            hx-on::after-request="htmx.trigger('body', 'connection-changed')"
            class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            ${connectDisabled}
          >
            Connect
          </button>
          <button 
            hx-post="/web/api/disconnect"
            hx-target="#connection-status-container"
            hx-swap="innerHTML"
            hx-trigger="click"
            hx-on::after-request="htmx.trigger('body', 'connection-changed')"
            class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            ${disconnectDisabled}
          >
            Disconnect
          </button>
          <button 
            hx-post="/web/api/qr/generate"
            hx-target="#qr-container"
            hx-swap="innerHTML"
            class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            ${qrDisabled}
          >
            Generate QR
          </button>
        </div>`;
}

// Helper function to escape HTML (server-side)
function escapeHtml(text: string): string {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Helper function to generate storage status HTML
export function getStorageStatusHTML(syncStatus: any, config: any): string {
  if (syncStatus.isConnected && syncStatus.syncType !== 'local') {
    const authMethodText = syncStatus.authMethod === 'oauth' ? 'OAuth (your account)' : 'Service Account';
    const userEmailHtml = syncStatus.userEmail ? `<p class="text-sm text-gray-500">User: ${escapeHtml(syncStatus.userEmail)}</p>` : '';
    return `<div class="flex items-center gap-2"><span class="text-2xl">✅</span><div><p class="text-green-600 font-medium">Cloud sync connected</p><p class="text-sm text-gray-500">Plugin: ${escapeHtml(syncStatus.syncType)} | Method: ${escapeHtml(authMethodText)}</p>${userEmailHtml}</div></div>`;
  } else {
    return `<div class="flex items-center gap-2"><span class="text-2xl">💾</span><div><p class="text-gray-600 font-medium">Local storage only</p><p class="text-sm text-gray-500">Plugin: ${escapeHtml(syncStatus.syncType || 'local')} | Cloud sync not configured</p></div></div>`;
  }
}

// Helper function to generate storage actions HTML
export function getStorageActionsHTML(syncStatus: any, config: any): string {
  if (syncStatus.isConnected && syncStatus.syncType !== 'local') {
    if (syncStatus.authMethod === 'oauth') {
      return `<button onclick="disconnectDrive()" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Disconnect Cloud Sync</button>`;
    }
    return '';
  } else {
    if (syncStatus.syncType === 'googledrive') {
      return `<button onclick="startOAuthFlow()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">🔗 Connect Cloud Sync</button>`;
    } else if (syncStatus.syncType === 'local') {
      return `<button onclick="showSyncPluginSelector()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">☁️ Enable Cloud Sync</button>`;
    }
    return '';
  }
}

export async function getDashboardHTML(context: WebServerContext): Promise<string> {
  const { ingestor, groupManager, tagManager } = context;
  const state = ingestor.getConnectionState();
  const isConnected = ingestor.isConnected();
  // Log initial state for debugging
  logger.debug({ state, isConnected }, '[Dashboard] Initial connection state when rendering HTML');
  const groups = groupManager.getAllGroups();
  const tags = tagManager.getAllTags();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Witral Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <style>
    .log-entry {
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
    }
    #qr-display {
      font-family: 'Courier New', monospace;
      white-space: pre;
      background: #000;
      color: #0f0;
      padding: 1rem;
      border-radius: 0.5rem;
    }
    /* Toast notification styles */
    #toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      background: white;
      border-radius: 8px;
      padding: 16px 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 300px;
      max-width: 500px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideInRight 0.3s ease-out;
      border-left: 4px solid #3b82f6;
    }
    .toast.success {
      border-left-color: #10b981;
    }
    .toast.error {
      border-left-color: #ef4444;
    }
    .toast.info {
      border-left-color: #3b82f6;
    }
    .toast-icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    .toast-content {
      flex: 1;
    }
    .toast-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .toast-message {
      font-size: 0.875rem;
      color: #6b7280;
    }
    .toast-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #9ca3af;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .toast-close:hover {
      color: #374151;
    }
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    .toast.fade-out {
      animation: slideOutRight 0.3s ease-in forwards;
    }
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Toast Notification Container -->
  <div id="toast-container"></div>
  
  <!-- First Run Wizard Modal (Full Screen) -->
  <div id="wizard-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-95 z-50 overflow-y-auto">
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-auto">
        <!-- Wizard Header -->
        <div class="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-xl">
          <h1 class="text-2xl font-bold">🎉 Welcome to Witral!</h1>
          <p class="mt-2 opacity-90">Let's get you set up in just a few steps.</p>
          <!-- Progress Bar -->
          <div class="mt-4 bg-blue-800 rounded-full h-2">
            <div id="wizard-progress" class="bg-white rounded-full h-2 transition-all duration-300" style="width: 20%"></div>
          </div>
          <p id="wizard-step-indicator" class="mt-2 text-sm opacity-75">Step 1 of 5</p>
        </div>
        
        <!-- Wizard Content -->
        <div id="wizard-content" class="p-6">
          <!-- Step content will be loaded here -->
        </div>
        
        <!-- Wizard Footer -->
        <div class="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-between items-center">
          <button id="wizard-back-btn" onclick="wizardBack()" class="text-gray-600 hover:text-gray-800 hidden">
            ← Back
          </button>
          <div class="flex-1"></div>
          <div class="flex gap-2">
            <button id="wizard-skip-btn" onclick="wizardSkip()" class="text-gray-500 hover:text-gray-700 px-4 py-2">
              Skip Setup
            </button>
            <button id="wizard-next-btn" onclick="wizardNext()" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Wizard banner (hidden, kept for backwards compatibility with existing data) -->
  <div id="wizard-banner" class="hidden"></div>

  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-8">📱 Witral Dashboard</h1>

    <!-- Connection Status -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Messaging Service Connection</h2>
      <div id="ingestor-plugins-list" class="mb-4 text-sm text-gray-600">
        <p class="text-gray-500">Loading plugins...</p>
      </div>
      <div class="flex items-center gap-4">
        <div 
          id="connection-status-container"
          hx-get="/web/api/status/html"
          hx-trigger="load, every 5s, connection-changed from:body"
          hx-swap="innerHTML"
          hx-on::after-swap="console.log('[Dashboard] HTMX updated connection status from server - this should not overwrite SSE updates')"
        >
        ${getConnectionStatusHTML(state, isConnected)}
        </div>
        <div 
          id="connection-buttons"
          hx-get="/web/api/status/buttons"
          hx-trigger="load, every 2s, connection-changed from:body"
          hx-swap="innerHTML"
        >
          ${getConnectionButtonsHTML(state, isConnected)}
        </div>
      </div>
    </div>

    <!-- QR Code Display -->
    <div id="qr-container" class="bg-white rounded-lg shadow p-6 mb-6 ${isConnected ? 'hidden' : ''}">
      <h2 class="text-xl font-semibold mb-4">QR Code</h2>
      <div id="qr-display" class="text-center">
        <p class="text-gray-500">Click "Generate QR" to show the code</p>
      </div>
    </div>

    <!-- Real-time Logs -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Real-time Logs</h2>
      <div id="logs-container" class="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto">
        <div class="log-entry">Connecting to log stream...</div>
      </div>
    </div>

    <!-- Cloud Sync -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">☁️ Cloud Sync</h2>
      <div id="sync-plugins-list" class="mb-4 text-sm text-gray-600">
        <p class="text-gray-500">Loading plugins...</p>
      </div>
      <div 
        id="storage-status" 
        class="mb-4"
        hx-get="/web/api/storage/status/html"
        hx-trigger="load, every 5s, storage-changed from:body"
        hx-swap="innerHTML"
      >
        <p class="text-gray-500">Checking status...</p>
      </div>
      <div id="oauth-flow" class="hidden">
        <div id="oauth-url-container" class="mb-4 hidden">
          <p class="mb-2 font-medium">Step 1: Open this link in your browser</p>
          <div class="flex gap-2 mb-4">
            <input type="text" id="oauth-url" readonly class="flex-1 border rounded px-3 py-2 bg-gray-50 text-sm" />
            <button onclick="copyOAuthUrl()" class="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">📋 Copy</button>
            <a id="oauth-url-link" href="#" target="_blank" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-center">🔗 Open</a>
          </div>
          <p class="mb-2 font-medium">Step 2: Paste the code that Google gives you</p>
          <div class="flex gap-2">
            <input type="text" id="oauth-code" placeholder="Paste the code here" class="flex-1 border rounded px-3 py-2" />
            <button onclick="submitOAuthCode()" id="submit-oauth-btn" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">✓ Authorize</button>
          </div>
          <p id="oauth-error" class="text-red-500 mt-2 hidden"></p>
          <p id="oauth-success" class="text-green-500 mt-2 hidden"></p>
        </div>
        <div id="oauth-not-configured" class="hidden p-4 bg-blue-50 border border-blue-200 rounded">
          <p class="font-medium mb-3">📋 Setup OAuth Credentials</p>
          <p class="text-sm mb-3">First, get your OAuth credentials from Google:</p>
          <ol class="text-sm list-decimal list-inside space-y-1 mb-4">
            <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-blue-600 hover:underline font-medium">Google Cloud Console → Credentials</a></li>
            <li>Click "Create Credentials" → "OAuth client ID"</li>
            <li>Select <strong>Desktop app</strong></li>
            <li>Click "Create" and copy the credentials</li>
          </ol>
          <div class="border-t border-blue-300 pt-3 mt-3">
            <p class="text-sm font-medium mb-2">Then, enter your credentials (choose one option):</p>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Option 1: Enter Client ID and Secret directly</label>
                <div class="space-y-2">
                  <input type="text" id="oauth-client-id" placeholder="Client ID" class="w-full border rounded px-3 py-2 text-sm" />
                  <input type="text" id="oauth-client-secret" placeholder="Client Secret" class="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div class="text-center text-gray-500 text-sm">or</div>
              <div>
                <label class="block text-sm font-medium mb-1">Option 2: Upload JSON file</label>
                <input type="file" id="oauth-credentials-file" accept=".json" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
              <div class="text-center text-gray-500 text-sm">or</div>
              <div>
                <label class="block text-sm font-medium mb-1">Option 3: Paste JSON content</label>
                <textarea id="oauth-credentials-json" placeholder='Paste your JSON here, e.g. {"web":{"client_id":"...","client_secret":"..."}}' class="w-full border rounded px-3 py-2 text-sm font-mono" rows="4"></textarea>
              </div>
              <button onclick="saveOAuthCredentials()" id="save-credentials-btn" class="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 font-medium">
                💾 Save Credentials & Connect
              </button>
              <p id="credentials-error" class="text-red-500 text-sm hidden"></p>
              <p id="credentials-success" class="text-green-500 text-sm hidden"></p>
            </div>
          </div>
          <p class="text-xs text-gray-600 mt-3">💡 <strong>Note:</strong> Desktop app credentials work on any server without redirect URI configuration.</p>
        </div>
      </div>
      <div 
        id="storage-actions" 
        class="flex gap-2 mt-4"
        hx-get="/web/api/storage/actions/html"
        hx-trigger="load, every 5s, storage-changed from:body"
        hx-swap="innerHTML"
      >
        <!-- Buttons will be displayed dynamically -->
      </div>
      <div id="sync-plugin-selector" class="mt-4 hidden">
        <p class="text-sm text-gray-600 mb-2">Change sync plugin:</p>
        <select id="sync-plugin-select" class="border rounded px-3 py-2 text-sm">
          <option value="">Loading...</option>
        </select>
        <button onclick="changeSyncPlugin()" class="ml-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm">
          Change
        </button>
        <p class="text-xs text-gray-500 mt-2">⚠️ Changing sync plugin requires restart</p>
      </div>
    </div>

    <!-- Tag File Modes Settings -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">⚙️ Tag File Modes</h2>
      <div id="tag-modes-status" class="mb-4">
        <p class="text-gray-500">Loading configuration...</p>
      </div>
      <div id="tag-modes-actions" class="flex gap-2 mt-4">
        <!-- Buttons will be shown dynamically -->
      </div>
    </div>

            <!-- Monitored Groups -->
            <div class="bg-white rounded-lg shadow p-6 mb-6">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">Monitored Groups (<span id="groups-count">${groups.length}</span>)</h2>
        <button 
          onclick="document.getElementById('add-group-modal').classList.remove('hidden')"
          class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          + Add Group
        </button>
      </div>
      <div id="groups-list" hx-get="/web/api/groups" hx-trigger="load, every 5s" hx-target="this" hx-swap="innerHTML">
        Loading groups...
      </div>
    </div>

    <!-- Add Group Modal -->
    <div id="add-group-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h3 class="text-xl font-semibold mb-4">Add Group</h3>
        <div id="available-groups-list" class="space-y-2 mb-4">
          <p class="text-gray-500">Loading available groups...</p>
        </div>
        <div class="flex gap-2">
          <button 
            onclick="document.getElementById('add-group-modal').classList.add('hidden')"
            class="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

            <!-- Tags -->
            <div class="bg-white rounded-lg shadow p-6 mb-6">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">Tags (<span id="tags-count">${tags.length}</span>)</h2>
        <button 
          onclick="document.getElementById('add-tag-modal').classList.remove('hidden')"
          class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          + Create Tag
        </button>
      </div>
      <div id="tags-list" hx-get="/web/api/tags" hx-trigger="load, every 5s" hx-target="this" hx-swap="innerHTML">
        Loading tags...
      </div>
    </div>

    <!-- Create Tag Modal -->
    <div id="add-tag-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-semibold mb-4">Create Tag</h3>
        <form 
          id="add-tag-form"
          class="space-y-4"
          onsubmit="createTag(event)"
        >
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input 
              type="text" 
              name="name" 
              required 
              pattern="[A-Za-z0-9_]+"
              class="w-full border rounded px-3 py-2"
              placeholder="e.g.: CODE"
            />
            <p class="text-xs text-gray-500 mt-1">Only letters, numbers, hyphens, and underscores</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Fields</label>
            <div class="space-y-2">
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="AUTOR" class="mr-2" />
                AUTHOR
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="HORA" class="mr-2" />
                TIME
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="FECHA" class="mr-2" />
                DATE
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="CONTENIDO" checked disabled class="mr-2" />
                CONTENT (always enabled)
              </label>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Separator (1-3 characters)</label>
            <input 
              type="text" 
              name="separator" 
              class="w-full border rounded px-3 py-2"
              placeholder=",,"
              value=",,"
              maxlength="3"
            />
            <p class="text-xs text-gray-500 mt-1">Format: TAG<span class="font-mono bg-gray-100 px-1">,,</span>content</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description (optional)</label>
            <input 
              type="text" 
              name="description" 
              class="w-full border rounded px-3 py-2"
              placeholder="Tag description"
            />
          </div>
          <div class="flex gap-2">
            <button 
              type="submit"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Create
            </button>
            <button 
              type="button"
              onclick="document.getElementById('add-tag-modal').classList.add('hidden')"
              class="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Configure Tag Fields Modal -->
    <div id="configure-fields-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-semibold mb-4">Configure Tag</h3>
        <form 
          id="configure-fields-form"
          class="space-y-4"
          onsubmit="updateTag(event)"
        >
          <div>
            <label class="block text-sm font-medium mb-1">Fields</label>
            <div class="space-y-2">
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="AUTOR" class="mr-2" />
                AUTHOR
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="HORA" class="mr-2" />
                TIME
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="FECHA" class="mr-2" />
                DATE
              </label>
              <label class="flex items-center">
                <input type="checkbox" name="enabledFields" value="CONTENIDO" checked disabled class="mr-2" />
                CONTENT (always enabled)
              </label>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Separator (1-3 characters)</label>
            <input 
              type="text" 
              name="separator" 
              id="configure-separator-input"
              class="w-full border rounded px-3 py-2"
              placeholder=",,"
              maxlength="3"
            />
            <p class="text-xs text-gray-500 mt-1">Format: TAG<span class="font-mono bg-gray-100 px-1">separator</span>content</p>
          </div>
          <div class="flex gap-2">
            <button 
              type="submit"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Save
            </button>
            <button 
              type="button"
              onclick="document.getElementById('configure-fields-modal').classList.add('hidden')"
              class="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Ver Markdown -->
    <div id="view-markdown-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="flex justify-between items-center mb-4">
          <h3 id="markdown-modal-title" class="text-xl font-semibold">Tag</h3>
          <div class="flex gap-2">
            <button 
              onclick="copyMarkdown()"
              id="copy-markdown-btn"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
            >
              Copy
            </button>
            <button 
              onclick="document.getElementById('view-markdown-modal').classList.add('hidden')"
              class="bg-gray-300 text-gray-700 px-3 py-2 rounded hover:bg-gray-400 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
        <pre id="markdown-content" class="flex-1 overflow-auto bg-gray-50 p-4 rounded text-sm font-mono whitespace-pre-wrap border"></pre>
      </div>
    </div>

  </div>

  <script>
    // Helper functions for escaping (must be defined first)
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function escapeJs(text) {
      if (!text) return '';
      var str = String(text);
      str = str.replace(/\\\\/g, '\\\\\\\\');
      str = str.replace(/'/g, "\\\\'");
      str = str.replace(/"/g, '\\\\"');
      str = str.replace(/\\n/g, '\\\\n');
      str = str.replace(/\\r/g, '\\\\r');
      str = str.replace(/\\t/g, '\\\\t');
      return str;
    }
    
    // Make functions available globally immediately
    window.escapeHtml = escapeHtml;
    window.escapeJs = escapeJs;
    
    // Toast notification system
    window.showToast = function(message, type = 'info', title = '') {
      const container = document.getElementById('toast-container');
      if (!container) return;
      
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      
      const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
      };
      
      const icon = icons[type] || icons.info;
      const displayTitle = title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info');
      
      toast.innerHTML = '<span class="toast-icon">' + icon + '</span>' +
        '<div class="toast-content">' +
          '<div class="toast-title">' + escapeHtml(displayTitle) + '</div>' +
          '<div class="toast-message">' + escapeHtml(message) + '</div>' +
        '</div>' +
        '<button class="toast-close" onclick="this.parentElement.remove()">×</button>';
      
      container.appendChild(toast);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
          if (toast.parentElement) {
            toast.remove();
          }
        }, 300);
      }, 5000);
    };
    
    // SSE for logs (can start immediately)
    const logsEventSource = new EventSource('/web/api/logs/stream');
    
    // SSE for status (connection and sync) - real-time updates
    const statusEventSource = new EventSource('/web/api/status/stream');
    statusEventSource.addEventListener('connection-status', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Dashboard] Received connection-status SSE event:', data);
        updateConnectionStatusUI(data);
      } catch (error) {
        console.error('[Dashboard] Error parsing connection-status event:', error);
      }
    });
    statusEventSource.addEventListener('open', () => {
      console.log('[Dashboard] Status SSE stream opened');
    });
    statusEventSource.addEventListener('error', (error) => {
      console.error('[Dashboard] Status SSE stream error:', error);
    });
    statusEventSource.addEventListener('sync-status', (event) => {
      try {
        const data = JSON.parse(event.data);
        updateStorageStatusUI(data);
      } catch (error) {
        console.error('Error parsing sync-status event:', error);
      }
    });
    statusEventSource.onerror = (error) => {
      console.error('[Dashboard] SSE status stream error:', error);
      console.log('[Dashboard] StatusEventSource readyState:', statusEventSource.readyState);
      // Fallback to polling if SSE fails
      if (statusEventSource.readyState === EventSource.CLOSED) {
        console.log('[Dashboard] SSE stream closed, attempting to reconnect...');
        // The EventSource will automatically try to reconnect
      } else {
        setTimeout(() => {
          console.log('[Dashboard] Triggering HTMX fallback update');
          htmx.trigger('#connection-status-container', 'load');
          htmx.trigger('#storage-status', 'load');
        }, 1000);
      }
    };
    
    // ==========================================
    // Web Wizard System
    // ==========================================
    let wizardCurrentStep = 1;
    const wizardTotalSteps = 5;
    let wizardData = {
      ingestorType: null,
      groups: [],
      tags: [],
      webEnabled: true
    };

    async function checkWizardStatus() {
      try {
        const res = await fetch('/web/api/wizard/status');
        const data = await res.json();
        if (data.needed) {
          showWizardModal();
        }
      } catch (error) {
        console.error('Error checking wizard status:', error);
      }
    }

    function showWizardModal() {
      const modal = document.getElementById('wizard-modal');
      if (modal) {
        modal.classList.remove('hidden');
        wizardCurrentStep = 1;
        renderWizardStep();
      }
    }

    function hideWizardModal() {
      const modal = document.getElementById('wizard-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    function updateWizardProgress() {
      const progress = (wizardCurrentStep / wizardTotalSteps) * 100;
      const progressBar = document.getElementById('wizard-progress');
      const indicator = document.getElementById('wizard-step-indicator');
      if (progressBar) progressBar.style.width = progress + '%';
      if (indicator) indicator.textContent = 'Step ' + wizardCurrentStep + ' of ' + wizardTotalSteps;
      
      const backBtn = document.getElementById('wizard-back-btn');
      if (backBtn) {
        backBtn.classList.toggle('hidden', wizardCurrentStep === 1);
      }
      
      const nextBtn = document.getElementById('wizard-next-btn');
      if (nextBtn) {
        nextBtn.textContent = wizardCurrentStep === wizardTotalSteps ? 'Finish ✓' : 'Next →';
      }
    }

    function renderWizardStep() {
      const content = document.getElementById('wizard-content');
      if (!content) return;
      
      updateWizardProgress();
      
      switch (wizardCurrentStep) {
        case 1:
          renderWizardStep1(content);
          break;
        case 2:
          renderWizardStep2(content);
          break;
        case 3:
          renderWizardStep3(content);
          break;
        case 4:
          renderWizardStep4(content);
          break;
        case 5:
          renderWizardStep5(content);
          break;
      }
    }

    // Step 1: Select Messaging Plugin
    async function renderWizardStep1(content) {
      content.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Loading plugins...</p></div>';
      
      try {
        const res = await fetch('/web/api/plugins/ingestors');
        const data = await res.json();
        
        let html = '<h2 class="text-xl font-semibold mb-4">🔌 Select Messaging Service</h2>';
        html += '<p class="text-gray-600 mb-6">Choose which messaging platform you want to connect to Witral.</p>';
        
        if (data.plugins && data.plugins.length > 0) {
          html += '<div class="space-y-3">';
          data.plugins.forEach(plugin => {
            const checked = wizardData.ingestorType === plugin.id || (!wizardData.ingestorType && plugin.isConfigured);
            html += '<label class="flex items-center p-4 border rounded-lg hover:bg-gray-50 cursor-pointer ' + (checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200') + '">' +
              '<input type="radio" name="wizard-ingestor" value="' + escapeHtml(plugin.id) + '" ' + (checked ? 'checked' : '') + ' class="mr-4 w-5 h-5 text-blue-600" onchange="wizardData.ingestorType=this.value">' +
              '<div class="flex-1">' +
              '<p class="font-medium">' + escapeHtml(plugin.name) + '</p>' +
              '<p class="text-sm text-gray-500">' + escapeHtml(plugin.description) + '</p>' +
              '</div>' +
              (plugin.isConfigured ? '<span class="text-green-600 text-sm">✓ Configured</span>' : '') +
              '</label>';
          });
          html += '</div>';
        } else {
          html += '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">' +
            '<p class="text-yellow-800">No messaging plugins available.</p>' +
            '<p class="text-sm text-yellow-600 mt-2">Please check your configuration.</p>' +
            '</div>';
        }
        
        content.innerHTML = html;
        
        // Auto-select if configured
        if (data.configured && !wizardData.ingestorType) {
          wizardData.ingestorType = data.configured;
        }
      } catch (error) {
        content.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4">' +
          '<p class="text-red-800">Error loading plugins</p>' +
          '</div>';
      }
    }

    // Step 2: Connect to Messaging Service
    async function renderWizardStep2(content) {
      let html = '<h2 class="text-xl font-semibold mb-4">📱 Connect to ' + escapeHtml(wizardData.ingestorType || 'Messaging Service') + '</h2>';
      html += '<p class="text-gray-600 mb-6">Scan the QR code with your messaging app to connect.</p>';
      
      html += '<div id="wizard-connection-status" class="mb-4">';
      html += '<div class="flex items-center gap-2 text-gray-600"><span>Checking connection...</span></div>';
      html += '</div>';
      
      html += '<div id="wizard-qr-container" class="text-center">';
      html += '<div class="bg-gray-100 rounded-lg p-8 inline-block">';
      html += '<p class="text-gray-500">Click "Generate QR" to connect</p>';
      html += '</div>';
      html += '</div>';
      
      html += '<div class="flex justify-center gap-4 mt-6">';
      html += '<button onclick="wizardGenerateQR()" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Generate QR</button>';
      html += '<button onclick="wizardConnect()" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Try Connect</button>';
      html += '</div>';
      
      html += '<p class="text-sm text-gray-500 mt-4 text-center">💡 If you already have a session saved, click "Try Connect" first.</p>';
      
      content.innerHTML = html;
      
      // Check current connection status
      wizardCheckConnection();
    }

    async function wizardCheckConnection() {
      try {
        const res = await fetch('/web/api/status');
        const data = await res.json();
        
        const statusEl = document.getElementById('wizard-connection-status');
        if (statusEl) {
          if (data.isConnected) {
            statusEl.innerHTML = '<div class="flex items-center gap-2 text-green-600"><span class="text-2xl">✅</span><span class="font-medium">Connected!</span></div>';
          } else {
            statusEl.innerHTML = '<div class="flex items-center gap-2 text-gray-600"><span class="text-2xl">❌</span><span>Not connected</span></div>';
          }
        }
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    }

    async function wizardGenerateQR() {
      const qrContainer = document.getElementById('wizard-qr-container');
      if (qrContainer) {
        qrContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-8 inline-block"><p class="text-gray-500">Generating QR code...</p></div>';
      }
      
      try {
        await fetch('/web/api/qr/generate', { method: 'POST' });
        // QR will be received via SSE and shown below
        if (qrContainer) {
          qrContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-8 inline-block">' +
            '<canvas id="wizard-qr-canvas"></canvas>' +
            '<p class="text-sm text-gray-500 mt-2">Scan with your messaging app</p>' +
            '</div>';
        }
      } catch (error) {
        if (qrContainer) {
          qrContainer.innerHTML = '<div class="bg-red-50 rounded-lg p-4"><p class="text-red-600">Error generating QR</p></div>';
        }
      }
    }

    async function wizardConnect() {
      const statusEl = document.getElementById('wizard-connection-status');
      if (statusEl) {
        statusEl.innerHTML = '<div class="flex items-center gap-2 text-blue-600"><span>Connecting...</span></div>';
      }
      
      try {
        await fetch('/web/api/connect', { method: 'POST' });
        setTimeout(wizardCheckConnection, 2000);
      } catch (error) {
        if (statusEl) {
          statusEl.innerHTML = '<div class="flex items-center gap-2 text-red-600"><span>Connection failed</span></div>';
        }
      }
    }

    // Step 3: Add Groups
    async function renderWizardStep3(content) {
      let html = '<h2 class="text-xl font-semibold mb-4">📋 Add Groups to Monitor</h2>';
      html += '<p class="text-gray-600 mb-6">Select which groups Witral should monitor for tagged messages.</p>';
      
      html += '<div id="wizard-groups-list" class="space-y-2">';
      html += '<p class="text-gray-500">Loading groups...</p>';
      html += '</div>';
      
      content.innerHTML = html;
      
      // Load available groups
      try {
        const res = await fetch('/web/api/groups/available');
        const data = await res.json();
        
        const listEl = document.getElementById('wizard-groups-list');
        if (!listEl) return;
        
        if (data.error) {
          listEl.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">' +
            '<p class="text-yellow-800">⚠️ ' + escapeHtml(data.error) + '</p>' +
            '<p class="text-sm text-yellow-600 mt-2">Connect to your messaging service first (Step 2).</p>' +
            '</div>';
          return;
        }
        
        if (!data.groups || data.groups.length === 0) {
          listEl.innerHTML = '<div class="bg-gray-50 border border-gray-200 rounded-lg p-4">' +
            '<p class="text-gray-600">No groups found. You can add groups later from the dashboard.</p>' +
            '</div>';
          return;
        }
        
        let groupsHtml = '<div class="max-h-64 overflow-y-auto space-y-2">';
        data.groups.forEach(group => {
          const isMonitored = group.isMonitored;
          groupsHtml += '<label class="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer ' + (isMonitored ? 'bg-green-50 border-green-200' : 'border-gray-200') + '">' +
            '<input type="checkbox" ' + (isMonitored ? 'checked disabled' : '') + ' data-group-name="' + escapeHtml(group.name) + '" data-group-jid="' + escapeHtml(group.jid || '') + '" class="wizard-group-checkbox mr-3 w-5 h-5">' +
            '<div class="flex-1">' +
            '<p class="font-medium">' + escapeHtml(group.name) + '</p>' +
            (group.participants ? '<p class="text-sm text-gray-500">' + group.participants + ' participants</p>' : '') +
            '</div>' +
            (isMonitored ? '<span class="text-green-600 text-sm">✓ Monitored</span>' : '') +
            '</label>';
        });
        groupsHtml += '</div>';
        groupsHtml += '<p class="text-sm text-gray-500 mt-4">💡 You can add more groups later from the dashboard.</p>';
        
        listEl.innerHTML = groupsHtml;
      } catch (error) {
        const listEl = document.getElementById('wizard-groups-list');
        if (listEl) {
          listEl.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4">' +
            '<p class="text-red-800">Error loading groups</p>' +
            '</div>';
        }
      }
    }

    async function wizardSaveGroups() {
      const checkboxes = document.querySelectorAll('.wizard-group-checkbox:checked:not(:disabled)');
      for (const cb of checkboxes) {
        const name = cb.getAttribute('data-group-name');
        const jid = cb.getAttribute('data-group-jid');
        if (name) {
          try {
            await fetch('/web/api/groups', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, jid })
            });
          } catch (error) {
            console.error('Error adding group:', name, error);
          }
        }
      }
    }

    // Step 4: Create First Tag
    function renderWizardStep4(content) {
      let html = '<h2 class="text-xl font-semibold mb-4">🏷️ Create Your First Tag</h2>';
      html += '<p class="text-gray-600 mb-6">Tags help you organize messages. Example: <code class="bg-gray-100 px-2 py-1 rounded">,,idea My great idea!</code></p>';
      
      html += '<div class="space-y-4">';
      html += '<div>';
      html += '<label class="block text-sm font-medium mb-1">Tag Name</label>';
      html += '<input type="text" id="wizard-tag-name" placeholder="idea" class="w-full border rounded-lg px-4 py-2" pattern="[A-Za-z0-9_]+">';
      html += '<p class="text-xs text-gray-500 mt-1">Letters, numbers, and underscores only</p>';
      html += '</div>';
      
      html += '<div>';
      html += '<label class="block text-sm font-medium mb-1">Separator</label>';
      html += '<input type="text" id="wizard-tag-separator" value=",," maxlength="3" class="w-full border rounded-lg px-4 py-2">';
      html += '<p class="text-xs text-gray-500 mt-1">1-3 characters that trigger the tag (default: ,,)</p>';
      html += '</div>';
      
      html += '<div>';
      html += '<label class="block text-sm font-medium mb-1">Description (optional)</label>';
      html += '<input type="text" id="wizard-tag-description" placeholder="Quick ideas and thoughts" class="w-full border rounded-lg px-4 py-2">';
      html += '</div>';
      html += '</div>';
      
      html += '<p class="text-sm text-gray-500 mt-6">💡 You can skip this step and create tags later from the dashboard.</p>';
      
      content.innerHTML = html;
    }

    async function wizardSaveTag() {
      const nameEl = document.getElementById('wizard-tag-name');
      const separatorEl = document.getElementById('wizard-tag-separator');
      const descEl = document.getElementById('wizard-tag-description');
      
      const name = nameEl ? nameEl.value.trim() : '';
      const separator = separatorEl ? separatorEl.value.trim() || ',,' : ',,';
      const description = descEl ? descEl.value.trim() : '';
      
      if (!name) return; // Skip if no name
      
      try {
        await fetch('/web/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            separator,
            description: description || undefined,
            enabledFields: ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO']
          })
        });
      } catch (error) {
        console.error('Error creating tag:', error);
      }
    }

    // Step 5: Complete
    function renderWizardStep5(content) {
      let html = '<div class="text-center py-8">';
      html += '<div class="text-6xl mb-4">🎉</div>';
      html += '<h2 class="text-2xl font-bold mb-4">Setup Complete!</h2>';
      html += '<p class="text-gray-600 mb-6">Witral is ready to capture and organize your messages.</p>';
      
      html += '<div class="bg-gray-50 rounded-lg p-6 text-left max-w-md mx-auto">';
      html += '<h3 class="font-semibold mb-3">What\'s Next?</h3>';
      html += '<ul class="space-y-2 text-sm text-gray-600">';
      html += '<li>✅ Send tagged messages in your monitored groups</li>';
      html += '<li>✅ View and manage your data from this dashboard</li>';
      html += '<li>✅ Configure cloud sync if needed</li>';
      html += '</ul>';
      html += '</div>';
      
      html += '<p class="text-sm text-gray-500 mt-6">Dashboard: <a href="/web" class="text-blue-600 hover:underline">http://localhost:3000/web</a></p>';
      html += '</div>';
      
      content.innerHTML = html;
      
      // Update button text
      const nextBtn = document.getElementById('wizard-next-btn');
      if (nextBtn) nextBtn.textContent = 'Start Using Witral';
      
      const skipBtn = document.getElementById('wizard-skip-btn');
      if (skipBtn) skipBtn.classList.add('hidden');
    }

    async function wizardNext() {
      // Save current step data
      if (wizardCurrentStep === 1 && wizardData.ingestorType) {
        await fetch('/web/api/wizard/set-ingestor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: wizardData.ingestorType })
        });
      } else if (wizardCurrentStep === 3) {
        await wizardSaveGroups();
      } else if (wizardCurrentStep === 4) {
        await wizardSaveTag();
      }
      
      if (wizardCurrentStep < wizardTotalSteps) {
        wizardCurrentStep++;
        renderWizardStep();
      } else {
        // Complete wizard
        await fetch('/web/api/wizard/complete', { method: 'POST' });
        hideWizardModal();
        // Refresh dashboard
        location.reload();
      }
    }

    function wizardBack() {
      if (wizardCurrentStep > 1) {
        wizardCurrentStep--;
        renderWizardStep();
      }
    }

    async function wizardSkip() {
      if (confirm('Are you sure you want to skip the setup wizard?\\n\\nYou can complete the setup manually from the dashboard.')) {
        await fetch('/web/api/wizard/complete', { method: 'POST' });
        hideWizardModal();
      }
    }

    // Legacy functions for backwards compatibility
    function startWizard() {
      showWizardModal();
    }

    async function dismissWizard() {
      await fetch('/web/api/wizard/complete', { method: 'POST' });
      hideWizardModal();
    }

    // View tag markdown - defined globally before initDashboard so it's available when HTML is generated
    window.viewTagMarkdown = function(name) {
      fetch('/web/api/tags/' + encodeURIComponent(name) + '/markdown')
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => { throw new Error(text); });
          }
          return res.text();
        })
        .then(content => {
          const modal = document.getElementById('view-markdown-modal');
          const contentEl = document.getElementById('markdown-content');
          const titleEl = document.getElementById('markdown-modal-title');
          if (modal && contentEl && titleEl) {
            titleEl.textContent = 'Tag: ' + escapeHtml(name || '');
            contentEl.textContent = content;
            modal.classList.remove('hidden');
          }
        })
        .catch(err => {
          alert('Error: ' + err.message);
        });
    };

    // Define loader functions first (before initDashboard so they're available)
    function loadIngestorPluginsList() {
      const listEl = document.getElementById('ingestor-plugins-list');
      if (!listEl) return;
      
      // Set timeout to ensure we don't stay in loading state forever
      const timeoutId = setTimeout(() => {
        if (listEl.textContent && listEl.textContent.includes('Loading plugins...')) {
          console.warn('[Witral Dashboard] Timeout loading ingestor plugins, showing fallback');
          listEl.innerHTML = '<p class="text-yellow-600 text-xs">⚠️ Unable to load plugins. Please refresh the page.</p>';
        }
      }, 10000); // 10 second timeout
      
      fetch('/web/api/plugins/ingestors')
        .then(res => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          clearTimeout(timeoutId);
          if (listEl && data && data.plugins) {
            if (data.plugins.length === 0) {
              listEl.innerHTML = '<p class="text-gray-500">No messaging service plugins available</p>';
            } else {
              const pluginsHtml = data.plugins.map((plugin) => {
                const badge = plugin.isConfigured ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Configured</span>' : '';
                return '<div class="flex items-center justify-between py-1">' +
                  '<span><strong>' + escapeHtml(plugin.name) + '</strong> - ' + escapeHtml(plugin.description) + '</span>' +
                  badge +
                  '</div>';
              }).join('');
              listEl.innerHTML = '<div class="space-y-1">' +
                '<p class="text-xs text-gray-500 mb-2">Available plugins:</p>' +
                pluginsHtml +
                '</div>';
            }
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (listEl) {
            listEl.innerHTML = '<p class="text-red-500 text-xs">Error loading plugins: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
          }
        });
    }
    
    function loadSyncPluginsList() {
      const listEl = document.getElementById('sync-plugins-list');
      if (!listEl) return;
      
      // Set timeout to ensure we don't stay in loading state forever
      const timeoutId = setTimeout(() => {
        if (listEl.textContent && listEl.textContent.includes('Loading plugins...')) {
          console.warn('[Witral Dashboard] Timeout loading sync plugins, showing fallback');
          listEl.innerHTML = '<p class="text-yellow-600 text-xs">⚠️ Unable to load plugins. Please refresh the page.</p>';
        }
      }, 10000); // 10 second timeout
      
      fetch('/web/api/plugins/sync')
        .then(res => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          clearTimeout(timeoutId);
          if (listEl && data && data.plugins) {
            if (data.plugins.length === 0) {
              listEl.innerHTML = '<p class="text-gray-500">No sync plugins available</p>';
            } else {
              const pluginsHtml = data.plugins.map((plugin) => {
                const badge = plugin.isConfigured ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Configured</span>' : '';
                return '<div class="flex items-center justify-between py-1">' +
                  '<span><strong>' + escapeHtml(plugin.name) + '</strong> - ' + escapeHtml(plugin.description) + '</span>' +
                  badge +
                  '</div>';
              }).join('');
              listEl.innerHTML = '<div class="space-y-1">' +
                '<p class="text-xs text-gray-500 mb-2">Available plugins:</p>' +
                pluginsHtml +
                '</div>';
            }
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (listEl) {
            listEl.innerHTML = '<p class="text-red-500 text-xs">Error loading plugins: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
          }
        });
    }
    
    function loadTagModesStatus() {
      const statusEl = document.getElementById('tag-modes-status');
      if (!statusEl) return;
      
      // Set timeout to ensure we don't stay in loading state forever
      const timeoutId = setTimeout(() => {
        if (statusEl.textContent && statusEl.textContent.includes('Loading configuration...')) {
          console.warn('[Witral Dashboard] Timeout loading tag modes, showing fallback');
          statusEl.innerHTML = '<div class="space-y-2">' +
            '<div class="flex items-center gap-2"><span class="font-medium">File Mode:</span><span>New File (default)</span></div>' +
            '<div class="flex items-center gap-2"><span class="font-medium">Dynamic Titles:</span><span>✅ Enabled (default)</span></div>' +
            '<p class="text-yellow-600 text-xs">⚠️ Using default values. Please refresh the page.</p>' +
            '</div>';
        }
      }, 10000); // 10 second timeout
      
      fetch('/web/api/tag-modes/status')
        .then(res => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          clearTimeout(timeoutId);
          const actionsEl = document.getElementById('tag-modes-actions');
          
          if (statusEl && data) {
            const fileModeText = data.fileMode === 'new-file' 
              ? 'New File (each message creates new file)' 
              : 'Append (all messages to same file)';
            const dynamicTitlesText = data.dynamicTitles ? '✅ Enabled' : '❌ Disabled';
            
            statusEl.innerHTML = '<div class="space-y-2">' +
              '<div class="flex items-center gap-2"><span class="font-medium">File Mode:</span><span>' + escapeHtml(fileModeText) + '</span></div>' +
              '<div class="flex items-center gap-2"><span class="font-medium">Dynamic Titles:</span><span>' + dynamicTitlesText + '</span></div>' +
              '</div>';
            
            if (actionsEl) {
              actionsEl.innerHTML = '<button onclick="toggleTagFileMode()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Change File Mode</button>' +
                '<button onclick="toggleDynamicTitles()" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">Toggle Dynamic Titles</button>';
            }
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (statusEl) {
            statusEl.innerHTML = '<p class="text-red-500">❌ Error: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
          }
        });
    }

    // Load Cloud Sync status
    function loadStorageStatus() {
      const statusEl = document.getElementById('storage-status');
      if (!statusEl) return;
      
      // Set timeout to ensure we don't stay in loading state forever
      const timeoutId = setTimeout(() => {
        if (statusEl.textContent && statusEl.textContent.includes('Checking status...')) {
          console.warn('[Witral Dashboard] Timeout loading storage status, showing fallback');
          statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">💾</span><div><p class="text-gray-600 font-medium">Local storage only</p><p class="text-sm text-gray-500">Plugin: local | Status unavailable</p><p class="text-yellow-600 text-xs">⚠️ Please refresh the page.</p></div></div>';
        }
      }, 10000); // 10 second timeout
      
      fetch('/web/api/storage/status')
        .then(res => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          clearTimeout(timeoutId);
          const actionsEl = document.getElementById('storage-actions');
          const oauthFlow = document.getElementById('oauth-flow');
          
          if (statusEl && data) {
            if (data.isConnected && data.syncType !== 'local') {
              // Cloud sync is connected
              const authMethodText = data.authMethod === 'oauth' ? 'OAuth (your account)' : 'Service Account';
              const userEmailHtml = data.userEmail ? '<p class="text-sm text-gray-500">User: ' + escapeHtml(data.userEmail) + '</p>' : '';
              const locationInfo = data.syncType === 'googledrive' && data.vaultFolderLink
                ? '<p class="text-sm text-blue-600 mt-1">📁 Files are synced to: <a href="' + escapeHtml(data.vaultFolderLink) + '" target="_blank" class="underline font-semibold">Google Drive > Vault</a> folder</p>'
                : data.syncType === 'googledrive'
                ? '<p class="text-sm text-blue-600 mt-1">📁 Files are synced to: <strong>Google Drive > Vault</strong> folder</p>'
                : '';
              statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">✅</span><div><p class="text-green-600 font-medium">Cloud sync connected</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType) + ' | Method: ' + escapeHtml(authMethodText) + '</p>' + userEmailHtml + locationInfo + '</div></div>';
              if (actionsEl) {
                actionsEl.innerHTML = data.authMethod === 'oauth' 
                  ? '<button onclick="disconnectDrive()" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Disconnect Cloud Sync</button>'
                  : '';
              }
              if (oauthFlow) oauthFlow.classList.add('hidden');
            } else {
              // Cloud sync is not connected (local only)
              statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">💾</span><div><p class="text-gray-600 font-medium">Local storage only</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType || 'local') + ' | Cloud sync not configured</p></div></div>';
              if (actionsEl) {
                if (data.syncType === 'googledrive') {
                  actionsEl.innerHTML = '<button onclick="startOAuthFlow()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">🔗 Connect Cloud Sync</button>';
                } else {
                  actionsEl.innerHTML = '';
                }
              }
              if (oauthFlow && data.syncType !== 'googledrive') {
                oauthFlow.classList.add('hidden');
              }
            }
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (statusEl) {
            statusEl.innerHTML = '<p class="text-red-500">❌ Error loading status: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
          }
        });
    }

    // Helper function to update connection status UI from SSE data
    function updateConnectionStatusUI(data) {
      console.log('[Dashboard] updateConnectionStatusUI called with:', data);
      const statusEl = document.getElementById('connection-status-container');
      if (statusEl) {
        const statusIcon = data.isConnected ? '✅' : '❌';
        const statusText = data.state === 'connected' ? 'Connected' : data.state === 'connecting' ? 'Connecting...' : 'Disconnected';
        console.log('[Dashboard] Updating status UI:', { statusIcon, statusText, isConnected: data.isConnected, state: data.state });
        
        // Update status display - prevent HTMX from overwriting this
        statusEl.innerHTML = '<div id="connection-status" class="flex items-center gap-2"><span class="text-2xl">' + statusIcon + '</span><span class="text-lg font-medium">' + statusText + '</span></div>';
        
        // Update buttons
        const connectBtn = document.querySelector('#connection-buttons button[hx-post="/web/api/connect"]');
        const disconnectBtn = document.querySelector('#connection-buttons button[hx-post="/web/api/disconnect"]');
        const qrBtn = document.querySelector('#connection-buttons button[hx-post="/web/api/qr/generate"]');
        if (connectBtn) {
          connectBtn.disabled = data.isConnected;
          console.log('[Dashboard] Connect button disabled:', data.isConnected);
        }
        if (disconnectBtn) {
          disconnectBtn.disabled = !data.isConnected;
          console.log('[Dashboard] Disconnect button disabled:', !data.isConnected);
        }
        if (qrBtn) {
          qrBtn.disabled = data.isConnected;
          console.log('[Dashboard] QR button disabled:', data.isConnected);
        }
        
        // Trigger HTMX update for buttons (but not for status, to avoid overwriting SSE updates)
        htmx.trigger('#connection-buttons', 'connection-changed');
        console.log('[Dashboard] Status UI updated successfully');
      } else {
        console.warn('[Dashboard] connection-status-container element not found');
      }
    }

    // Helper function to update storage status UI from SSE data
    function updateStorageStatusUI(data) {
      const statusEl = document.getElementById('storage-status');
      const actionsEl = document.getElementById('storage-actions');
      const oauthFlow = document.getElementById('oauth-flow');
      const syncSelector = document.getElementById('sync-plugin-selector');
      
      if (statusEl) {
        if (data.isConnected && data.syncType !== 'local') {
          // Cloud sync is connected
          const authMethodText = data.authMethod === 'oauth' ? 'OAuth (your account)' : 'Service Account';
          const userEmailHtml = data.userEmail ? '<p class="text-sm text-gray-500">User: ' + escapeHtml(data.userEmail) + '</p>' : '';
          const locationInfo = data.syncType === 'googledrive' && data.vaultFolderLink
            ? '<p class="text-sm text-blue-600 mt-1">📁 Files are synced to: <a href="' + escapeHtml(data.vaultFolderLink) + '" target="_blank" class="underline font-semibold">Google Drive > Vault</a> folder</p>'
            : data.syncType === 'googledrive'
            ? '<p class="text-sm text-blue-600 mt-1">📁 Files are synced to: <strong>Google Drive > Vault</strong> folder</p>'
            : '';
          statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">✅</span><div><p class="text-green-600 font-medium">Cloud sync connected</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType) + ' | Method: ' + escapeHtml(authMethodText) + '</p>' + userEmailHtml + locationInfo + '</div></div>';
          if (actionsEl) {
            actionsEl.innerHTML = data.authMethod === 'oauth' 
              ? '<button onclick="disconnectDrive()" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Disconnect Cloud Sync</button>'
              : '';
          }
          if (oauthFlow) oauthFlow.classList.add('hidden');
          if (syncSelector) syncSelector.classList.add('hidden');
        } else {
          // Cloud sync is not connected (local only)
          statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">💾</span><div><p class="text-gray-600 font-medium">Local storage only</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType || 'local') + ' | Cloud sync not configured</p></div></div>';
          if (actionsEl) {
            // Show option to change to Google Drive if currently local
            if (data.syncType === 'local') {
              actionsEl.innerHTML = '<button onclick="showSyncPluginSelector()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">☁️ Enable Cloud Sync</button>';
            } else if (data.syncType === 'googledrive') {
              actionsEl.innerHTML = '<button onclick="startOAuthFlow()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">🔗 Connect Cloud Sync</button>';
            } else {
              actionsEl.innerHTML = '';
            }
          }
          if (oauthFlow && data.syncType !== 'googledrive') {
            oauthFlow.classList.add('hidden');
          }
          if (syncSelector && data.syncType !== 'local') {
            syncSelector.classList.add('hidden');
          }
        }
      }
    }

    // Dashboard validation system (silent, invisible to users)
    // Ensures dashboard shows real data, not stuck on "Loading..."
    function validateDashboardLoaded() {
      const loadingIndicators = [
        { id: 'ingestor-plugins-list', text: 'Loading plugins...' },
        { id: 'sync-plugins-list', text: 'Loading plugins...' },
        { id: 'storage-status', text: 'Checking status...' },
        { id: 'tag-modes-status', text: 'Loading configuration...' }
      ];
      
      let stuckElements = [];
      loadingIndicators.forEach(indicator => {
        const el = document.getElementById(indicator.id);
        if (el && el.textContent && el.textContent.includes(indicator.text)) {
          stuckElements.push(indicator.id);
        }
      });
      
      if (stuckElements.length > 0) {
        // Silent logging (only visible in browser console for debugging)
        console.warn('[Witral Dashboard Validation] Elements stuck loading:', stuckElements);
        
        // Attempt to reload stuck elements
        stuckElements.forEach(id => {
          if (id === 'ingestor-plugins-list') {
            loadIngestorPluginsList();
          } else if (id === 'sync-plugins-list') {
            loadSyncPluginsList();
          } else if (id === 'storage-status') {
            loadStorageStatus();
          } else if (id === 'tag-modes-status') {
            loadTagModesStatus();
          }
        });
        
        return false;
      }
      return true;
    }
    
    // Validate dashboard state with timeout (runs silently in background)
    function startDashboardValidation() {
      // First validation after 3 seconds (should be loaded by then)
      setTimeout(() => {
        if (!validateDashboardLoaded()) {
          // If still stuck, try again after another 2 seconds
          setTimeout(() => {
            validateDashboardLoaded();
          }, 2000);
        }
      }, 3000);
      
      // Periodic validation every 30 seconds (catches any new stuck states)
      setInterval(() => {
        validateDashboardLoaded();
      }, 30000);
    }

    // Wait for DOM to be ready
    function initDashboard() {
      // Check wizard status on load
      checkWizardStatus();
      
      // Start silent validation system
      startDashboardValidation();
      
      const logsContainer = document.getElementById('logs-container');
      
      if (logsContainer) {
        
        logsEventSource.addEventListener('log', (e) => {
          try {
            const data = JSON.parse(e.data);
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            const logTime = new Date(data.timestamp).toLocaleTimeString();
            logEntry.textContent = '[' + logTime + '] ' + (data.message || '');
            logsContainer.appendChild(logEntry);
            logsContainer.scrollTop = logsContainer.scrollHeight;
          } catch (err) {
            // Silently ignore log parsing errors
          }
        });

        logsEventSource.addEventListener('connected', (e) => {
          try {
            const data = JSON.parse(e.data);
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry text-green-500';
            logEntry.textContent = data.message || '';
            logsContainer.appendChild(logEntry);
            logsContainer.scrollTop = logsContainer.scrollHeight;
          } catch (err) {
            // Silently ignore log parsing errors
          }
        });

        // SSE for group messages
        logsEventSource.addEventListener('message', (e) => {
          try {
            const data = JSON.parse(e.data);
            const msgEntry = document.createElement('div');
            msgEntry.className = 'log-entry text-yellow-300';
            const timeStr = new Date(data.timestamp).toLocaleTimeString();
            const content = data.content || '';
            const contentPreview = content.substring(0, 80) + (content.length > 80 ? '...' : '');
            msgEntry.innerHTML = '<span class="text-gray-500">[' + escapeHtml(timeStr) + ']</span> 📨 <span class="text-blue-300">' + escapeHtml(data.group || '') + '</span> - <span class="text-green-300">' + escapeHtml(data.sender || '') + '</span>: ' + escapeHtml(contentPreview);
            logsContainer.appendChild(msgEntry);
            logsContainer.scrollTop = logsContainer.scrollHeight;
          } catch (err) {
            // Silently ignore log parsing errors
          }
        });
        
        logsEventSource.addEventListener('error', (e) => {
          // Silently ignore SSE errors
        });
        
        logsEventSource.addEventListener('open', (e) => {
          // Connection opened successfully
        });
      }

      // SSE for QR code updates only (connection status is handled by status stream)
      const qrEventSource = new EventSource('/web/api/qr/stream');
      
      qrEventSource.addEventListener('error', (e) => {
        // Silently ignore SSE errors
      });
      
      qrEventSource.addEventListener('open', (e) => {
        // Connection opened successfully
      });
      
      qrEventSource.addEventListener('qr', (e) => {
      const data = JSON.parse(e.data);
      const qrDisplay = document.getElementById('qr-display');
      const qrContainer = document.getElementById('qr-container');
      const wizardQrContainer = document.getElementById('wizard-qr-container');
      
      // Helper to render QR to a canvas
      function renderQrToCanvas(canvasId, qrCode) {
        const canvas = document.getElementById(canvasId);
        if (canvas && typeof QRCode !== 'undefined') {
          QRCode.toCanvas(canvas, qrCode, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
          }, (err) => {
            if (err) console.error('QR render error:', err);
          });
        }
      }
      
      if (data.qrCode && typeof QRCode !== 'undefined') {
        // Generate visual QR using qrcode.js - Dashboard
        if (qrDisplay) {
          qrDisplay.innerHTML = '<canvas id="qr-canvas" class="mx-auto"></canvas><p class="text-sm text-gray-500 mt-2 text-center">Scan this code with your messaging app</p>';
          renderQrToCanvas('qr-canvas', data.qrCode);
        }
        if (qrContainer) qrContainer.classList.remove('hidden');
        
        // Also update wizard QR if visible
        if (wizardQrContainer) {
          wizardQrContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-4 inline-block"><canvas id="wizard-qr-canvas"></canvas><p class="text-sm text-gray-500 mt-2">Scan with your messaging app</p></div>';
          renderQrToCanvas('wizard-qr-canvas', data.qrCode);
        }
      } else if (data.qr) {
        // Fallback: show QR as text
        if (qrDisplay) {
          qrDisplay.innerHTML = '<pre class="text-xs font-mono whitespace-pre">' + escapeHtml(data.qr || '') + '</pre><p class="text-sm text-gray-500 mt-2">Scan this code with your messaging app</p>';
        }
        if (qrContainer) qrContainer.classList.remove('hidden');
        if (wizardQrContainer) {
          wizardQrContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-4 inline-block"><pre class="text-xs font-mono whitespace-pre">' + escapeHtml(data.qr || '') + '</pre></div>';
        }
      } else if (data.message) {
        if (qrDisplay) qrDisplay.innerHTML = '<p class="text-gray-500">' + escapeHtml(data.message || '') + '</p>';
        if (qrContainer) qrContainer.classList.remove('hidden');
      } else if (data.error) {
        if (qrDisplay) qrDisplay.innerHTML = '<p class="text-red-500">Error: ' + escapeHtml(data.error || 'Unknown error') + '</p>';
        if (qrContainer) qrContainer.classList.remove('hidden');
      }
      });

      // Load plugins lists and status immediately (all at once for faster loading)
      loadIngestorPluginsList();
      loadSyncPluginsList();
      loadStorageStatus();
      loadTagModesStatus();

      // Note: Connection status and buttons are updated via HTMX polling (every 3s)
      // No JavaScript needed - HTMX handles it automatically
      
    }
    
    window.toggleTagFileMode = function() {
      fetch('/web/api/tag-modes/toggle-file-mode', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            loadTagModesStatus();
            alert('File mode updated. Restart Witral for changes to take effect.');
          } else {
            alert('Error: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(err => {
          alert('Error: ' + err.message);
        });
    };
    
    window.toggleDynamicTitles = function() {
      fetch('/web/api/tag-modes/toggle-dynamic-titles', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            loadTagModesStatus();
            alert('Dynamic titles setting updated. Restart Witral for changes to take effect.');
          } else {
            alert('Error: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(err => {
          alert('Error: ' + err.message);
        });
    };
    
    // Load Cloud Sync status
    function loadStorageStatus() {
      fetch('/web/api/storage/status')
        .then(res => {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          const statusEl = document.getElementById('storage-status');
          const actionsEl = document.getElementById('storage-actions');
          const oauthFlow = document.getElementById('oauth-flow');
          const syncSelector = document.getElementById('sync-plugin-selector');
          
          if (statusEl) {
            if (data.isConnected && data.syncType !== 'local') {
              // Cloud sync is connected
              const authMethodText = data.authMethod === 'oauth' ? 'OAuth (your account)' : 'Service Account';
              const userEmailHtml = data.userEmail ? '<p class="text-sm text-gray-500">User: ' + escapeHtml(data.userEmail) + '</p>' : '';
              statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">✅</span><div><p class="text-green-600 font-medium">Cloud sync connected</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType) + ' | Method: ' + escapeHtml(authMethodText) + '</p>' + userEmailHtml + '</div></div>';
              if (actionsEl) {
                actionsEl.innerHTML = data.authMethod === 'oauth' 
                  ? '<button onclick="disconnectDrive()" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Disconnect Cloud Sync</button>'
                  : '';
                const refreshBtn = document.getElementById('refresh-status-btn');
                if (refreshBtn) refreshBtn.classList.add('hidden');
              }
              if (oauthFlow) oauthFlow.classList.add('hidden');
              if (syncSelector) syncSelector.classList.add('hidden');
            } else {
              // Cloud sync is not connected (local only)
              statusEl.innerHTML = '<div class="flex items-center gap-2"><span class="text-2xl">💾</span><div><p class="text-gray-600 font-medium">Local storage only</p><p class="text-sm text-gray-500">Plugin: ' + escapeHtml(data.syncType || 'local') + ' | Cloud sync not configured</p></div></div>';
              if (actionsEl) {
                // Show connect button if sync plugin supports OAuth (like googledrive)
                // OR show option to change to googledrive if currently local
                if (data.syncType === 'googledrive') {
                  actionsEl.innerHTML = '<button onclick="startOAuthFlow()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">🔗 Connect Cloud Sync</button>';
                } else if (data.syncType === 'local') {
                  // Show option to change to Google Drive
                  actionsEl.innerHTML = '<button onclick="showSyncPluginSelector()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">☁️ Enable Cloud Sync</button>';
                } else {
                  actionsEl.innerHTML = '';
                }
                const refreshBtn = document.getElementById('refresh-status-btn');
                if (refreshBtn) refreshBtn.classList.add('hidden');
              }
              // Show credentials form if not configured and is googledrive
              if (data.syncType === 'googledrive') {
                const oauthFlow = document.getElementById('oauth-flow');
                if (oauthFlow) {
                  fetch('/web/api/oauth/status')
                    .then(res => res.json())
                    .then(oauthStatus => {
                      if (!oauthStatus.configured) {
                        oauthFlow.classList.remove('hidden');
                        const oauthNotConfigured = document.getElementById('oauth-not-configured');
                        if (oauthNotConfigured) oauthNotConfigured.classList.remove('hidden');
                      }
                    })
                    .catch(() => {});
                }
              } else {
                if (oauthFlow) oauthFlow.classList.add('hidden');
              }
            }
          }
        })
        .catch(err => {
          const statusEl = document.getElementById('storage-status');
          if (statusEl) {
            statusEl.innerHTML = '<p class="text-red-500">❌ Error loading status: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
          }
        });
    }
    
    // Show sync plugin selector
    window.showSyncPluginSelector = function() {
      const syncSelector = document.getElementById('sync-plugin-selector');
      const selectEl = document.getElementById('sync-plugin-select');
      
      if (!syncSelector || !selectEl) return;
      
      // Load available sync plugins
      fetch('/web/api/plugins/sync')
        .then(res => res.json())
        .then(data => {
          if (data.plugins && data.plugins.length > 0) {
            selectEl.innerHTML = '';
            data.plugins.forEach(plugin => {
              const option = document.createElement('option');
              option.value = plugin.id;
              option.textContent = plugin.name + ' - ' + plugin.description;
              if (plugin.isConfigured) {
                option.selected = true;
              }
              selectEl.appendChild(option);
            });
            syncSelector.classList.remove('hidden');
          }
        })
        .catch(err => {
          alert('Error loading sync plugins: ' + err.message);
        });
    };
    
    // Change sync plugin (dynamic - no restart)
    window.changeSyncPlugin = function() {
      const selectEl = document.getElementById('sync-plugin-select');
      if (!selectEl) return;
      
      const selectedPlugin = selectEl.value;
      if (!selectedPlugin) {
        showToast('Please select a sync plugin', 'error');
        return;
      }
      
      // Show loading state
      const syncSelector = document.getElementById('sync-plugin-selector');
      const changeBtn = syncSelector?.querySelector('button[onclick="changeSyncPlugin()"]');
      if (changeBtn) {
        changeBtn.disabled = true;
        changeBtn.textContent = 'Changing...';
      }
      
      // Update .env file and reload plugin dynamically (silent, no confirmation)
      fetch('/web/api/sync/change-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: selectedPlugin })
      })
        .then(res => res.json())
        .then(data => {
          if (changeBtn) {
            changeBtn.disabled = false;
            changeBtn.textContent = 'Change';
          }
          
          if (data.success) {
            showToast(data.message, 'success', 'Sync Plugin Changed');
            if (syncSelector) syncSelector.classList.add('hidden');
            // Trigger storage status update
            htmx.trigger('body', 'storage-changed');
            // Reload status after a moment
            setTimeout(() => {
              htmx.trigger('#storage-status', 'load');
              htmx.trigger('#storage-actions', 'load');
            }, 500);
          } else {
            showToast(data.error || 'Unknown error', 'error', 'Error');
          }
        })
        .catch(err => {
          if (changeBtn) {
            changeBtn.disabled = false;
            changeBtn.textContent = 'Change';
          }
          showToast(err.message, 'error', 'Error');
        });
    };

    // Save OAuth credentials
    window.saveOAuthCredentials = function() {
      const clientIdInput = document.getElementById('oauth-client-id');
      const clientSecretInput = document.getElementById('oauth-client-secret');
      const fileInput = document.getElementById('oauth-credentials-file');
      const jsonTextarea = document.getElementById('oauth-credentials-json');
      const errorEl = document.getElementById('credentials-error');
      const successEl = document.getElementById('credentials-success');
      const saveBtn = document.getElementById('save-credentials-btn');
      
      if (errorEl) errorEl.classList.add('hidden');
      if (successEl) successEl.classList.add('hidden');
      
      let credentialsContent = '';
      
      // Option 1: Client ID and Secret directly
      if (clientIdInput && clientSecretInput && 
          clientIdInput.value.trim() && clientSecretInput.value.trim()) {
        const clientId = clientIdInput.value.trim();
        const clientSecret = clientSecretInput.value.trim();
        // Create compatible JSON structure
        credentialsContent = JSON.stringify({
          web: {
            client_id: clientId,
            client_secret: clientSecret
          }
        }, null, 2);
        sendCredentials(credentialsContent);
        return;
      }
      
      // Option 2: JSON file
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
          credentialsContent = e.target.result;
          sendCredentials(credentialsContent);
        };
        
        reader.onerror = function() {
          if (errorEl) {
            errorEl.textContent = 'Error reading file';
            errorEl.classList.remove('hidden');
          }
          if (saveBtn) saveBtn.disabled = false;
        };
        
        if (saveBtn) saveBtn.disabled = true;
        reader.readAsText(file);
        return;
      }
      
      // Option 3: Paste JSON content
      if (jsonTextarea && jsonTextarea.value.trim()) {
        credentialsContent = jsonTextarea.value.trim();
        sendCredentials(credentialsContent);
        return;
      }
      
      if (errorEl) {
        errorEl.textContent = 'Please enter Client ID and Secret, upload a file, or paste JSON content';
        errorEl.classList.remove('hidden');
      }
    };
    
    function sendCredentials(credentialsContent) {
      const errorEl = document.getElementById('credentials-error');
      const successEl = document.getElementById('credentials-success');
      const saveBtn = document.getElementById('save-credentials-btn');
      
      // Validate JSON format
      try {
        const parsed = JSON.parse(credentialsContent);
        if (!parsed.web && !parsed.installed) {
          throw new Error('Invalid format: JSON must contain "web" or "installed" property');
        }
      } catch (e) {
        if (errorEl) {
          errorEl.textContent = 'Invalid JSON: ' + e.message;
          errorEl.classList.remove('hidden');
        }
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      
      if (saveBtn) saveBtn.disabled = true;
      
      fetch('/web/api/oauth/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: credentialsContent })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            if (errorEl) {
              errorEl.textContent = data.error;
              errorEl.classList.remove('hidden');
            }
            if (saveBtn) saveBtn.disabled = false;
          } else {
            if (successEl) {
              successEl.textContent = '✅ Credentials saved! Connecting...';
              successEl.classList.remove('hidden');
            }
            // Hide form and start OAuth flow
            const oauthNotConfigured = document.getElementById('oauth-not-configured');
            if (oauthNotConfigured) oauthNotConfigured.classList.add('hidden');
            
            // Start OAuth flow automatically
            setTimeout(() => {
              startOAuthFlow();
            }, 500);
          }
        })
        .catch(err => {
          if (errorEl) {
            errorEl.textContent = 'Error: ' + err.message;
            errorEl.classList.remove('hidden');
          }
          if (saveBtn) saveBtn.disabled = false;
        });
    }

    // Start automatic OAuth flow
    window.startOAuthFlow = function() {
      // First check if credentials exist
      fetch('/web/api/oauth/status')
        .then(res => res.json())
        .then(oauthStatus => {
          if (!oauthStatus.configured) {
            // No credentials, show form directly
            const oauthFlow = document.getElementById('oauth-flow');
            const oauthNotConfigured = document.getElementById('oauth-not-configured');
            if (oauthFlow) oauthFlow.classList.remove('hidden');
            if (oauthNotConfigured) oauthNotConfigured.classList.remove('hidden');
            return;
          }
          
          // Credentials exist, proceed with authorization
          return fetch('/web/api/oauth/authorize');
        })
        .then(res => {
          if (!res) return; // Already handled no credentials case
          return res.json();
        })
        .then(data => {
          if (!data) return; // Already handled no credentials case
          
          if (data.error) {
            // Unexpected error, show form anyway
            const oauthFlow = document.getElementById('oauth-flow');
            const oauthNotConfigured = document.getElementById('oauth-not-configured');
            if (oauthFlow) oauthFlow.classList.remove('hidden');
            if (oauthNotConfigured) oauthNotConfigured.classList.remove('hidden');
            return;
          }
          
          // If automatic flow, open in popup
          if (data.automatic && data.authUrl) {
            const popup = window.open(
              data.authUrl,
              'Google OAuth',
              'width=600,height=700,scrollbars=yes,resizable=yes'
            );
            
            if (!popup) {
              alert('Please allow popups for this site to complete authorization');
              return;
            }
            
            // Function to handle OAuth success
            function handleOAuthSuccess() {
              // Reload state multiple times to ensure update
              setTimeout(() => {
                loadStorageStatus();
              }, 500);
              setTimeout(() => {
                loadStorageStatus();
              }, 2000);
              setTimeout(() => {
                loadStorageStatus();
              }, 4000);
            }
            
            // Listen for popup messages
            const messageHandler = function(event) {
              if (event.data && event.data.type === 'oauth-success') {
                window.removeEventListener('message', messageHandler);
                try {
                  if (popup && !popup.closed) {
                    popup.close();
                  }
                } catch (e) {
                  // Ignore COOP errors
                }
                handleOAuthSuccess();
              } else if (event.data && event.data.type === 'oauth-error') {
                window.removeEventListener('message', messageHandler);
                try {
                  if (popup && !popup.closed) {
                    popup.close();
                  }
                } catch (e) {
                  // Ignore COOP errors
                }
                alert('❌ Authorization failed: ' + (event.data.error || 'Unknown error'));
              }
            };
            
            window.addEventListener('message', messageHandler);
            
            // Alternative polling: check status periodically after opening popup
            // This works as fallback if postMessage doesn't work due to COOP
            let pollCount = 0;
            let popupClosed = false;
            const maxPolls = 60; // 30 seconds maximum (500ms * 60)
            const statusPoll = setInterval(() => {
              pollCount++;
              
              // If popup closed, check status and cleanup
              try {
                if (popup.closed && !popupClosed) {
                  popupClosed = true;
                  clearInterval(statusPoll);
                  window.removeEventListener('message', messageHandler);
                  
                  // Use same success function to ensure consistency
                  handleOAuthSuccess();
                } else if (pollCount >= maxPolls) {
                  // Timeout: close polling but keep message listener
                  clearInterval(statusPoll);
                }
              } catch (e) {
                // Ignore COOP errors - popup may be in different origin
                // If popup closed without detection, postMessage should work
                if (pollCount >= maxPolls) {
                  clearInterval(statusPoll);
                }
              }
            }, 500);
          } else {
            // Fallback to manual flow if not automatic
            const oauthFlow = document.getElementById('oauth-flow');
            const urlContainer = document.getElementById('oauth-url-container');
            const notConfigured = document.getElementById('oauth-not-configured');
            
            if (oauthFlow) oauthFlow.classList.remove('hidden');
            
            if (data.error) {
              if (notConfigured) notConfigured.classList.remove('hidden');
              if (urlContainer) urlContainer.classList.add('hidden');
            } else {
              if (urlContainer) urlContainer.classList.remove('hidden');
              if (notConfigured) notConfigured.classList.add('hidden');
              
              const urlInput = document.getElementById('oauth-url');
              const urlLink = document.getElementById('oauth-url-link');
              if (urlInput) urlInput.value = data.authUrl;
              if (urlLink) urlLink.href = data.authUrl;
            }
          }
        })
        .catch(err => {
          alert('Error: ' + err.message);
        });
    };

    // Copy OAuth URL
    window.copyOAuthUrl = function() {
      const urlInput = document.getElementById('oauth-url');
      if (urlInput) {
        urlInput.select();
        document.execCommand('copy');
        alert('URL copied to clipboard');
      }
    };

    // Send OAuth code
    window.submitOAuthCode = function() {
      const codeInput = document.getElementById('oauth-code');
      const errorEl = document.getElementById('oauth-error');
      const successEl = document.getElementById('oauth-success');
      const submitBtn = document.getElementById('submit-oauth-btn');
      
      if (!codeInput || !codeInput.value.trim()) {
        if (errorEl) {
          errorEl.textContent = 'Please paste the authorization code';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      
      if (submitBtn) submitBtn.disabled = true;
      if (errorEl) errorEl.classList.add('hidden');
      if (successEl) successEl.classList.add('hidden');
      
      fetch('/web/api/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput.value.trim() })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            if (errorEl) {
              errorEl.textContent = data.error;
              errorEl.classList.remove('hidden');
            }
            if (submitBtn) submitBtn.disabled = false;
          } else {
            if (successEl) {
              successEl.textContent = 'Authorization successful! Cloud sync connected.';
              successEl.classList.remove('hidden');
            }
            // Reload state after 1 second
            setTimeout(function() {
              loadStorageStatus();
              const oauthFlow = document.getElementById('oauth-flow');
              if (oauthFlow) oauthFlow.classList.add('hidden');
            }, 1500);
          }
        })
        .catch(err => {
          if (errorEl) {
            errorEl.textContent = 'Error: ' + err.message;
            errorEl.classList.remove('hidden');
          }
          if (submitBtn) submitBtn.disabled = false;
        });
    };

    // Connection functions removed - now handled by HTMX

    // Disconnect cloud sync
    window.disconnectDrive = function() {
      if (!confirm('Are you sure you want to disconnect cloud sync?')) return;
      
      fetch('/web/api/oauth/revoke', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            loadStorageStatus();
          } else {
            alert('Error: ' + (data.error || 'Could not disconnect'));
          }
        })
        .catch(err => {
          alert('Error: ' + err.message);
        });
    };

    // Load available groups when modal opens
    function loadAvailableGroups() {
      const groupsListEl = document.getElementById('available-groups-list');
      
      if (!groupsListEl) {
        return;
      }

      groupsListEl.innerHTML = '<p class="text-gray-500">Loading available groups...</p>';

      fetch('/web/api/groups/available')
        .then(res => {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + res.statusText);
          }
          return res.json();
        })
        .then(data => {
          if (data.error) {
            groupsListEl.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2"><p class="text-yellow-800 text-sm">⚠️ ' + escapeHtml(data.error) + '</p></div>';
            return;
          }

          if (!data.groups || data.groups.length === 0) {
            groupsListEl.innerHTML = '<p class="text-gray-500">No available groups.</p>';
            return;
          }

          let html = '<div class="space-y-2">';
          data.groups.forEach(function(group) {
            const isMonitored = group.isMonitored || false;
            const bgClass = isMonitored ? 'bg-gray-100' : '';
            const participantsHtml = group.participants ? '<p class="text-sm text-gray-500">' + escapeHtml(String(group.participants)) + ' participants</p>' : '';
            
            let actionHtml;
            if (isMonitored) {
              actionHtml = '<span class="text-green-600 text-sm">✓ Monitored</span>';
            } else {
              const escapedName = escapeHtml(group.name || '');
              const escapedJid = escapeHtml(group.jid || '');
              actionHtml = '<button data-group-name="' + escapedName + '" data-group-jid="' + escapedJid + '" onclick="addGroupFromButton(this)" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">Add</button>';
            }
            
            html += '<div class="flex items-center justify-between p-3 border rounded ' + bgClass + '">' +
              '<div class="flex-1">' +
              '<p class="font-medium">' + escapeHtml(group.name || '') + '</p>' +
              participantsHtml +
              '</div>' +
              '<div>' +
              actionHtml +
              '</div>' +
              '</div>';
          });
          html += '</div>';
          groupsListEl.innerHTML = html;
        })
        .catch(err => {
          const errorMsg = err && err.message ? err.message : 'Unknown error';
          groupsListEl.innerHTML = '<div class="bg-red-50 border border-red-200 rounded p-3"><p class="text-red-800 text-sm">❌ Error loading groups: ' + escapeHtml(errorMsg) + '</p></div>';
        });
    }

    // Function to add group
    function addGroup(name, jid) {
      fetch('/web/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, jid })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            // Cerrar modal
            document.getElementById('add-group-modal')?.classList.add('hidden');
            // Reload monitored groups list
            htmx.trigger('#groups-list', 'refresh');
            // Update counter
            updateGroupsCount();
            // Reload available groups
            loadAvailableGroups();
          } else {
            alert('Error: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(err => {
          alert('Error adding group: ' + err.message);
        });
    }
    
    // Helper function to add group from button (uses data attributes)
    window.addGroupFromButton = function(button) {
      const name = button.getAttribute('data-group-name');
      const jid = button.getAttribute('data-group-jid');
      if (name) {
        addGroup(name, jid || '');
      }
    };

    // Detect when add group modal opens
    const addGroupButton = document.querySelector('[onclick*="add-group-modal"]');
    if (addGroupButton) {
      addGroupButton.addEventListener('click', () => {
        setTimeout(loadAvailableGroups, 100); // Small delay to ensure modal is visible
      });
    }

    // Also detect modal opening directly
    const addGroupModal = document.getElementById('add-group-modal');
    if (addGroupModal) {
      // Use MutationObserver to detect when modal becomes visible
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            if (!target.classList.contains('hidden')) {
              loadAvailableGroups();
            }
          }
        });
      });
      observer.observe(addGroupModal, { attributes: true, attributeFilter: ['class'] });
    }

    // Function to update groups counter
    function updateGroupsCount() {
      fetch('/web/api/groups')
        .then(function(res) { return res.text(); })
        .then(function(html) {
          const countEl = document.getElementById('groups-count');
          if (countEl) {
            // Count li elements in HTML
            const matches = html.match(/<li/g);
            countEl.textContent = matches ? matches.length : '0';
          }
        });
    }

    // Function to update tags counter
    function updateTagsCount() {
      fetch('/web/api/tags')
        .then(function(res) { return res.text(); })
        .then(function(html) {
          const countEl = document.getElementById('tags-count');
          if (countEl) {
            // Count li elements in HTML
            const matches = html.match(/<li/g);
            countEl.textContent = matches ? matches.length : '0';
          }
        });
    }

    // Exponer funciones globalmente
    window.addGroup = addGroup;
    window.addGroupFromButton = addGroupFromButton;
    window.loadAvailableGroups = loadAvailableGroups;
    window.updateGroupsCount = updateGroupsCount;
    
    // ==========================================
    // Global functions for tags
    // ==========================================
    
    // Create tag
    function createTag(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const enabledFields = Array.from(formData.getAll('enabledFields'));
      if (!enabledFields.includes('CONTENIDO')) enabledFields.push('CONTENIDO');
      
      const separator = formData.get('separator') || ',,';
      if (separator.length < 1 || separator.length > 3) {
        alert('The separator must have between 1 and 3 characters');
        return;
      }
      
      fetch('/web/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description') || undefined,
          enabledFields,
          separator
        })
      })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            const modal = document.getElementById('add-tag-modal');
            if (modal) modal.classList.add('hidden');
            event.target.reset();
            htmx.trigger('#tags-list', 'refresh');
            // Update counter
            updateTagsCount();
          } else {
            alert('Error: ' + (d.error || 'Unknown error'));
          }
        });
    }


    // Update tag (fields and separator)
    function updateTag(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const enabledFields = Array.from(formData.getAll('enabledFields'));
      if (!enabledFields.includes('CONTENIDO')) enabledFields.push('CONTENIDO');
      
      const separator = formData.get('separator') || ',,';
      if (separator.length < 1 || separator.length > 3) {
        alert('The separator must have between 1 and 3 characters');
        return;
      }
      
      const tagName = event.target.dataset.tagName;
      
      fetch('/web/api/tags/' + encodeURIComponent(tagName) + '/fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledFields, separator })
      })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            document.getElementById('configure-fields-modal').classList.add('hidden');
            htmx.trigger('#tags-list', 'refresh');
          } else {
            alert('Error: ' + (d.error || 'Unknown error'));
          }
        });
    }

    // Delete tag
    function deleteTag(name) {
      const escapedName = escapeHtml(name || '');
      if (confirm('Delete tag "' + escapedName + '"?\\n\\nAlso delete the associated markdown file?')) {
        fetch('/web/api/tags/' + encodeURIComponent(name), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleteFile: true })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              htmx.trigger('#tags-list', 'refresh');
              updateTagsCount();
            } else {
              alert('Error: ' + (data.error || 'Unknown error'));
            }
          });
      }
    }

    // Open configuration modal from button (using data attributes)
    function openConfigureFieldsModalFromButton(button) {
      const name = button.dataset.tag;
      const fieldsBase64 = button.dataset.fields;
      const separator = button.dataset.separator;
      
      let fields = ['CONTENIDO'];
      try {
        fields = JSON.parse(atob(fieldsBase64));
      } catch (e) {
        // Use default fields if parsing fails
      }
      
      openConfigureFieldsModal(name, fields, separator);
    }

    // Open configuration modal
    function openConfigureFieldsModal(name, currentFields, currentSeparator) {
      const modal = document.getElementById('configure-fields-modal');
      const form = document.getElementById('configure-fields-form');
      if (!modal || !form) {
        alert('Error: Modal not found. Please reload the page.');
        return;
      }
      form.dataset.tagName = name;
      
      // Parse currentFields if it's a string
      let fields = currentFields;
      if (typeof currentFields === 'string') {
        try {
          fields = JSON.parse(currentFields);
        } catch (e) {
          fields = ['CONTENIDO'];
        }
      }
      
      // Mark current fields
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = fields.includes(cb.value);
      });
      
      // Set current separator
      const separatorInput = document.getElementById('configure-separator-input');
      if (separatorInput) {
        separatorInput.value = currentSeparator || ',,';
      }
      
      modal.classList.remove('hidden');
    }

    // Copy markdown
    function copyMarkdown() {
      const contentEl = document.getElementById('markdown-content');
      if (contentEl) {
        navigator.clipboard.writeText(contentEl.textContent || '')
          .then(() => {
            const btn = document.getElementById('copy-markdown-btn');
            if (btn) {
              const originalText = btn.textContent;
              btn.textContent = '✓ Copied!';
              setTimeout(() => {
                btn.textContent = originalText;
              }, 2000);
            }
          })
          .catch(err => {
            alert('Error copying: ' + err.message);
          });
      }
    }

    // ==========================================
    // Expose functions globally for HTMX
    // ==========================================
    // Expose tag functions
    window.createTag = createTag;
    window.updateTag = updateTag;
    window.deleteTag = deleteTag;
    // viewTagMarkdown is already defined as window.viewTagMarkdown above
    
    window.openConfigureFieldsModal = openConfigureFieldsModal;
    window.openConfigureFieldsModalFromButton = openConfigureFieldsModalFromButton;
    window.copyMarkdown = copyMarkdown;
    window.startWizard = startWizard;
    window.dismissWizard = dismissWizard;
    // Functions to show guides (if needed in the future)
    window.showServiceAccountGuide = function() {
      const guideEl = document.getElementById('storage-setup-guide');
      if (guideEl) {
        guideEl.classList.remove('hidden');
      }
    };
    window.showGoogleDriveSetup = function() {
      const guideEl = document.getElementById('storage-setup-guide');
      if (guideEl) {
        guideEl.classList.remove('hidden');
      }
    };
    
    // Execute immediately if DOM is ready, or wait
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
      initDashboard();
    }
  </script>
</body>
</html>`;
}

