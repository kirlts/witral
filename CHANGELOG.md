# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-23

### Changed
- Version bumped to 1.0.0 for first stable release
- Enhanced .gitignore with critical security patterns for sessions and credentials

## [0.1.0] - 2026-01-23

### Added
- Initial open source release
- Modular ingestion framework for capturing ephemeral messages from messaging platforms
- Support for transforming messages into structured Markdown files
- Interactive CLI with nested menus and first-run wizard
- Web dashboard for configuration and real-time monitoring
- Plugin system with interfaces for Ingestor, Storage, and Sync
- Baileys plugin for WhatsApp integration (optional dependency)
- Google Drive sync plugin with OAuth support (optional dependency)
- Local storage plugin (always available)
- Tag system with support for dynamic titles and file modes (append/new-file)
- Group management for monitoring specific chat groups
- Automatic message capture from monitored groups
- Interactive menu system accessible via messaging platforms (`,,menu`)
- Docker support with multi-stage builds for development and production
- Helper scripts for setup, backup, restore, and maintenance
- Comprehensive technical documentation (witral.md)
- Support for Personal Knowledge Management (PKM) tools (Obsidian, Logseq, etc.)

### Features
- Fire-and-forget capture syntax: `,,tag content`
- Dynamic title capture: `,,tag,,Title content`
- Append mode for continuous logging
- Automatic reconnection handling
- Cloud sync with local-first approach
- Real-time message processing
- Command system via messaging platforms
- Health checks and monitoring
- Resource-optimized for constrained environments
