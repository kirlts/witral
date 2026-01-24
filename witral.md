# Witral - Complete Technical Documentation

> **Complete technical documentation** - This document describes the architecture, operation, flows, and complete structure of Witral. Designed for both LLMs and humans to understand and develop the system efficiently.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Core Components](#core-components)
5. [Data Flows](#data-flows)
6. [Plugin System](#plugin-system)
7. [Storage System](#storage-system)
8. [Group Management](#group-management)
9. [Tag System](#tag-system)
10. [Command Line Interface (CLI)](#command-line-interface-cli)
11. [Web Dashboard](#web-dashboard)
12. [Configuration](#configuration)
13. [Docker and Deployment](#docker-and-deployment)
14. [Data Format](#data-format)
15. [LLM Development Guide](#llm-development-guide)

---

## 🎯 Overview

Witral (Universal Ingestion Framework) is a **modular and extensible framework** designed to capture ephemeral messages from any messaging platform and transform them into structured Markdown files, ready to be consumed by Personal Knowledge Management (PKM) tools like Obsidian, Logseq, VS Code, etc.

**Repository**: [https://github.com/kirlts/witral](https://github.com/kirlts/witral)

**Core Philosophy**: The system is completely platform-agnostic. Plugins (like Baileys for WhatsApp) are optional and presented as example implementations.

### Key Features

- **Modular Architecture**: The core is completely platform-agnostic. Plugins (like Baileys for WhatsApp) are optional and presented as examples.
- **Tag System**: Messages can be automatically tagged using the format `<separator>TAG content` (separator at the beginning).
- **Group Management**: Allows monitoring specific groups persistently.
- **Interactive CLI**: Command-line interface with nested menus and first-run wizard.
- **Web Dashboard**: Lightweight graphical interface for configuration and real-time monitoring (development paused, not recommended for use).
- **Hybrid Storage**: Support for local storage with optional cloud sync (Google Drive via OAuth).
- **Group Message Capture**: All messages from monitored groups are automatically saved to `[group-name].md` files in `vault/groups/`.
- **Docker Ready**: Full support for development and production with Docker.
- **Low Resource Consumption**: Optimized for resource-constrained environments (Hono + HTMX).

### Design Principles

1. **Modularity**: The core does not depend on specific platform implementations.
2. **Extensibility**: Easy to add new plugins via interfaces (`IngestorInterface`, `StorageInterface`, `SyncInterface`).
3. **Persistence**: Data (groups, tags) is saved in JSON.
4. **Separation of Concerns**: Each component has a clear responsibility.
5. **Hybrid Storage**: Always saves locally first, syncs remotely afterwards.
6. **Resource Efficiency**: Uses lightweight technologies (Hono, HTMX) to minimize resource consumption.

---

## 🏗️ System Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Witral Core                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   CLI        │  │  Web Server  │  │  Group Mgmt  │ │
│  │              │  │  (Hono)      │  │  Tag         │ │
│  │              │  │              │  │  Writer      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ IngestorInterface│  │ StorageInterface│  │  Config/Logger  │
│                  │  │ SyncInterface  │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │
         │                    │
    ┌────┴────┐         ┌────┴────┐
    │         │         │         │
    ▼         ▼         ▼         ▼
┌────────┐         ┌────────┐ ┌────────┐
│Baileys │         │ Local  │ │Google  │
│Plugin  │         │Storage │ │Drive   │
└────────┘         └────────┘ └────────┘
```

### System Layers

1. **Presentation Layer**: 
   - Interactive CLI (`src/cli/`)
   - Web Dashboard (`src/web/`)
2. **Business Logic Layer**: Core (`src/core/`)
   - Group management
   - Tag management
   - Markdown writing
3. **Integration Layer**: Plugins (`src/plugins/`)
   - Ingestors (implementations of `IngestorInterface`)
   - Storage (implementations of `StorageInterface`)
   - Sync (implementations of `SyncInterface`)
4. **Infrastructure Layer**: Config, Logger, Utils (`src/config/`, `src/utils/`)

---

## 📁 Project Structure

```
witral/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── cli/
│   │   ├── index.ts             # Interactive CLI with menus
│   │   └── wizard.ts            # First-run wizard
│   ├── core/
│   │   ├── ingestor/
│   │   │   ├── interface.ts     # IngestorInterface (contract)
│   │   │   └── factory.ts       # Factory to create ingestors
│   │   ├── storage/
│   │   │   ├── interface.ts     # StorageInterface (contract)
│   │   │   └── factory.ts       # Factory to create storage (always local)
│   │   ├── sync/
│   │   │   ├── interface.ts     # SyncInterface (contract)
│   │   │   ├── factory.ts       # Factory to create sync plugins
│   │   │   └── types.ts         # Shared sync types
│   │   ├── groups/
│   │   │   ├── index.ts         # GroupManager (group persistence)
│   │   │   └── writer.ts        # GroupWriter (write all messages to group files)
│   │   ├── tags/
│   │   │   ├── index.ts         # TagManager (tag management)
│   │   │   └── writer.ts        # TagWriter (write tagged messages to markdown)
│   │   └── commands/
│   │       └── handler.ts     # CommandHandler (interactive menu via messaging)
│   ├── plugins/
│   │   ├── baileys/
│   │   │   └── index.ts         # Baileys implementation (WhatsApp example)
│   │   ├── storage/
│   │   │   └── local/
│   │   │       └── index.ts     # LocalStorage (always used)
│   │   └── sync/
│   │       ├── local/
│   │       │   └── index.ts     # LocalSync (no cloud sync)
│   │       └── googledrive/
│   │           ├── index.ts     # GoogleDriveSync
│   │           └── oauth.ts     # OAuth for Google Drive
│   ├── web/
│   │   ├── index.ts              # Web server (Hono)
│   │   ├── routes.ts             # Dashboard routes
│   │   ├── sse.ts                # Server-Sent Events
│   │   └── templates/
│   │       ├── dashboard.ts      # Main dashboard template
│   │       ├── groups.ts         # Groups template
│   │       └── tags.ts           # Tags template
│   ├── config/
│   │   └── index.ts              # Configuration management (Zod)
│   └── utils/
│       ├── logger.ts             # Logger (Pino)
│       ├── logger-sse.ts         # Logger integration with SSE
│       └── sanitize.ts           # Input sanitization utilities
├── data/                         # Generated data (not in git)
│   ├── session/                  # Ingestor session data (plugin-specific)
│   ├── googledrive/              # Google Drive credentials
│   │   └── oauth-credentials.json  # OAuth credentials (optional)
│   ├── monitored-groups.json    # Monitored groups
│   ├── tags.json                 # Tag configuration
│   └── .wizard-completed         # First-run wizard completion flag
├── vault/                        # Generated markdown files (VAULT_PATH, default: ./vault)
│   ├── tags/                     # Files per tag
│   ├── groups/                   # Files per group (all messages automatically saved)
│   └── .google-oauth-tokens.json # OAuth tokens (if Google Drive sync enabled)
├── scripts/
│   ├── create-backup.sh         # Create selective backups
│   ├── restore-from-backup.sh  # Restore from backup
│   ├── download-prod.sh         # Download production data
│   ├── reset-dev.sh             # Reset development environment
│   ├── start.sh                  # Smart start script
│   ├── entrypoint.sh            # Docker entrypoint
│   ├── init-setup.sh            # Docker initialization
│   └── healthcheck.js           # Docker health check
├── docker-compose.yml           # Docker Compose (all profiles)
├── Dockerfile                   # Multi-stage build
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── env.example                  # Example environment variables
├── witral.md                       # This document
└── README.md                    # User documentation
```

---

## 🔧 Core Components

### 1. Entry Point (`src/index.ts`)

**Responsibility**: Initialize the system and coordinate components.

**Initialization Flow**:

```typescript
1. GroupManager.load() → Reads ./data/monitored-groups.json
2. TagManager.load() → Reads ./data/tags.json
3. createStorage() → Creates local storage (always LocalStorage)
4. storage.initialize() → Initializes local storage
5. createSync() → Creates sync plugin based on SYNC_TYPE
6. sync.initialize() → Initializes sync plugin (local or cloud)
7. createIngestor() → Loads plugin based on INGESTOR_TYPE
8. Configure TagManager in ingestor (if supports commands)
9. ingestor.initialize() → Initializes plugin (async)
10. Inside ingestor.initialize().then():
    - ingestor.start() → Attempts to connect automatically (non-blocking, runs in background)
    - WitralCLI.start() → Starts CLI (runs first-run wizard if needed)
    - startWebServer() → Starts web server (if WEB_ENABLED and not in CLI-only mode)
11. If credentials exist → Connects automatically
    If not → Waits for user to generate QR
```

**Signal Handling**:
- `SIGTERM`: Close ingestor, web server and exit
- `SIGINT`: Handled by CLI, but also here as fallback

### 2. CLI (`src/cli/index.ts`)

**Class**: `WitralCLI`

**Responsibilities**:
- Display interactive menu
- Process user input
- Manage nested menus (groups, tags)
- Display messages in real-time
- Coordinate operations between components

**Internal State**:
- `isInSubMenu: boolean` - Flag to avoid input conflicts between menus

**Main Menu**:
```
1) Messaging Service  |  2) Groups (N)  |  3) Tags (N)  |  4) Settings  |  5) Visit Dashboard  |  6) Exit
```

**Note**: Menu options are dynamic based on ingestor capabilities and configuration.

**Groups Submenu**:
```
1) List available groups and add
2) Remove monitored group
3) Return to main menu
```

**Tags Submenu**:
```
1) Create tag (with file mode configuration)
2) Delete tag
3) Configure tag fields (enabled fields and separator)
4) Edit tag description
5) Return to main menu
```

**Note**: Tag file mode can be configured per tag during creation or via option 3 in the tags submenu. Tag fields and separator can be configured via option 3 (web dashboard development is paused).

**Settings Submenu**:
```
1) Configure Tag File Modes (global settings)
2) Configure Cloud Sync
3) View current configuration
4) Back to main menu
```

**Message Handling**:
- Messages are displayed immediately when they arrive
- Readline is paused to display message without interfering with prompt
- Format: `Group: [name]`, `Sender: [author]`, `Time: [time]`, `Message: [content]`

### 3. Ingestor Interface (`src/core/ingestor/interface.ts`)

**Interface**: `IngestorInterface`

**Contract that all plugins must implement**:

```typescript
interface IngestorInterface {
  initialize(): Promise<void>;           // Initialize resources
  start(): Promise<void>;                // Start connection
  stop(): Promise<void>;                 // Stop connection
  generateQR(): Promise<void>;           // Generate QR (if applicable)
  isConnected(): boolean;                 // Connection status
  getConnectionState(): ConnectionState; // Detailed connection state
  onConnected(callback: () => void): void; // Connection callback
  onMessage(callback: (message: Message) => void): void; // Message callback
  listGroups(): Promise<Group[]>;        // List available groups
  requiresQR(): boolean;                 // Whether QR is required
  getConnectionInstructions(): string;   // Human-readable instructions
  sendMessageToGroup?(groupName: string, text: string): Promise<void>; // Optional: Send message to group
}
```

**Note**: The `sendMessageToGroup()` method is optional. If implemented, it enables command system feedback and interactive menus via messaging platforms.

**Data Types**:

```typescript
interface Message {
  group: string;    // Group name
  sender: string;   // Sender name
  time: string;     // Format: "HH:MM:SS - DD/MM/YYYY"
  content: string;  // Message content
}

