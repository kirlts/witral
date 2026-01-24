# Witral

**Witral** is a self-hosted, modular ingestion framework designed to capture ephemeral data from messaging platforms and transform it into structured Markdown files.

It acts as a bridge between high-velocity communication streams (messaging services) and permanent storage systems (local file systems, Cloud Sync), creating a "fire-and-forget" pipeline for capturing information without context switching.

While agnostic in design, the default configuration serves as robust infrastructure for Personal Knowledge Management (PKM) workflows (Obsidian, Logseq) by turning chat groups into command-line interfaces for your notes.

Both the Baileys plugin (for WhatsApp integration) and the Google Drive storage plugin (for cloud sync) are included as optional modules. 


## Core Features

- **⚡ Fire-and-Forget Capture:** Uses a low-friction double-comma syntax (`,,tag`) to route messages from chat directly to specific folders.
- **Platform Agnostic:** Modular architecture separates Ingestion (Source) from Storage (Destination).
  - *Included Source Plugin:* WhatsApp (via Baileys).
  - *Included Storage Plugins:* Local File System, Google Drive.
- **Deterministic Output:** Generates standard Markdown files.
- **Self-Hosted & Private:** Runs entirely in a Docker container on your machine or server.

## Prerequisites

- **Docker** installed and running.
  - [Linux](https://docs.docker.com/engine/install/)
  - [macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Windows](https://docs.docker.com/desktop/install/windows-install/)

The installation script (`start.sh`) will automatically verify your Docker environment before proceeding.

## Quick Start

Witral offers an interactive wizard for the initial setup.

1. **Clone the repository:**

   ```bash
   git clone https://github.com/kirlts/witral
   cd witral
   ```

2. **Make the script executable:**

   ```bash
   chmod +x scripts/start.sh
   ```

3. **Run the installer:**

   ```bash
   ./scripts/start.sh
   ```

### What happens next?

The script will launch the **Interactive Wizard**, guiding you through:

1. **Installing and configuring a Messaging Service:** (e.g., scanning the QR code to authenticate whatsapp in the case of Baileys).
2. **Group Configuration:** Selecting which chat groups Witral should monitor.
3. **Tag Setup:** Defining your routing tags (e.g., `note`, `todo`, `project`).
4. **Cloud Sync:** (Optional) Authenticating with a Cloud Sync service (Google Drive support included).

Once completed, the service will automatically start in the background.

## Usage

### Capture Syntax

Witral listens for the `,,` trigger by default in monitored groups.

#### 1. Basic Capture (New File)

Creates a timestamped file in the tag's folder.

- **Input:** `,,idea Rewrite the ingestor logic`
- **Output:** `vault/tags/idea/27-10-2023 - 14-30.md` containing the text (format: `DD-MM-YYYY - HH-MM.md`).

#### 2. Dynamic Title Capture

Creates a file with a specific filename.

- **Input:** `,,idea,,Architecture Rewrite the ingestor logic`
- **Output:** `vault/tags/idea/Architecture.md`

#### 3. Append Mode

If a tag is configured for "Append Mode", messages are added to a single file instead of creating new ones.

- **Input:** `,,log Server restarted`
- **Output:** Appends line to `vault/tags/log.md`.

### Interactive Menu via Messaging

Witral provides an **interactive menu system** directly accessible from your messaging platform (WhatsApp, etc.). This allows you to manage the system without accessing the server or CLI.

**Activating the Menu:**

Send `,,menu` in any monitored group (case-insensitive).

**Main Menu Options:**

1. **QR / Connect** - Generate QR code or connect to messaging service
2. **Status** - View connection status, monitored groups count, and tags count
3. **Disconnect** - Disconnect from the messaging service
4. **Groups** - Manage monitored groups (list, add, remove)
5. **Tags** - Manage tags (create, delete, configure file mode, edit description)
6. **Exit** - Close the menu

Type `0` or `exit` from any submenu to close the menu immediately.

Empty messages are ignored (not processed as commands) and continue normal message categorization.

## Management & CLI

Once the container is running, you can interact with the system using the built-in CLI tool.

**Access the CLI menu:**

```bash
docker exec -it witral node dist/index.js
```

*Use this to add new groups, manage tags, or re-authenticate plugins.*

**View real-time logs:**

```bash
docker compose logs -f witral
```

**Restart the service:**

```bash
docker compose restart witral
```

**Stop the service:**

```bash
docker compose down
```

## Development & Maintenance

### Resetting the Environment

If you need to clean the installation (e.g., to fix a broken configuration), use the reset script.

**Warning:** This deletes all configuration data (sessions, groups, tags) but **preserves your `vault/` (generated Markdown files).**

```bash
chmod +x scripts/reset-dev.sh
./scripts/reset-dev.sh
```

## Project Structure

```text
witral/
├── data/               # Persisted configuration (groups, tags, sessions) - gitignored
├── vault/              # Default output directory for Markdown files
├── scripts/            # Helper scripts (start, reset, backup)
├── src/
│   ├── core/           # Core logic
│   ├── plugins/        # Modular plugins
│   └── cli/            # Interactive command line interface
└── docker-compose.yml
```

## Documentation

- **Repository**: [https://github.com/kirlts/witral](https://github.com/kirlts/witral)
- **[README.md](README.md)** - This file: Quick start guide and user documentation
- **[witral.md](witral.md)** - Complete technical documentation: Architecture, data flows, plugin system, and development guide

For detailed technical information, architecture diagrams, and development guidelines, see [witral.md](witral.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