interface Group {
  name: string;           // Group name
  jid?: string;          // Group ID (optional)
  participants?: number; // Number of participants (optional)
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
```

### 4. Storage Interface (`src/core/storage/interface.ts`)

**Interface**: `StorageInterface`

**Contract that all storage systems must implement**:

```typescript
interface StorageInterface {
  initialize(): Promise<void>;                    // Initialize storage
  saveFile(path: string, content: string): Promise<void>;  // Save file (relative path)
  readFile(path: string): Promise<string | null>; // Read file (relative path)
  exists(path: string): Promise<boolean>;         // Check existence (relative path)
  deleteFile(path: string): Promise<void>;        // Delete file (relative path)
  listFiles(path: string): Promise<string[]>;     // List files (relative path)
}
```

**Note**: All paths are relative to `VAULT_PATH`. Storage is always local filesystem. Cloud sync is handled separately by sync plugins.

**Principle**: Unidirectional upload - Witral only pushes changes, does not sync from remote.

### 5. Baileys Plugin (`src/plugins/baileys/index.ts`)

**Class**: `BaileysIngestor implements IngestorInterface`

**Optional Dependencies**:
- `@whiskeysockets/baileys`: WhatsApp WebSocket client
- `@hapi/boom`: Error handling
- `qrcode-terminal`: Display QR in terminal

**Features**:
- Automatic connection if saved credentials exist
- QR generation when explicitly requested via `generateQR()`
- Message filtering by monitored groups
- Historical message detection (ignores messages > 2 minutes old)
- Automatic reconnection handling
- Initial synchronization (ignores messages during first 3 seconds)
- SSE integration to send QR to web dashboard
- **Command system via messaging platforms**: Detects "menu,," or "menu" or ",,menu" and responds with interactive menu (auto-closes after 2 minutes of inactivity)
- **Message sending**: Implements `sendMessageToGroup()` to respond to commands and send feedback messages
- **TagManager integration**: Supports `setTagManager()` for command system integration

**Connection Flow**:
1. `start()`: Attempts to connect with saved credentials (does not show QR)
2. `generateQR()`: Forces new connection and displays QR
3. `connection.update` events: Handles states (connecting, open, close, qr)
4. `messages.upsert` events: Processes new messages

**Message Filtering**:
- Only groups (`@g.us`)
- Only monitored groups (using `GroupManager`)
- Ignores historical messages
- Ignores messages during initial synchronization

### 6. Group Manager (`src/core/groups/index.ts`)

**Class**: `GroupManager`

**Responsibility**: Manage persistence of monitored groups.

**Persistence**: `./data/monitored-groups.json`

**Data Structure**:
```json
[
  {
    "name": "Group Name",
    "jid": "1234567890-1234567890@g.us"
  }
]
```

**Key Methods**:
- `load()`: Load groups from JSON
- `save()`: Save groups to JSON
- `addGroup(name, jid?)`: Add group
- `removeGroup(name)`: Remove group
- `getAllGroups()`: Get all groups
- `isMonitored(name)`: Check if a group is monitored

### 7. Tag Manager (`src/core/tags/index.ts`)

**Class**: `TagManager`

**Responsibility**: Manage tag configuration.

**Persistence**: `./data/tags.json`

**Data Structure**:
```json
[
  {
    "name": "idea",
    "description": "Ideas and thoughts",
    "enabledFields": ["AUTOR", "HORA", "FECHA", "CONTENIDO"],
    "separator": ",,",
    "fileMode": "new-file",  // optional: "new-file" | "append" | undefined (global default)
    "createdAt": "ISO-8601 timestamp"
  }
]
```

**Available Fields**:
- `AUTOR`: Sender name
- `HORA`: Message time (HH:MM:SS)
- `FECHA`: Message date (DD/MM/YYYY)
- `CONTENIDO`: Message content (always enabled)

**Separator**: Each tag can have a custom separator (1-3 characters, default: `,,`)

**Key Methods**:
- `load()`: Load tags from JSON
- `save()`: Save tags to JSON
- `addTag(name, description, enabledFields, separator)`: Create tag (with sanitization)
- `removeTag(name)`: Delete tag
- `updateTag(name, updates)`: Update tag (with sanitization)
- `getTag(name)`: Get tag (case-insensitive)
- `getAllTags()`: Get all tags
- `detectTag(messageContent)`: Detect tag in message (case-insensitive, supports dynamic titles)
- `getTagMarkdownRelativePath(name, dynamicTitle?)`: Get relative path of markdown file (with optional dynamic title)

**Features**:
- Case-insensitive tag matching
- Input sanitization (tag names normalized to lowercase, alphanumeric + hyphens/underscores)

### 8. Tag Writer (`src/core/tags/writer.ts`)

**Class**: `TagWriter`

**Responsibility**: Write tagged messages to markdown files using `StorageInterface`.

**Markdown Format** (new-file mode):

In new-file mode, **only CONTENT is saved** (for Obsidian compatibility):

```markdown
Message content here
```

No metadata is included in new-file mode to ensure native compatibility with Obsidian and other PKM systems.

**Markdown Format** (append mode):
- Simple plain text lines: content appended directly without metadata
- Example: `vault/tags/idea.md` contains lines like:
  ```
  Message content line 1
  Message content line 2
  Message content line 3
  ```

**Features**:
- Uses `StorageInterface` to abstract storage (always local filesystem)
- Syncs to cloud after local save (if sync plugin configured)
- **File Modes**: Supports `append` (same file) and `new-file` (timestamped files) modes
- **Per-Tag File Mode**: Each tag can override the global file mode setting via `fileMode` property
- **Dynamic Titles**: Supports custom filenames via `tag+separator+title+space+content` format (only in new-file mode)
- **Obsidian Compatibility**: In `new-file` mode, only CONTENT is saved (no metadata)
- **Append Mode**: Content appended as plain lines without metadata
- **Feedback Messages**: Can send confirmation messages back to the group via callback

**File Paths**:
- **Append mode**: `VAULT_PATH/tags/{tag}.md` (flat file, content appended as plain lines)
- **New-file mode** (no dynamic title): `VAULT_PATH/tags/{tag}/{DD-MM-YYYY - HH-MM}.md`
- **Dynamic title** (new-file mode only): `VAULT_PATH/tags/{tag}/{title}.md` (e.g., `tags/idea/Christmas.md`)
- **Note**: Dynamic titles are ignored in append mode with a warning logged

**Append Mode Behavior**:
- Content is appended as plain text (no metadata fields)
- Dynamic titles are ignored with a warning
- All messages for a tag go to a single flat file

### 9. Group Writer (`src/core/groups/writer.ts`)

**Class**: `GroupWriter`

**Responsibility**: Write all messages from monitored groups to markdown files (always enabled).

**File Path**: `VAULT_PATH/groups/{group-name}.md`

**Features**:
- Captures all messages from monitored groups (always enabled)
- Markdown format with metadata (DATE, TIME, AUTHOR, CONTENT)
- Automatic deduplication (compares content, sender, timestamp)
- Sorted by timestamp (most recent first)
- Uses `StorageInterface` to abstract storage
- Syncs to cloud after local save (if sync plugin configured)

### 10. First Run Wizard (`src/cli/wizard.ts`)

**Class**: `FirstRunWizard`

**Responsibility**: Guide new users through initial setup.

**Features**:
- Runs automatically on first start (checks for `data/.wizard-completed` flag)
- Multi-step interactive guide:
  1. **Installation type**: `development` | **`minimal`**
     - **Development installation**: Full setup wizard with all configuration steps
     - **Minimal installation**: For development environments; assumes you will run `download-prod` next to mirror production. Skips all other steps and applies minimal config (no ingestor, no sync, no web).
  2. Messaging service selection and configuration (skip if minimal)
     - Plugin selection from registry
     - Automatic dependency installation
     - QR code generation and connection
  3. Add groups to monitor (after connecting)
  4. Create first tag (with file mode selection)
  5. Tag file modes (global settings: append/new-file)
  6. Dynamic titles (global setting)
  7. Web dashboard (optional)
  8. Cloud sync (optional, with OAuth setup for Google Drive)
- Can be skipped (Ctrl+C)
- Marks completion to avoid showing again
- Dynamically updates `.env` file (stored in `./data/.env` for Docker persistence)

### 11. Command Handler (`src/core/commands/handler.ts`)

**Class**: `CommandHandler`

**Responsibility**: Handle interactive menu commands via messaging platforms (e.g., WhatsApp).

**Features**:
- Detects "menu", "menu,,", or ",,menu" commands in monitored groups (case-insensitive)
- Provides interactive menu with options:
  - Generate QR / Connect
  - View connection status
  - Disconnect
  - List monitored groups
  - Add/remove groups
  - List tags
  - Create/delete tags
  - Configure file mode per tag (new-file/append/default)
  - Edit tag description
- Auto-closes after 2 minutes of inactivity
- State management per user/group
- Global exit: "0" or "exit" closes menu from any submenu
- Empty messages are ignored (not processed as commands)

### 12. Storage and Sync

#### Storage (`src/core/storage/`)

**Storage is always local filesystem** - handled by `LocalStorage` plugin.

**Interface**: `StorageInterface` (`src/core/storage/interface.ts`)

**Characteristics**:
- Uses local filesystem (`fs/promises`)
- Base path: `VAULT_PATH`
- Synchronous and fast operations
- Always available (no configuration required)
- **Note**: Storage is always local. Cloud sync is handled separately by sync plugins.

#### Cloud Sync (`src/core/sync/`)

**Cloud sync is handled separately** by sync plugins that implement `SyncInterface`.

**Interface**: `SyncInterface` (`src/core/sync/interface.ts`)

**Contract that all sync plugins must implement**:

```typescript
interface SyncInterface {
  initialize(): Promise<void>;                    // Initialize sync plugin
  isConfigured(): boolean;                       // Check if configured
  isConnected(): boolean;                        // Check if connected to cloud
  uploadFile(path: string, content: string): Promise<void>;  // Upload file (relative path)
  deleteFile(path: string): Promise<void>;       // Delete file (relative path)
  getConnectionStatus(): SyncStatus;             // Get connection status
  getSetupInstructions(): string;                // Human-readable setup instructions
  requiresConfiguration(): boolean;              // Whether manual configuration needed
}
```

**Architecture**:
- Plugin-based system (similar to ingestor plugins)
- Files are always saved locally first via `StorageInterface`
- Sync plugins upload files to cloud services after local save
- If sync fails, local storage continues working

**Available Plugins**:

1. **LocalSync** (`src/plugins/sync/local/index.ts`):
   - No-op plugin (no cloud sync)
   - Always available, always "connected" (but does nothing)

2. **GoogleDriveSync** (`src/plugins/sync/googledrive/index.ts`):
   - **OAuth Desktop App**: Uses your personal Google Drive account (15 GB free)
   - **Hybrid**: Always saves locally first, then syncs to Drive
   - **Auto-fallback**: If Drive fails, continues with local storage only
   - **Witral Folder**: Creates or finds "Witral" folder in Google Drive

**OAuth Flow** (`src/plugins/sync/googledrive/oauth.ts`):
1. Generate authorization URL (Desktop App flow)
2. User opens URL in browser
3. User authorizes and receives code (via redirect or manual entry)
4. Exchange code for tokens
5. Tokens saved in `VAULT_PATH/.google-oauth-tokens.json` (default: `./vault/.google-oauth-tokens.json`)
6. Auto-refresh of tokens

**Setup**: The first-run wizard guides users through complete OAuth setup:
- Credentials stored in `./data/googledrive/oauth-credentials.json` (Desktop App format)
- OAuth tokens stored separately in vault directory
- Can be configured via CLI menu or web dashboard

### 13. Web Dashboard (`src/web/`)

**Technology Stack**:
- **Hono**: Lightweight web framework
- **HTMX**: Dynamic updates without complex JavaScript
- **TailwindCSS (CDN)**: Styling
- **Server-Sent Events (SSE)**: Real-time logs and QR

**Main Routes**:
- `GET /web`: Main dashboard (HTML)
- `GET /web/api/health`: Health check endpoint
- `GET /web/api/status`: Connection status (JSON)
- `GET /web/api/status/html`: Connection status (HTML for HTMX)
- `GET /web/api/status/buttons`: Connection action buttons (HTML for HTMX)
- `GET /web/api/status/stream`: Real-time status updates (SSE)
- `POST /web/api/qr/generate`: Generate QR
- `POST /web/api/connect`: Attempt connection
- `GET /web/api/qr/stream`: QR stream (SSE)
- `GET /web/api/groups/available`: List available groups
- `POST /web/api/groups`: Add group
- `DELETE /web/api/groups/:name`: Remove group
- `GET /web/api/tags`: List tags
- `POST /web/api/tags`: Create tag
- `PUT /web/api/tags/:name/fields`: Update tag fields and separator
- `DELETE /web/api/tags/:name`: Delete tag
- `GET /web/api/tags/:name/markdown`: View tag markdown
- `GET /web/api/tag-modes/status`: Get tag file modes configuration
- `POST /web/api/tag-modes/toggle-file-mode`: Toggle file mode (append ↔ new-file)
- `POST /web/api/tag-modes/toggle-dynamic-titles`: Toggle dynamic titles
- `GET /web/api/wizard/status`: Check if wizard should run
- `POST /web/api/wizard/complete`: Mark wizard as completed
- `POST /web/api/wizard/set-ingestor`: Set ingestor plugin in wizard
- `GET /web/api/sync/status`: Cloud sync status
- `GET /web/api/oauth/authorize`: Get OAuth authorization URL
- `POST /web/api/oauth/callback`: Exchange code for tokens
- `POST /web/api/oauth/revoke`: Revoke OAuth tokens
- `GET /web/api/logs/stream`: Log stream (SSE)
- `GET /web/api/plugins/ingestors`: List available ingestor plugins

**Features**:
- Real-time connection status (via SSE and HTMX polling)
- QR code visualization (via SSE stream)
- Real-time logs via SSE
- Group and tag management (CRUD operations)
- Cloud sync configuration (OAuth setup and management)
- Tag markdown viewer
- First-run wizard (modal interface)
- Settings configuration (file modes, dynamic titles)
- Toast notifications for user feedback
- Responsive design with TailwindCSS

### 14. Config (`src/config/index.ts`)

**Responsibility**: Centralized configuration management.

**Technology**: Zod for validation and parsing.

**Configuration Variables**:

```typescript
{
  // Ingestor (platform-agnostic)
  INGESTOR_SESSION_PATH: string;           // default: './data/session'
  INGESTOR_ALLOWED_GROUPS: string[];       // default: []
  INGESTOR_QR_TIMEOUT: number;             // default: 60000
  INGESTOR_RECONNECT_INTERVAL: number;     // default: 5000
  INGESTOR_TYPE: string;                   // default: '' (required)
  
  // Vault
  VAULT_PATH: string;                      // default: './vault'
  VAULT_DATE_FORMAT: string;             // default: 'yyyy-MM-dd'
  VAULT_ENABLE_FRONTMATTER: boolean;       // default: true
  
  // Cloud Sync
  SYNC_TYPE: 'local' | 'googledrive';      // default: 'local'
  GOOGLE_OAUTH_CREDENTIALS_PATH?: string;  // optional
  
  // Feedback
  FEEDBACK_CONFIRMATIONS: boolean;          // default: true
  FEEDBACK_ERRORS: boolean;                 // default: true
  FEEDBACK_RATE_LIMIT: number;              // default: 1000
  
  // Logging
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  LOG_FORMAT: 'json' | 'pretty';
  
  // Memory
  NODE_MAX_OLD_SPACE: number;             // default: 1024
  
  // Timezone
  TZ: string;                              // default: 'UTC'
  
  // Web Dashboard
  WEB_ENABLED: boolean;                    // default: true
  WEB_PORT: number;                        // default: 3000
  WEB_HOST: string;                        // default: '0.0.0.0'
  
  // Tag File Modes
  TAG_FILE_MODE: 'append' | 'new-file';    // default: 'new-file'
  TAG_DYNAMIC_TITLES: boolean;              // default: true
}
```

**Usage**: `getConfig()` returns a typed object with all configurations.

### 15. Logger (`src/utils/logger.ts`)

**Technology**: Pino

**Features**:
- JSON or Pretty format according to `LOG_FORMAT`
- Configurable levels according to `LOG_LEVEL`
- Structured logging for better parsing
- SSE integration for web dashboard

---

## 🔄 Data Flows

### Initialization Flow

```
1. index.ts executes
   ↓
  2. GroupManager.load() → Reads ./data/monitored-groups.json
   ↓
3. TagManager.load() → Reads ./data/tags.json
   ↓
4. createStorage() → Creates local storage (always LocalStorage)
   ↓
5. storage.initialize() → Initializes local storage
   ↓
6. createSync() → Creates sync plugin based on SYNC_TYPE
   ↓
7. sync.initialize() → Initializes sync plugin (local or cloud)
   ↓
8. createIngestor() → Loads plugin based on INGESTOR_TYPE
   ↓
9. ingestor.initialize() → Initializes plugin
   ↓
10. Configure TagManager in ingestor (if supports commands)
   ↓
11. ingestor.start() → Attempts to connect automatically (non-blocking, runs in background)
   ↓
12. WitralCLI.start() → Starts CLI
    - Checks if first-run wizard should run
    - If yes → Runs wizard, then shows menu
    - If no → Shows menu directly
   ↓
13. startWebServer() → Starts web server (if WEB_ENABLED and not in CLI-only mode)
   ↓
14. If credentials exist → Connects automatically
    If not → Waits for user to generate QR
```

### Message Reception Flow

```
1. Plugin receives message (e.g., Baileys events)
   ↓
2. Filters: only monitored groups
   ↓
3. Filters: ignores historical messages (> 2 min old)
   ↓
4. Extracts: group, sender, time, content
   ↓
5. Creates Message object
   ↓
6. Calls onMessage callbacks
   ↓
7. CLI receives → TagWriter.processMessage()
   ↓
8. TagWriter detects tag (if applicable)
   ↓
9. If has tag → Writes to markdown using StorageInterface
   ↓
10. GroupWriter.writeMessage() → Saves all messages to group files
    ↓
11. Storage saves:
    - LocalStorage: Saves to filesystem
    ↓
12. Sync uploads (if configured):
    - LocalSync: No-op (no cloud sync)
    - GoogleDriveSync: Uploads to Google Drive
   ↓
13. CLI displays message in console
   ↓
14. If message is "menu" or "menu,," → CommandHandler processes interactive menu
```

### Tag Detection Flow

```
1. Message arrives with format "<separator>TAG content"
   ↓
2. TagManager.detectTag() analyzes content (supports dynamic titles if enabled)
   ↓
3. Searches for tag by name (case-insensitive)
   ↓
4. Verifies tag separator (must be at start of message)
   ↓
5. If found → Extracts { tagName, content }
   ↓
6. TagWriter processes message (appendToTagFile or saveToNewFile based on TAG_FILE_MODE)
   ↓
7. Reads existing file using StorageInterface
   ↓
8. Adds message (avoids duplicates)
   ↓
9. Sorts by timestamp descending (most recent first)
   ↓
10. Generates markdown with structured format
   ↓
11. Writes file using StorageInterface.saveFile() (local storage)
   ↓
12. Sync uploads (if configured):
    - LocalSync: No-op (no cloud sync)
    - GoogleDriveSync: Uploads to Google Drive
```

### Google Drive OAuth Flow

```
1. User clicks "Connect Cloud Sync" in dashboard
   ↓
2. GET /web/api/oauth/authorize
   ↓
3. System generates authorization URL
   ↓
4. Dashboard displays URL and code input field
   ↓
5. User opens URL in browser
   ↓
6. User authorizes in Google
   ↓
7. Google displays authorization code
   ↓
8. User copies code and pastes in dashboard
   ↓
9. POST /web/api/oauth/callback with code
   ↓
10. System exchanges code for tokens
   ↓
11. Tokens saved in VAULT_PATH/.google-oauth-tokens.json (default: ./vault/.google-oauth-tokens.json)
   ↓
12. sync.reinitializeDrive() → Reinitializes with OAuth
   ↓
13. GoogleDriveSync uses OAuth (your personal account)
```

### Group Management Flow

```
User selects option 4 (Groups)
   ↓
CLI.manageGroups() → isInSubMenu = true
   ↓
Shows list of monitored groups
   ↓
User selects option (1-3)
   ↓
If option 1 (Add):
  - ingestor.listGroups() → Gets available groups
  - Shows numbered list
  - User selects number
  - groupManager.addGroup() → Saves to JSON
  - isInSubMenu = false → Returns to main menu

If option 2 (Remove):
  - Shows monitored groups
  - User selects number
  - groupManager.removeGroup() → Updates JSON
  - isInSubMenu = false → Returns to main menu
```

### Tag Management Flow

```
User selects option 5 (Tags)
   ↓
CLI.manageTags() → isInSubMenu = true
   ↓
Shows list of tags
   ↓
User selects option (1-4)
   ↓
If option 1 (Create):
  - Asks for name (sanitized)
  - Asks for file mode (new-file/append/default)
  - tagManager.addTag() → Saves to JSON (with fileMode if specified)
  - isInSubMenu = false

If option 2 (Delete):
  - Shows tags
  - User selects number
  - Asks if delete markdown file
  - tagManager.removeTag()
  - If yes → tagManager.deleteTagMarkdown() using StorageInterface
  - isInSubMenu = false

If option 3 (Configure file mode):
  - Shows tags
  - User selects number
  - Shows current file mode
  - User selects new file mode (new-file/append/default)
  - tagManager.updateTag() → Updates fileMode property
  - isInSubMenu = false
```

---

## 🔌 Plugin System

### Creating a New Ingestor Plugin

**Step 1**: Create structure in `src/plugins/{plugin-name}/`

```
src/plugins/{plugin-name}/
├── index.ts          # Implementation
└── README.md         # Documentation (optional)
```

**Step 2**: Implement `IngestorInterface`

**Step 3**: Register in Plugin Registry (`src/plugins/registry.json`)

Add your plugin to the `ingestors` section:

```json
{
  "ingestors": {
    "yourplugin": {
      "name": "Your Plugin Name",
      "description": "Plugin description",
      "module": "../../plugins/yourplugin/index.js",
      "dependencies": ["package1", "package2"],
      "optional": true
    }
  }
}
```

**Step 4**: Export your plugin class (must match naming convention)

Your plugin should export a class named `{PluginName}Ingestor` or use default export:

```typescript
export class YourPluginIngestor implements IngestorInterface {
  // ... implementation
}
```

**Step 5**: Configure the plugin

You can configure the plugin in two ways:

**Option A: Via CLI (Recommended)**:
1. Access CLI menu → **Messaging Service** → **Install and Configure Plugin**
2. Select your plugin from the list
3. The CLI will automatically install dependencies and configure the plugin

**Option B: Manual Configuration**:
1. Set environment variable `INGESTOR_TYPE=yourplugin` in `.env` file
2. Install dependencies using plugin manager:

```bash
npm run plugin:install ingestor yourplugin
```

**Note**: The factory uses dynamic discovery from the registry, so you don't need to modify `factory.ts`.

### Creating a New Sync Plugin

**Step 1**: Create structure in `src/plugins/sync/{sync-name}/`

**Step 2**: Implement `SyncInterface`

**Step 3**: Register in Plugin Registry (`src/plugins/registry.json`)

Add your plugin to the `sync` section:

```json
{
  "sync": {
    "yoursync": {
      "name": "Your Sync Name",
      "description": "Sync plugin description",
      "module": "../../plugins/sync/yoursync/index.js",
      "dependencies": ["package1", "package2"],
      "optional": true
    }
  }
}
```

**Step 4**: Export your plugin class (must match naming convention)

Your plugin should export a class named `{PluginName}Sync` or use default export:

```typescript
export class YourSyncSync implements SyncInterface {
  // ... implementation
}
```

**Step 5**: Configure environment variable `SYNC_TYPE=yoursync`

**Step 6**: Install dependencies using plugin manager:

```bash
npm run plugin:install sync yoursync
```

**Note**: The factory uses dynamic discovery from the registry, so you don't need to modify `factory.ts`.

### Plugin Management CLI

Witral includes a plugin management CLI for easy installation of plugin dependencies:

**List available plugins**:
```bash
npm run plugin:list              # List all plugins
npm run plugin:list ingestor     # List only ingestor plugins
npm run plugin:list sync         # List only sync plugins
```

**Install plugin dependencies**:
```bash
npm run plugin:install ingestor baileys
npm run plugin:install sync googledrive
```

This automatically installs all required dependencies for the specified plugin, eliminating the need to manually run `npm install` with the correct packages.

---

## 💾 Storage System

### StorageInterface

All storage implementations must implement:

```typescript
interface StorageInterface {
  initialize(): Promise<void>;
  saveFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  deleteFile(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
}
```

### LocalStorage

- **Location**: `src/plugins/storage/local/index.ts`
- **Base Path**: `VAULT_PATH` (default: `./vault`)
- **Characteristics**: Synchronous operations, always available
- **Note**: Storage is always local. Cloud sync is handled separately by sync plugins.

---

## 📊 Group Management

Monitored groups are saved in `./data/monitored-groups.json`.

**Structure**:
```json
[
  {
    "name": "Group Name",
    "jid": "1234567890-1234567890@g.us"
  }
]
```

**Operations**:
- Add: `groupManager.addGroup(name, jid?)`
- Remove: `groupManager.removeGroup(name)`
- List: `groupManager.getAllGroups()`
- Check: `groupManager.isMonitored(name)`

---

## 🏷️ Tag System

### Tagged Message Format

```
<separator>TAG content
```

**Example**:
```
,,idea Build a new feature
```

The separator **must be at the beginning** of the message.

### Tag Configuration

```json
{
  "name": "idea",
  "description": "Ideas and thoughts",
  "enabledFields": ["AUTOR", "HORA", "FECHA", "CONTENIDO"],
  "separator": ",,",
  "fileMode": "new-file",  // optional: overrides global TAG_FILE_MODE
  "createdAt": "ISO-8601 timestamp"
}
```

### Available Fields

- `AUTOR`: Sender name
- `HORA`: Message time (HH:MM:SS)
- `FECHA`: Message date (DD/MM/YYYY)
- `CONTENIDO`: Message content (always enabled)

### Separator

- Each tag can have a custom separator
- Length: 1-3 characters
- Default: `,,`
- Content after separator is captured (ignoring leading spaces)
- Separator must be at the **start** of the message

### Tag Features

- **Case-Insensitive**: Tag names are normalized (e.g., "idea", "IDEA", "Idea" all work)
- **Input Sanitization**: Tag names are sanitized (alphanumeric + hyphens/underscores only)
- **Automatic Organization**: Messages sorted by date (most recent first)
- **Deduplication**: Prevents duplicate messages in tag files

---

## 🖥️ Command Line Interface (CLI)

### Main Menu

```
📱 Witral - Universal Ingestion Framework [✅ Connected]
─────────────────────────────────────────────────────
1) Messaging Service  |  2) Groups (2)  |  3) Tags (3)  |  4) Settings  |  5) Visit Dashboard  |  6) Exit
─────────────────────────────────────────────────────
>
```

**Note**: Menu options are dynamic based on ingestor capabilities and configuration.

### Messaging Service Menu

**When No Plugin Configured**:
- **1) Install and Configure Plugin**: Install and configure a messaging service plugin (e.g., Baileys for WhatsApp)
  - Lists all available plugins from the registry
  - Automatically installs plugin dependencies
  - Configures the plugin in `.env` file
  - Reloads the ingestor without requiring restart
- **2) Back to main menu**: Return to main menu

**When Disconnected (Plugin Configured)**:
- **1) Connect / Generate QR**: Connect to messaging service or generate QR code (dynamic based on plugin requirements)
- **2) View connection instructions**: Show connection instructions
- **3) Clear Session**: Delete session files to force regeneration
- **4) Change Plugin**: Install and configure a different plugin (replaces current plugin)
- **5) Back to main menu**: Return to main menu

**When Connected**:
- **1) Disconnect**: Disconnect from messaging service
- **2) View connection details**: Show connection status and details
- **3) Back to main menu**: Return to main menu

**Note**: Plugin installation and configuration can be done entirely from the CLI. No need to manually edit `.env` files.

### Settings Menu

- **1) Configure Tag File Modes**: Configure global file mode settings (new-file/append) and dynamic titles
- **2) Configure Cloud Sync**: Configure cloud sync (Google Drive, etc.)
  - When Google Drive is configured:
    - **1) Configure Google Drive OAuth**: Setup or re-authorize OAuth credentials
    - **2) View connection status**: Show OAuth and sync status
    - **3) Back to settings**: Return to settings menu
  - When Google Drive OAuth is configured:
    - **1) Re-authorize**: Configure new OAuth credentials
    - **2) View authorization status**: Show OAuth status
    - **3) Clear OAuth Tokens**: Delete OAuth tokens to force re-authorization
    - **4) Back to cloud sync menu**: Return to cloud sync menu
- **3) View current configuration**: Display current settings
- **4) Back to main menu**: Return to main menu

### Features

- Nested menus with `isInSubMenu` flag
- Numeric selection
- Real-time message display
- Operation confirmations
- Session and token management (new)

---

## 🌐 Web Dashboard

⚠️ **Development Status**: Web dashboard development is currently **paused** and planned for future releases. The dashboard is available in the codebase but **not recommended for use** at this time. Please use the CLI interface for all configuration and management tasks.

### Access

- `http://localhost:3000/web` (if running locally)
- `http://YOUR-SERVER-IP:3000/web` (if running on a server)

**Note**: The dashboard functionality is incomplete and may have issues. Use the CLI interface instead.

### Features

- Real-time connection status
- QR code visualization
- Real-time logs via SSE
- Group and tag management
- Cloud sync configuration (OAuth)
- Tag markdown viewer
- First-run wizard banner
- Settings configuration

### Technologies

- **Hono**: Lightweight web framework
- **HTMX**: Dynamic updates
- **TailwindCSS (CDN)**: Styling
- **Server-Sent Events**: Real-time logs and QR

### Security

⚠️ **Important**: The web dashboard **does not include authentication** by default. This is intentional to simplify usage.

**Local Access** (localhost):
- Safe if only accessed from your local machine (`localhost`)
- No additional security measures required

**Network Access** (server/remote):
- The dashboard is accessible to anyone with network access to your server
- **You must protect the dashboard yourself** using one of these methods:
  - **Firewall**: Restrict access to port 3000 (or configured `WEB_PORT`) to specific IP addresses
  - **Reverse Proxy with Authentication**: Use nginx/Traefik with HTTP Basic Auth or token-based authentication
  - **VPN/Tunnel**: Access the server only through a VPN or SSH tunnel
  - **HTTPS**: Always use HTTPS in production (via reverse proxy with SSL certificate)

**Security Recommendations for Network Access**:

1. **Firewall Configuration** (Recommended for quick setup):
   ```bash
   # Allow only your IP (replace YOUR_IP with your actual IP)
   sudo ufw allow from YOUR_IP to any port 3000
   sudo ufw deny 3000
   ```

2. **Nginx Reverse Proxy with Basic Auth** (Recommended for network deployments):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location /web {
           auth_basic "Witral Dashboard";
           auth_basic_user_file /etc/nginx/.htpasswd;
           
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
   Create password file: `htpasswd -c /etc/nginx/.htpasswd username`

3. **SSH Tunnel** (Simple and secure):
   ```bash
   ssh -L 3000:localhost:3000 user@your-server
   ```
   Then access via `http://localhost:3000/web`

**Note**: Witral is released as-is for open-source use. Security in server deployments is the responsibility of the user installing the software.

---

## ⚙️ Configuration

See `env.example` for all available variables.

### Main Variables

- `SYNC_TYPE`: Cloud sync plugin (`local`, `googledrive`)
- `INGESTOR_TYPE`: Ingestor plugin type (e.g., `baileys`)
  - **Note**: Can be configured via CLI menu → Messaging Service → Install and Configure Plugin (no manual `.env` editing required)
- `WEB_ENABLED`: Enable web dashboard (not recommended - development paused)
- `WEB_PORT`: Dashboard port
- `TZ`: Timezone

---

## 🐳 Docker and Deployment

### Docker Compose

Single `docker-compose.yml` file for all profiles:

- **Production**: Local build (optimized)
- **Development**: Local build with hot-reload
- **Production Testing**: Local build without hot-reload

### Commands

```bash
# Production
docker compose up -d

# Development
BUILD_TARGET=development docker compose up --build

# View logs
docker compose logs -f witral

# Restart
docker compose restart witral
```

---

## 🛠️ Development Scripts

### reset-dev.sh

**Location**: `scripts/reset-dev.sh`

**Purpose**: Resets the system to initial state for testing first-run experience from scratch.

**What it removes**:
- `data/` directory (all user data)
  - Monitored groups (`monitored-groups.json`)
  - Tags (`tags.json`)
  - Generated markdown files (`VAULT_PATH/tags/`, `VAULT_PATH/groups/`, default: `./vault/tags/`, `./vault/groups/`)
  - Ingestor session data (`session/`)
  - **Google Drive OAuth tokens** (`VAULT_PATH/.google-oauth-tokens.json`, default: `./vault/.google-oauth-tokens.json`)
  - **Google Drive OAuth credentials** (`googledrive/oauth-credentials.json`)
  - Wizard completion flag (`.wizard-completed`)
- `dist/` directory (build artifacts)
- `.env` file (user configuration)
- Cloud sync credentials (`data/googledrive/oauth-credentials.json`)
- Temporary files (`*.log`, `*.tmp`, `*.temp`, `*.tar.gz`, `*.zip`)

**Usage**:

```bash
# Run the script
./scripts/reset-dev.sh
```

**Flow**:
1. Requests user confirmation
2. Stops all running Witral processes
3. Removes all mentioned files and directories
4. Shows summary of what was removed
5. Provides instructions for next steps

**Important**: This script removes **all** user data, including:
- Cloud sync configuration (OAuth tokens, credentials)
- Monitored groups
- Created tags
- Generated markdown files
- Wizard configuration

After running this script, the system is in a completely clean state, as if it were the first time running. Useful for:
- Testing first-run flow
- Cleaning repository before commit
- Resetting development environment for testing

### download-prod.sh

**Location**: `scripts/download-prod.sh`

**Purpose**: Mirror production Witral configurations and content to local environment. Downloads selective data from a remote server via SSH/rsync, preserving local sessions and OAuth tokens.

**Typical flow** (local dev mirror of production):
1. Clone repo (`git clone https://github.com/kirlts/witral`), run `docker compose run --service-ports --build witral`
2. In the wizard, choose **Step 1 → 3) Minimal installation**
3. Exit (Ctrl+C), run `docker compose down`
4. Run `./scripts/download-prod.sh --ip PROD_IP --key /path/to/key.key`
5. Run `docker compose up -d`

**Usage**:

```bash
./scripts/download-prod.sh --ip IP_ADDRESS --key PRIVATE_KEY_PATH [--user USER] [--port PORT] [--force]
```

**Options**: `--ip`, `--key` (required); `--user` (default: ubuntu), `--port` (default: 22), `--force` (skip confirmation).

**What's downloaded**:
- ✓ `data/.env`, `tags.json`, `monitored-groups.json`, `.wizard-completed`
- ✓ `vault/tags/`, `vault/groups/` (markdown content)
- ✓ `data/logs/` (if exists)

**What's preserved (NOT downloaded)**:
- ✓ `data/session/` (local messaging service sessions maintained)
- ✓ `vault/.google-oauth-tokens.json` (local OAuth tokens maintained)
- ✓ `data/googledrive/` (local OAuth credentials maintained)

**Behavior**: Creates a local backup before overwriting, then selectively downloads configurations and content from `~/witral` on the remote host. Adjusts permissions and restarts the local container.

**Regenerating sessions/tokens**: If you need to regenerate sessions or tokens after download:
- **Messaging Service Session**: CLI menu → Messaging Service → Clear Session
- **OAuth Tokens**: CLI menu → Settings → Configure Cloud Sync → Clear OAuth Tokens

### create-backup.sh

**Location**: `scripts/create-backup.sh`

**Purpose**: Creates selective backups of configurations and content. Excludes messaging service sessions and OAuth tokens to prevent session conflicts.

**Usage**:

```bash
./scripts/create-backup.sh [--output-dir DIR] [--keep N]
```

**Options**: `--output-dir` (default: `./backups`), `--keep` (default: 10 backups to retain).

**What's backed up**:
- ✓ `data/.env`, `tags.json`, `monitored-groups.json`, `.wizard-completed`
- ✓ `vault/tags/`, `vault/groups/` (markdown content)
- ✓ `data/logs/` (if exists)

**What's excluded**:
- ✗ `data/session/` (messaging service sessions - must be regenerated)
- ✗ `vault/.google-oauth-tokens.json` (OAuth tokens - must be regenerated)
- ✗ `data/googledrive/` (OAuth credentials - must be regenerated)

**Why exclude sessions/tokens**: Messaging services and OAuth providers often have protections against duplicate sessions. Restoring sessions from backup can cause conflicts, disconnections, or security issues. It's safer to regenerate them manually after restore.

### restore-from-backup.sh

**Location**: `scripts/restore-from-backup.sh`

**Purpose**: Restores configurations and content from a backup. Preserves local sessions and OAuth tokens (does not restore them from backup).

**Usage**:

```bash
./scripts/restore-from-backup.sh [--backup-path PATH] [--force]
```

**Options**: `--backup-path` (specific backup to restore, default: latest), `--force` (skip confirmation prompts).

**What's restored**:
- ✓ `data/.env`, `tags.json`, `monitored-groups.json`, `.wizard-completed`
- ✓ `vault/tags/`, `vault/groups/` (markdown content)
- ✓ `data/logs/` (if exists)

**What's preserved (NOT restored from backup)**:
- ✓ `data/session/` (local sessions maintained)
- ✓ `vault/.google-oauth-tokens.json` (local OAuth tokens maintained)
- ✓ `data/googledrive/` (local OAuth credentials maintained)

**After restore**: You must regenerate sessions/tokens if needed:
- **Messaging Service Session**: CLI menu → Messaging Service → Clear Session
- **OAuth Tokens**: CLI menu → Settings → Configure Cloud Sync → Clear OAuth Tokens

### Managing Sessions and Tokens via CLI

The CLI provides options to regenerate sessions and tokens without restarting the entire system:

**Clear Messaging Service Session**:
1. Access CLI menu → **Messaging Service**
2. When disconnected, select **3) Clear Session**
3. Confirm the action
4. Session files will be deleted
5. Return to menu and select **1) Connect** or **1) Generate QR** to create a new session

**Clear OAuth Tokens**:
1. Access CLI menu → **Settings** → **Configure Cloud Sync**
2. If Google Drive is configured, select **3) Clear OAuth Tokens**
3. Confirm the action
4. OAuth tokens will be deleted (credentials preserved)
5. Return to menu and re-authorize OAuth to generate new tokens

**Benefits**: This allows you to:
- Regenerate sessions/tokens without restarting development
- Fix connection issues without full system reset
- Migrate between machines easily (configurations restore, sessions regenerate)

---

## 📄 Data Format

### Tag Markdown (New-File Mode)

In new-file mode, **only the message content is saved** (no metadata) for Obsidian compatibility:

```markdown
Message content here
```

Each message creates a separate file. No metadata fields (DATE, TIME, AUTHOR) are included to ensure native compatibility with Obsidian and other PKM systems.

### Tag Markdown (Append Mode)

Simple plain text format - content appended line by line without metadata:

```
Message content line 1
Message content line 2
Message content line 3
```

### Groups JSON

```json
[
  {
    "name": "Group Name",
    "jid": "1234567890-1234567890@g.us"
  }
]
```

### Tags JSON

```json
[
  {
    "name": "idea",
    "description": "Ideas and thoughts",
    "enabledFields": ["AUTOR", "HORA", "FECHA", "CONTENIDO"],
    "separator": ",,",
    "fileMode": "new-file",  // optional: "new-file" | "append" | undefined (uses global TAG_FILE_MODE)
    "createdAt": "ISO-8601 timestamp"
  }
]
```

---

## 🤖 LLM Development Guide

### When Developing with Witral

1. **Modularity**: The core must NOT depend on specific plugins
2. **Interfaces**: Use `IngestorInterface`, `StorageInterface`, and `SyncInterface` for new plugins
3. **Persistence**: Use JSON for simple data
4. **Configuration**: Add new options in `src/config/index.ts`
5. **CLI**: Respect the flag system (`isInSubMenu`)
6. **Format**: Maintain consistent markdown format
7. **Storage**: Always use `StorageInterface`, never `fs` directly
8. **Sync**: Use `SyncInterface` for cloud synchronization, not storage

### When Adding Functionality

1. **Identify Layer**: Core, Plugin, CLI, Web, Config?
2. **Maintain Separation**: Don't couple components
3. **Document**: Update this file
4. **Testing**: Add tests if possible
5. **Backward Compatibility**: Don't break existing formats

### When Debugging

1. **Logs**: Use `logger` from `src/utils/logger.ts`
2. **Levels**: `debug` for development, `info` for production
3. **Format**: `pretty` for development, `json` for production
4. **State**: Verify flags (`isInSubMenu`, `connectionState`)
5. **Persistence**: Verify JSON files in `./data/`
6. **Storage**: Verify that `StorageInterface` is used correctly
7. **Sync**: Verify that `SyncInterface` is used correctly

### Important Paths

- **Entry Point**: `src/index.ts`
- **CLI**: `src/cli/index.ts`
- **Web Dashboard**: `src/web/`
- **Ingestor Interface**: `src/core/ingestor/interface.ts`
- **Storage Interface**: `src/core/storage/interface.ts`
- **Sync Interface**: `src/core/sync/interface.ts`
- **Baileys Plugin**: `src/plugins/baileys/index.ts`
- **Google Drive Sync**: `src/plugins/sync/googledrive/`
- **Group Manager**: `src/core/groups/index.ts`
- **Tag Manager**: `src/core/tags/index.ts`
- **Tag Writer**: `src/core/tags/writer.ts`
- **Group Writer**: `src/core/groups/writer.ts`
- **Command Handler**: `src/core/commands/handler.ts`
- **First Run Wizard**: `src/cli/wizard.ts`
- **Sanitization Utils**: `src/utils/sanitize.ts`
- **Config**: `src/config/index.ts`

### Data Files

- **Groups**: `./data/monitored-groups.json`
- **Tags**: `./data/tags.json`
- **Sessions**: `./data/session/` (plugin-specific structure)
- **Tag Markdown**: `VAULT_PATH/tags/{tag}.md` (default: `./vault/tags/{tag}.md`)
- **Group Markdown**: `VAULT_PATH/groups/{group-name}.md` (default: `./vault/groups/{group-name}.md`, always enabled)
- **OAuth Tokens**: `VAULT_PATH/.google-oauth-tokens.json` (default: `./vault/.google-oauth-tokens.json`)
- **Wizard Flag**: `./data/.wizard-completed`
