// Witral - Interactive CLI
import readline from 'readline';
import { existsSync } from 'fs';
import { IngestorInterface } from '../core/ingestor/interface.js';
import { GroupManager } from '../core/groups/index.js';
import { TagManager, TagField } from '../core/tags/index.js';
import { TagWriter } from '../core/tags/writer.js';
import { GroupWriter } from '../core/groups/writer.js';
import { StorageInterface } from '../core/storage/interface.js';
import { SyncInterface } from '../core/sync/interface.js';
import { logger } from '../utils/logger.js';
import { broadcastSSE } from '../web/sse.js';
import { updateWebServerSync } from '../web/index.js';
import { getConfig, _clearCache } from '../config/index.js';
import { FirstRunWizard } from './wizard.js';
import { getAvailableIngestors, getIngestorMetadata, getAvailableSyncPlugins, getSyncMetadata } from '../core/plugins/registry.js';
import { getAuthorizationUrl, exchangeCodeForTokens, isOAuthConfigured, hasOAuthTokens } from '../plugins/sync/googledrive/oauth.js';
import { createSync } from '../core/sync/factory.js';
import { installPlugin } from './plugin-installer.js';
import { getEnvPath } from '../config/index.js';

export class WitralCLI {
  private rl: readline.Interface;
  private ingestor: IngestorInterface;
  private groupManager: GroupManager;
  private tagManager: TagManager;
  private tagWriter: TagWriter;
  private groupWriter: GroupWriter;
  private storage: StorageInterface;
  private sync: SyncInterface;
  private config = getConfig();
  private isInSubMenu: boolean = false; // Flag to indicate if we're in a submenu

  private currentMessageGroup: string | null = null; // Track current message group for feedback

  constructor(ingestor: IngestorInterface, groupManager: GroupManager, tagManager: TagManager, storage: StorageInterface, sync: SyncInterface) {
    this.ingestor = ingestor;
    this.groupManager = groupManager;
    this.tagManager = tagManager;
    this.storage = storage;
    this.sync = sync;
    
    // Create feedback callback to send messages to the group
    const feedbackCallback = async (feedbackMessage: string) => {
      if (this.currentMessageGroup && this.ingestor.isConnected()) {
        try {
          // Check if ingestor supports sendMessageToGroup
          if ('sendMessageToGroup' in this.ingestor && typeof (this.ingestor as any).sendMessageToGroup === 'function') {
            await (this.ingestor as any).sendMessageToGroup(this.currentMessageGroup, feedbackMessage);
          }
        } catch (error) {
          logger.debug({ error }, 'Could not send feedback message');
        }
      }
    };
    
    this.tagWriter = new TagWriter(tagManager, storage, sync, feedbackCallback);
    this.groupWriter = new GroupWriter(storage, sync);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      removeHistoryDuplicates: true,
      historySize: 0, // Disable history to avoid issues
    });
    
    // Store instance globally for web server to access
    (global as any).witralCLIInstance = this;
  }

  /**
   * Update writers with new sync instance (called when sync plugin changes)
   */
  async updateWritersSync(newSync: SyncInterface): Promise<void> {
    this.sync = newSync;
    this.tagWriter.updateSync(newSync);
    this.groupWriter.updateSync(newSync);
    logger.debug({}, '✅ CLI writers updated with new sync instance');
  }

  async start(): Promise<{ webEnabled?: boolean }> {
    this.setupMessageHandler();
    
    // Check if first run wizard should run
    // IMPORTANT: Do NOT setup input handler before wizard - it interferes with wizard's readline
    if (FirstRunWizard.shouldRun()) {
      const wizard = new FirstRunWizard(
        this.ingestor,
        this.groupManager,
        this.tagManager,
        this.storage,
        this.sync,
        this.rl
      );
      await wizard.run();
      const webEnabled = wizard.getWebEnabled();

      // Update ingestor if wizard replaced it with a real plugin
      const updatedIngestor = wizard.getIngestor();
      if (updatedIngestor !== this.ingestor) {
        this.ingestor = updatedIngestor;
        // Re-setup message handler with new ingestor
        this.setupMessageHandler();
      }

      // Update sync if wizard configured OAuth
      const updatedSync = wizard.getSync();
      if (updatedSync !== this.sync) {
        logger.info({ isConnected: updatedSync.isConnected() }, '🔄 Updating sync from wizard');
        await this.updateWritersSync(updatedSync);
        logger.info({ isConnected: this.sync.isConnected() }, '✅ Sync updated');
      }

      // Check if we're in setup mode (from start.sh) - if so, exit without showing CLI
      if (process.env.WITRAL_SETUP_MODE === 'true') {
        logger.info('Setup mode detected - wizard completed, exiting to allow background service start');
        logger.debug({ WITRAL_SETUP_MODE: process.env.WITRAL_SETUP_MODE }, 'Environment variable check');
        // Don't setup input handler or show menu - just exit
        // The wizard already showed the CLI access command
        return { webEnabled };
      } else {
        logger.debug({ WITRAL_SETUP_MODE: process.env.WITRAL_SETUP_MODE }, 'Not in setup mode - will show CLI menu');
      }

      // Setup input handler AFTER wizard completes
      this.setupInputHandler();
      
      this.showMenuAfterWizard();
      return { webEnabled };
    }
    
    // Normal startup - setup input handler and show menu
    this.setupInputHandler();
    this.showMenuAfterWizard();
    return {};
  }

  private showMenuAfterWizard(): void {
    // Register callback for when connected (show menu for first time or update)
    let menuShown = false;
    
    const showMenuOnce = () => {
      if (!menuShown) {
        this.showMenu();
        this.prompt();
        menuShown = true;
      }
    };
    
    this.ingestor.onConnected(() => {
      setTimeout(() => {
        if (!menuShown) {
          // First time - show menu with connected state
          showMenuOnce();
        } else if (!this.isInSubMenu) {
          // Already shown and not in submenu - just update
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          this.showMenu();
          this.prompt();
        }
        // If in submenu, don't update menu (let the submenu handle it)
      }, 300);
    });
    
    // Check state after reasonable delay
    // If already connected, show immediately. Otherwise, wait for connection or timeout
    setTimeout(() => {
      if (this.ingestor.isConnected() && !menuShown) {
        // Already connected - show menu with correct state
        showMenuOnce();
      } else if (!menuShown) {
        // Not connected yet - wait a bit more or show menu with "Disconnected"
        // Give time for automatic connection to complete
        setTimeout(() => {
          if (!menuShown) {
            // If after 2 seconds still not connected, show menu with "Disconnected" state
            showMenuOnce();
          }
        }, 2000);
      }
    }, 800);
  }

  /**
   * Configure handler to show messages immediately
   */
  private setupMessageHandler(): void {
    this.ingestor.onMessage(async (message) => {
      // Track current message group for feedback
      this.currentMessageGroup = message.group;
      
      // Process tags automatically (if message matches tag format)
      await this.tagWriter.processMessage(message);
      
      // Save all messages from monitored groups to group files (always enabled)
      if (this.groupManager.isMonitored(message.group)) {
        await this.groupWriter.writeMessage(message.group, message);
      }
      
      // Clear current group after processing
      this.currentMessageGroup = null;
      
      // Display message in console
      this.displayMessageImmediately(message);
    });
  }

  /**
   * Show message immediately, pausing readline if necessary
   */
  private displayMessageImmediately(message: { group: string; sender: string; time: string; content: string }): void {
    try {
      // Pause readline to print without interfering with prompt
      this.rl.pause();
      
      // Clear current prompt line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      // Print message in requested format
      console.log(`\nGroup: ${message.group}`);
      console.log(`Sender: ${message.sender}`);
      console.log(`Time: ${message.time}`);
      console.log(`Message: ${message.content}\n`);
      
      // Send message to SSE for dashboard (only via broadcastSSE, not logger to avoid duplicates)
      try {
        broadcastSSE('message', {
          group: message.group,
          sender: message.sender,
          time: message.time,
          content: message.content,
          timestamp: new Date().toISOString()
        });
      } catch (sseError) {
        // Ignore SSE errors
      }
      
      // Resume readline and show prompt again
      this.rl.resume();
      this.prompt();
    } catch (error) {
      // Try to restore prompt anyway
      try {
        this.rl.resume();
        this.prompt();
      } catch (e) {
        // Ignore restoration errors
      }
    }
  }

  private showWelcomeMessage(): void {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🎉 Welcome to Witral!                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n📋 Quick Start Guide:');
    console.log('  1. Connect to messaging service (option 1)');
    console.log('  2. Add groups to monitor (option 2)');
    console.log('  3. Create tags (option 3)');
    console.log('  4. Send messages with format: ,,TAG content');
    console.log('\n💡 Tip: Access the web dashboard at http://localhost:3000/web');
    console.log('📚 Documentation: See README.md and witral.md');
    console.log('\n💻 To access this CLI when Witral is running:');
    console.log('   docker exec -it witral node dist/index.js\n');
  }

  private showMenu(): void {
    const status = this.ingestor.isConnected() ? '✅ Connected' : '❌ Disconnected';
    const groupCount = this.groupManager.getAllGroups().length;
    const tagCount = this.tagManager.getAllTags().length;
    const webEnabled = this.config.WEB_ENABLED;
    
    console.log(`\n📱 Witral - Universal Ingestion Framework [${status}]`);
    console.log('─────────────────────────────────────────────────────');
    
    // Build menu dynamically based on features
    const menuItems: string[] = [
      '1) Messaging Service',
      `2) Groups (${groupCount})`,
      `3) Tags (${tagCount})`,
      '4) Settings',
    ];
    
    // Add dashboard option only if enabled
    if (webEnabled) {
      menuItems.push('5) Visit Dashboard');
      menuItems.push('6) Exit');
    } else {
      menuItems.push('5) Exit');
    }
    
    console.log(menuItems.join('  |  '));
    console.log('─────────────────────────────────────────────────────');
    
    // Show CLI access command if running in Docker
    if (process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production' || 
        existsSync('/.dockerenv')) {
      console.log('💻 To access this CLI when Witral is running: docker exec -it witral node dist/index.js');
      console.log('─────────────────────────────────────────────────────');
    }
  }

  private prompt(): void {
    // Only process input if we're not in a submenu
    if (this.isInSubMenu) {
      return;
    }
    
    this.rl.question('> ', (answer) => {
      const trimmed = answer.trim();
      if (trimmed) {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        this.handleInput(trimmed);
      } else {
        this.prompt();
      }
    });
  }

  private handleInput(input: string): void {
    const webEnabled = this.config.WEB_ENABLED;
    const maxOption = webEnabled ? '6' : '5';
    
    switch (input) {
      case '1':
        this.manageMessagingService();
        break;
      case '2':
        this.manageGroups();
        break;
      case '3':
        this.manageTags();
        break;
      case '4':
        this.showSettings();
        break;
      case '5':
        if (webEnabled) {
          this.visitDashboard().catch(() => {
            // Error opening dashboard, but menu will still show
          });
        } else {
          this.exit();
        }
        break;
      case '6':
        if (webEnabled) {
          this.exit();
        } else {
          console.log(`❌ Invalid option. Please select 1-${maxOption}.\n`);
          this.prompt();
        }
        break;
      default:
        console.log(`❌ Invalid option. Please select 1-${maxOption}.\n`);
        this.prompt();
    }
  }

  private manageMessagingService(): void {
    const isConnected = this.ingestor.isConnected();
    const connectionInstructions = this.ingestor.getConnectionInstructions();
    const requiresQR = this.ingestor.requiresQR();
    const config = getConfig();
    const currentPlugin = config.INGESTOR_TYPE || 'not configured';
    const availablePlugins = getAvailableIngestors();
    const hasPluginConfigured = currentPlugin && currentPlugin !== 'not configured';
    
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    console.log('\n🔌 Messaging Service');
    console.log('─────────────────────────────────────────────────────');
    
    // Show available plugins list
    if (availablePlugins.length > 0) {
      console.log('\nAvailable plugins:');
      availablePlugins.forEach((pluginName: string) => {
        const metadata = getIngestorMetadata(pluginName);
        const configured = pluginName === currentPlugin ? ' (Configured)' : '';
        console.log(`  • ${metadata?.name || pluginName} - ${metadata?.description || 'No description'}${configured}`);
      });
      console.log('');
    }
    
    console.log(`Status: ${isConnected ? '✅ Connected' : '❌ Disconnected'}`);
    if (hasPluginConfigured) {
      const metadata = getIngestorMetadata(currentPlugin);
      console.log(`Plugin: ${metadata?.name || currentPlugin}`);
    } else {
      console.log('Plugin: Not configured');
    }
    
    if (isConnected) {
      console.log('\n1) Disconnect');
      console.log('2) View connection details');
      console.log('3) Back to main menu');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            this.disconnect();
            break;
          case '2':
            this.showConnectionDetails();
            break;
          case '3':
          case 'back':
          case 'menu':
            this.isInSubMenu = false;
            this.showMenu();
            this.prompt();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-3.\n');
            this.manageMessagingService();
        }
      });
    } else if (hasPluginConfigured) {
      // Plugin configured but not connected
      let connectOption = 'Connect';
      if (connectionInstructions) {
        const match = connectionInstructions.match(/^([^-]+?)(\s*-\s*|$)/);
        if (match && match[1] && match[1].trim()) {
          connectOption = match[1].trim();
        } else {
          const firstPart = connectionInstructions.split('.')[0];
          if (firstPart && firstPart.trim()) {
            connectOption = firstPart.trim();
          }
        }
      }
      
      console.log(`\n1) ${connectOption}`);
      console.log('2) View connection instructions');
      console.log('3) Clear Session (regenerate QR/credentials)');
      console.log('4) Change Plugin');
      console.log('5) Back to main menu');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            if (requiresQR) {
              this.generateQR();
            } else {
              this.connect();
            }
            break;
          case '2':
            this.showConnectionInstructions();
            break;
          case '3':
            this.clearMessagingSession();
            break;
          case '4':
            this.installAndConfigurePlugin();
            break;
          case '5':
          case 'back':
          case 'menu':
            this.isInSubMenu = false;
            this.showMenu();
            this.prompt();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-5.\n');
            this.manageMessagingService();
        }
      });
    } else {
      // No plugin configured
      console.log('\n1) Install and Configure Plugin');
      console.log('2) Back to main menu');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            this.installAndConfigurePlugin();
            break;
          case '2':
          case 'back':
          case 'menu':
            this.isInSubMenu = false;
            this.showMenu();
            this.prompt();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-2.\n');
            this.manageMessagingService();
        }
      });
    }
  }

  private showConnectionDetails(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log('\n📊 Connection Details');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Status: ${this.ingestor.isConnected() ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`State: ${this.ingestor.getConnectionState()}`);
    const instructions = this.ingestor.getConnectionInstructions();
    if (instructions) {
      console.log(`\nInstructions: ${instructions}`);
    }
    console.log('─────────────────────────────────────────────────────');
    console.log('');
    this.isInSubMenu = false;
    this.showMenu();
    this.prompt();
  }

  private showConnectionInstructions(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log('\n📋 Connection Instructions');
    console.log('─────────────────────────────────────────────────────');
    const instructions = this.ingestor.getConnectionInstructions();
    console.log(instructions);
    console.log('─────────────────────────────────────────────────────');
    console.log('');
    this.isInSubMenu = false;
    this.showMenu();
    this.prompt();
  }

  private async connect(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log('\n🔄 Connecting...\n');
    
    try {
      await this.ingestor.start();
      if (this.ingestor.isConnected()) {
        console.log('✅ Connection established!\n');
      } else {
        console.log('⚠️  Connection failed. Please check your configuration.\n');
      }
    } catch (error) {
      logger.error({ error }, 'Error connecting');
      console.log('❌ Error connecting. Please try again.\n');
    }
    
    this.isInSubMenu = false;
    this.showMenu();
    this.prompt();
  }

  private async generateQR(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    if (this.ingestor.isConnected()) {
      console.log('\n⚠️  Already connected. Disconnect first if you want to generate a new QR code.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    try {
      // Generate QR - this will display it automatically if shouldDisplayQR is set
      await this.ingestor.generateQR();
      
      let qrExpired = false;
      let connectionHandled = false;
      
      const qrTimeout = setTimeout(() => {
        qrExpired = true;
        if (!this.ingestor.isConnected() && !connectionHandled) {
          console.log('\n⏱️  QR code expired. You can generate a new one from the messaging service menu.\n');
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
        }
      }, 70000);
      
      this.ingestor.onConnected(() => {
        if (!qrExpired && !connectionHandled) {
          connectionHandled = true;
          clearTimeout(qrTimeout);
          console.log('\n✅ Connection established!\n');
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
        }
      });
      
    } catch (error) {
      logger.error({ error }, 'Error generating QR');
      console.log('❌ Error generating QR code. Please try again.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
    }
  }


  private async disconnect(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    if (!this.ingestor.isConnected()) {
      console.log('\n⚠️  No active connection.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n🔄 Disconnecting...\n');
    await this.ingestor.stop();
    console.log('✅ Disconnected successfully.\n');
    this.isInSubMenu = false;
    this.showMenu();
    this.prompt();
  }

  private async clearMessagingSession(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    if (this.ingestor.isConnected()) {
      console.log('\n⚠️  Cannot clear session while connected. Please disconnect first.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n🗑️  Clear Messaging Service Session');
    console.log('─────────────────────────────────────────────────────');
    console.log('This will delete all session files and force regeneration of QR/credentials.');
    console.log('You will need to reconnect after clearing the session.\n');
    
    this.rl.question('Are you sure you want to clear the session? (yes/N): ', async (answer) => {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const confirmed = answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y';
      
      if (!confirmed) {
        console.log('❌ Session clear cancelled.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      try {
        const { promises: fs } = await import('fs');
        const { existsSync } = await import('fs');
        const path = await import('path');
        const config = getConfig();
        const sessionPath = config.INGESTOR_SESSION_PATH || './data/session';
        
        // Resolve absolute path
        const absoluteSessionPath = path.resolve(sessionPath);
        
        if (!existsSync(absoluteSessionPath)) {
          console.log('ℹ️  Session directory does not exist. Nothing to clear.\n');
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
          return;
        }

        // List files before deletion
        const files = await fs.readdir(absoluteSessionPath, { withFileTypes: true });
        const fileCount = files.length;
        
        if (fileCount === 0) {
          console.log('ℹ️  Session directory is empty. Nothing to clear.\n');
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
          return;
        }

        // Delete all files and subdirectories
        for (const file of files) {
          const filePath = path.join(absoluteSessionPath, file.name);
          if (file.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
        }

        console.log(`✅ Session cleared successfully (${fileCount} item(s) deleted).\n`);
        console.log('📋 Next steps:');
        console.log('  1. Return to Messaging Service menu');
        console.log('  2. Select "Connect" or "Generate QR" to create a new session');
        console.log('  3. Follow the connection instructions\n');
        
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      } catch (error) {
        logger.error({ error }, 'Error clearing messaging session');
        console.log('❌ Error clearing session. Please check permissions and try again.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      }
    });
  }

  private async manageGroups(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const monitoredGroups = this.groupManager.getAllGroups();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 Monitored Groups Management');
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (monitoredGroups.length === 0) {
      console.log('⚪ No monitored groups.\n');
    } else {
      console.log('Monitored groups:');
      monitoredGroups.forEach((group, index) => {
        console.log(`  ${index + 1}. ${group.name}${group.jid ? ` (${group.jid})` : ''}`);
      });
      console.log('');
    }
    
    console.log('Options:');
    console.log('  1) List available groups and add');
    console.log('  2) Remove monitored group');
    console.log('  3) Return to main menu\n');
    
    this.rl.question('Select an option (1-3): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (trimmed === '1') {
        await this.addGroup();
      } else if (trimmed === '2') {
        await this.removeGroup();
      } else if (trimmed === '3') {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      } else {
        console.log('❌ Invalid option. Please select 1-3.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }
    });
  }

  private async addGroup(): Promise<void> {
    try {
      const groups = await this.ingestor.listGroups();
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📱 Available Groups:');
      console.log('═══════════════════════════════════════════════════════\n');

      const monitoredGroups = this.groupManager.getAllGroups();
      const monitoredNames = new Set(monitoredGroups.map(g => g.name.toLowerCase()));

      groups.forEach((group, index) => {
        const isMonitored = monitoredNames.has(group.name.toLowerCase());
        const status = isMonitored ? '✅ Monitored' : '⚪ Not monitored';
        console.log(`${index + 1}. ${group.name} ${status}`);
        if (group.participants) {
          console.log(`   👥 ${group.participants} participants\n`);
        }
      });

      console.log('═══════════════════════════════════════════════════════\n');
      
      this.rl.question('\nSelect the number of the group to add (or Enter to cancel): ', async (answer) => {
        const trimmed = answer.trim();
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        if (!trimmed) {
          this.showMenu();
          this.prompt();
          return;
        }

        const groupIndex = parseInt(trimmed, 10) - 1;
        
        if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= groups.length) {
          console.log('❌ Invalid number. Please select a number from the list.\n');
          this.showMenu();
          this.prompt();
          return;
        }

        const selectedGroup = groups[groupIndex];
        if (!selectedGroup) {
          console.log('❌ Group not found.\n');
          this.showMenu();
          this.prompt();
          return;
        }
        const groupName = selectedGroup.name;
        
        // Check if already monitored
        if (monitoredNames.has(groupName.toLowerCase())) {
          console.log(`⚠️  Group "${groupName}" is already being monitored.\n`);
          this.showMenu();
          this.prompt();
          return;
        }

        const added = await this.groupManager.addGroup(groupName, selectedGroup.jid);
        
        if (added) {
          console.log(`✅ Group "${groupName}" added to monitoring.\n`);
        }
        
        this.showMenu();
        this.prompt();
      });
    } catch (error) {
      console.log('\n⚠️  Not connected. Connect first with option 1.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }
  }

  private async removeGroup(): Promise<void> {
    const monitoredGroups = this.groupManager.getAllGroups();
    
    if (monitoredGroups.length === 0) {
      console.log('⚪ No monitored groups to remove.\n');
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 Monitored Groups:');
    console.log('═══════════════════════════════════════════════════════\n');
    monitoredGroups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.name}`);
    });
    console.log('');

    this.rl.question('Select the number of the group to remove (or Enter to cancel): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!trimmed) {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const groupIndex = parseInt(trimmed, 10) - 1;
      
      if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= monitoredGroups.length) {
        console.log('❌ Invalid number. Please select a number from the list.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const selectedGroup = monitoredGroups[groupIndex];
      if (!selectedGroup) {
        console.log('❌ Group not found.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }
      const groupName = selectedGroup.name;

      const removed = await this.groupManager.removeGroup(groupName);
      
      if (removed) {
        console.log(`✅ Group "${groupName}" removed from monitoring.\n`);
      } else {
        console.log(`❌ Error removing group "${groupName}".\n`);
      }
      
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
    });
  }

  private async manageTags(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const tags = this.tagManager.getAllTags();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📁 Tags Management');
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (tags.length === 0) {
      console.log('⚪ No tags configured.\n');
    } else {
      console.log('Tags:');
      tags.forEach((tag, index) => {
        console.log(`${index + 1}. ${tag.name}${tag.description ? ` - ${tag.description}` : ''}`);
        console.log(`   Fields: ${tag.enabledFields.join(', ')}\n`);
      });
    }
    
    console.log('Options:');
    console.log('  1) Create tag');
    console.log('  2) Delete tag');
    console.log('  3) Configure tag fields');
    console.log('  4) Edit tag description');
    console.log('  5) Return to main menu\n');
    
    this.rl.question('Select an option (1-5): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (trimmed === '1') {
        await this.createTag();
      } else if (trimmed === '2') {
        await this.removeTag();
      } else if (trimmed === '3') {
        await this.configureTagFields();
      } else if (trimmed === '4') {
        await this.editTagDescription();
      } else if (trimmed === '5') {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      } else {
        console.log('❌ Invalid option. Please select 1-5.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }
    });
  }

  private async createTag(): Promise<void> {
    this.rl.question('\nTag name (e.g.: CODE): ', async (name) => {
      const trimmedName = name.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!trimmedName) {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      // Validate name format (only letters, numbers, hyphens, underscores)
      if (!/^[A-Za-z0-9_-]+$/.test(trimmedName)) {
        console.log('❌ Name can only contain letters, numbers, hyphens, and underscores.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      // Select fields
      const allFields: TagField[] = ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO'];
      console.log('\nAvailable fields:');
      allFields.forEach((field, index) => {
        console.log(`${index + 1}. ${field}`);
      });
      console.log('');

      this.rl.question('Enter the numbers of fields to enable separated by commas (1=AUTHOR, 2=TIME, 3=DATE, 4=CONTENT): ', async (fieldsAnswer) => {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        const fieldNumbers = fieldsAnswer.split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < allFields.length);
        
        if (fieldNumbers.length === 0) {
          console.log('❌ You must select at least one valid field.\n');
          this.showMenu();
          this.prompt();
          return;
        }

        const selectedFields = fieldNumbers.map(n => allFields[n]).filter((f): f is TagField => f !== undefined);
        
        // CONTENIDO must always be enabled
        if (!selectedFields.includes('CONTENIDO')) {
          selectedFields.push('CONTENIDO');
        }

        // Separator (default: ",,")
        this.rl.question('Separator (1-3 characters, Enter to use ",,"): ', async (separatorAnswer) => {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          let separator = separatorAnswer.trim() || ',,';
          
          if (separator.length < 1 || separator.length > 3) {
            console.log('⚠️  Invalid separator. Using ",," as default.');
            separator = ',,';
          }

          // Description (optional)
          this.rl.question('Description (optional, Enter to skip): ', async (description) => {
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            const trimmedDesc = description.trim() || undefined;
            
            const added = await this.tagManager.addTag(trimmedName, trimmedDesc, selectedFields, separator);
            
            if (added) {
              console.log(`✅ Tag "${trimmedName}" created successfully (separator: "${separator}").\n`);
            } else {
              console.log(`⚠️  Tag "${trimmedName}" already exists.\n`);
            }
            
            this.isInSubMenu = false;
            this.showMenu();
            this.prompt();
          });
        });
      });
    });
  }

  private async removeTag(): Promise<void> {
    const tags = this.tagManager.getAllTags();
    
    if (tags.length === 0) {
      console.log('⚪ No tags to delete.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 Available Tags:');
    console.log('═══════════════════════════════════════════════════════\n');
    tags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name}${tag.description ? ` - ${tag.description}` : ''}`);
    });
    console.log('');

    this.rl.question('Select the number of the tag to delete (or Enter to cancel): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!trimmed) {
        this.showMenu();
        this.prompt();
        return;
      }

      const tagIndex = parseInt(trimmed, 10) - 1;
      
      if (isNaN(tagIndex) || tagIndex < 0 || tagIndex >= tags.length) {
        console.log('❌ Invalid number. Please select a number from the list.\n');
        this.showMenu();
        this.prompt();
        return;
      }

      const selectedTag = tags[tagIndex];
      if (!selectedTag) {
        console.log('❌ Tag not found.\n');
        this.showMenu();
        this.prompt();
        return;
      }
      const tagName = selectedTag.name;

      // Ask if user also wants to delete markdown file
      this.rl.question('Do you want to delete the associated markdown file as well? (y/n): ', async (deleteFileAnswer) => {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        const deleteFile = deleteFileAnswer.trim().toLowerCase() === 'y' || deleteFileAnswer.trim().toLowerCase() === 'yes';

        const removed = await this.tagManager.removeTag(tagName);
        
        if (!removed) {
          console.log(`❌ Error deleting tag "${tagName}".\n`);
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
          return;
        }

        console.log(`✅ Tag "${tagName}" deleted successfully.`);

        if (deleteFile) {
          const fileDeleted = await this.tagManager.deleteTagMarkdown(tagName);
          if (fileDeleted) {
            console.log(`✅ Markdown file for tag "${tagName}" was also deleted.\n`);
          } else {
            console.log(`⚠️  Could not delete markdown file (it may not exist).\n`);
          }
        } else {
          console.log(`ℹ️  The markdown file remains in the system.\n`);
        }
        
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      });
    });
  }

  private async configureTagFields(): Promise<void> {
    const tags = this.tagManager.getAllTags();
    
    if (tags.length === 0) {
      console.log('⚪ No tags to configure.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 Available Tags:');
    console.log('═══════════════════════════════════════════════════════\n');
    tags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name}${tag.description ? ` - ${tag.description}` : ''}`);
      console.log(`   Fields: ${tag.enabledFields.join(', ')} | Separator: "${tag.separator || ',,'}"\n`);
    });
    console.log('');

    this.rl.question('Select the number of the tag to configure (or Enter to cancel): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!trimmed) {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const tagIndex = parseInt(trimmed, 10) - 1;
      
      if (isNaN(tagIndex) || tagIndex < 0 || tagIndex >= tags.length) {
        console.log('❌ Invalid number. Please select a number from the list.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const selectedTag = tags[tagIndex];
      if (!selectedTag) {
        console.log('❌ Tag not found.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }
      const allFields: TagField[] = ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO'];
      
      console.log('\nAvailable fields:');
      allFields.forEach((field, index) => {
        const enabled = selectedTag.enabledFields.includes(field);
        console.log(`${index + 1}. ${field} ${enabled ? '✅' : '⚪'}`);
      });
      console.log('');

      this.rl.question('Enter the numbers of fields to enable separated by commas (1=AUTHOR, 2=TIME, 3=DATE, 4=CONTENT): ', async (fieldsAnswer) => {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        const fieldNumbers = fieldsAnswer.split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < allFields.length);
        
        if (fieldNumbers.length === 0) {
          console.log('❌ You must select at least one valid field.\n');
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
          return;
        }

        const selectedFields = fieldNumbers.map(n => allFields[n]).filter((f): f is TagField => f !== undefined);
        
        // CONTENT is always enabled
        if (!selectedFields.includes('CONTENIDO')) {
          selectedFields.push('CONTENIDO');
        }

        // Separator
        console.log(`\nCurrent separator: "${selectedTag.separator || ',,'}"`);
        this.rl.question('New separator (1-3 characters, Enter to keep current): ', async (separatorAnswer) => {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          let separator = separatorAnswer.trim();
          
          if (separator && (separator.length < 1 || separator.length > 3)) {
            console.log('⚠️  Invalid separator. Keeping current.');
            separator = '';
          }

          const updates: { enabledFields: TagField[]; separator?: string } = {
            enabledFields: selectedFields,
          };
          
          if (separator) {
            updates.separator = separator;
          }

          const updated = await this.tagManager.updateTag(selectedTag.name, updates);
          
          if (updated) {
            console.log(`✅ Tag "${selectedTag.name}" updated.\n`);
          } else {
            console.log(`❌ Error updating tag.\n`);
          }
          
          this.isInSubMenu = false;
          this.showMenu();
          this.prompt();
        });
      });
    });
  }

  private async editTagDescription(): Promise<void> {
    const tags = this.tagManager.getAllTags();
    
    if (tags.length === 0) {
      console.log('⚪ No tags to edit.\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 Available Tags:');
    console.log('═══════════════════════════════════════════════════════\n');
    tags.forEach((tag, index) => {
      const desc = tag.description || '(no description)';
      console.log(`${index + 1}. ${tag.name}`);
      console.log(`   Current description: ${desc}\n`);
    });
    console.log('');

    this.rl.question('Select the number of the tag to edit (or Enter to cancel): ', async (answer) => {
      const trimmed = answer.trim();
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!trimmed) {
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const tagIndex = parseInt(trimmed, 10) - 1;
      
      if (isNaN(tagIndex) || tagIndex < 0 || tagIndex >= tags.length) {
        console.log('❌ Invalid number. Please select a number from the list.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const selectedTag = tags[tagIndex];
      if (!selectedTag) {
        console.log('❌ Tag not found.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      const currentDesc = selectedTag.description || '(no description)';
      console.log(`\nCurrent description: ${currentDesc}\n`);

      this.rl.question('Enter new description (or press Enter to remove): ', async (newDesc) => {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        const trimmedDesc = newDesc.trim() || undefined;
        
        const updated = await this.tagManager.updateTag(selectedTag.name, { description: trimmedDesc });
        
        if (updated) {
          const descText = trimmedDesc || '(no description)';
          console.log(`✅ Description updated for "${selectedTag.name}"!\n`);
          console.log(`New description: ${descText}\n`);
        } else {
          console.log(`❌ Error updating description for "${selectedTag.name}".\n`);
        }
        
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      });
    });
  }

  private showSettings(): void {
    console.log('\n⚙️  Settings');
    console.log('─────────────────────────────────────────────────────');
    console.log('1) Configure Tag File Modes');
    console.log('2) Configure Cloud Sync');
    console.log('3) View current configuration');
    console.log('4) Back to main menu');
    console.log('─────────────────────────────────────────────────────');
    
    this.rl.question('> ', (answer) => {
      const trimmed = answer.trim();
      switch (trimmed) {
        case '1':
          this.configureTagFileModes();
          break;
        case '2':
          this.configureCloudSync();
          break;
        case '3':
          this.showCurrentConfig();
          break;
        case '4':
        case 'back':
        case 'menu':
          this.showMenu();
          this.prompt();
          break;
        default:
          console.log('❌ Invalid option. Please select 1-4.\n');
          this.showSettings();
      }
    });
  }

  private configureTagFileModes(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const currentMode = this.config.TAG_FILE_MODE || 'new-file';
    const dynamicTitles = this.config.TAG_DYNAMIC_TITLES !== false;
    
    console.log('\n📝 Tag File Modes Configuration');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Current file mode: ${currentMode === 'new-file' ? 'New File (each message creates new file)' : 'Append (all messages to same file)'}`);
    console.log(`Dynamic titles: ${dynamicTitles ? '✅ Enabled' : '❌ Disabled'}`);
    console.log('');
    console.log('1) Change file mode (new-file ↔ append)');
    console.log('2) Toggle dynamic titles');
    console.log('3) Back to settings');
    console.log('─────────────────────────────────────────────────────');
    
    this.rl.question('> ', async (answer) => {
      const trimmed = answer.trim();
      switch (trimmed) {
        case '1':
          await this.toggleTagFileMode();
          break;
        case '2':
          await this.toggleDynamicTitles();
          break;
        case '3':
        case 'back':
          this.showSettings();
          break;
        default:
          console.log('❌ Invalid option. Please select 1-3.\n');
          this.configureTagFileModes();
      }
    });
  }

  private async toggleTagFileMode(): Promise<void> {
    const currentMode = this.config.TAG_FILE_MODE || 'new-file';
    const newMode = currentMode === 'new-file' ? 'append' : 'new-file';
    
    console.log(`\n📝 Current file mode: ${currentMode}`);
    console.log(`   New mode will be: ${newMode}`);
    console.log('\n⚠️  Note: This requires updating your .env file.');
    console.log('   The change will take effect after restarting Witral.\n');
    
    this.rl.question('Update .env file now? (y/n): ', async (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'y' || trimmed === 'yes') {
        try {
          const { readFile, writeFile } = await import('fs/promises');
          const { existsSync } = await import('fs');
          const { getEnvPath } = await import('../config/index.js');
          const envPath = getEnvPath();
          
          let envContent = '';
          if (existsSync(envPath)) {
            envContent = await readFile(envPath, 'utf-8');
          }
          
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
          _clearCache();
          process.env.TAG_FILE_MODE = newMode;
          
          console.log(`✅ File mode updated to: ${newMode}\n`);
        } catch (error) {
          logger.error({ error }, 'Error updating .env file');
          console.log('❌ Error updating .env file. Please update it manually.\n');
        }
      } else {
        console.log('⚠️  Change not applied. Update .env manually if needed.\n');
      }
      
      this.isInSubMenu = false;
      this.configureTagFileModes();
    });
  }

  private async toggleDynamicTitles(): Promise<void> {
    const current = this.config.TAG_DYNAMIC_TITLES;
    const newValue = !current;
    
    console.log(`\n📝 Dynamic titles are currently: ${current ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   This will be changed to: ${newValue ? '✅ Enabled' : '❌ Disabled'}`);
    console.log('\n⚠️  Note: This requires updating your .env file.');
    console.log('   The change will take effect after restarting Witral.\n');
    
    this.rl.question('Update .env file now? (y/n): ', async (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'y' || trimmed === 'yes') {
        try {
          const { readFile, writeFile } = await import('fs/promises');
          const { existsSync } = await import('fs');
          const { getEnvPath } = await import('../config/index.js');
          const envPath = getEnvPath();
          
          let envContent = '';
          if (existsSync(envPath)) {
            envContent = await readFile(envPath, 'utf-8');
          }
          
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
          _clearCache();
          process.env.TAG_DYNAMIC_TITLES = String(newValue);
          
          console.log(`✅ Dynamic titles ${newValue ? 'enabled' : 'disabled'}\n`);
        } catch (error) {
          logger.error({ error }, 'Error updating .env file');
          console.log('❌ Error updating .env file. Please update it manually.\n');
        }
      } else {
        console.log('⚠️  Change not applied. Update .env manually if needed.\n');
      }
      
      this.isInSubMenu = false;
      this.configureTagFileModes();
    });
  }

  private async visitDashboard(): Promise<void> {
    const port = this.config.WEB_PORT;
    const host = this.config.WEB_HOST === '0.0.0.0' ? 'localhost' : this.config.WEB_HOST;
    const url = `http://${host}:${port}/web`;
    
    console.log(`\n🌐 Dashboard URL: ${url}`);
    console.log('💡 Tip: Copy the URL above and open it in your browser.\n');
    
    // Try to open in default browser
    // Security: Validate URL before executing command to prevent command injection
    try {
      const urlObj = new URL(url);
      // Only allow http/https protocols
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        console.log('⚠️  Invalid URL protocol. Please copy the URL above.\n');
        return;
      }
    } catch (e) {
      // If URL parsing fails, it might be a relative URL - allow it for localhost
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
        console.log('⚠️  Invalid URL format. Please copy the URL above.\n');
        return;
      }
    }
    
    // Security: Use execFile with separate command and arguments to prevent injection
    const { execFile } = await import('child_process');
    const platform = process.platform;
    
    // Check if running in WSL
    const isWSL = process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP;
    
    let cmd: string;
    let args: string[] = [];
    
    if (isWSL) {
      // WSL: try wslview first, fallback to xdg-open
      cmd = 'wslview';
      args = [url];
      // Note: fallback to xdg-open is handled by error callback
    } else if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '', url]; // Windows start command
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    
    execFile(cmd, args, (error: any) => {
      if (error) {
        // For WSL, try xdg-open as fallback
        if (isWSL && cmd === 'wslview') {
          execFile('xdg-open', [url], () => {
            // Ignore errors on fallback
          });
        } else {
          // Browser opening failed - user can copy the URL manually
          console.log('⚠️  Could not open browser automatically. Please copy the URL above.\n');
        }
      }
    });
    
    this.showMenu();
    this.prompt();
  }

  private showCurrentConfig(): void {
    console.log('\n📋 Current Configuration');
    console.log('─────────────────────────────────────────────────────');
    
    // Show ingestor type with friendly name
    const ingestorType = this.config.INGESTOR_TYPE || '';
    let ingestorDisplay = '(not set)';
    if (ingestorType) {
      const metadata = getIngestorMetadata(ingestorType.toLowerCase());
      ingestorDisplay = metadata?.name || ingestorType;
    }
    console.log(`Ingestor Type: ${ingestorDisplay}`);
    
    console.log(`Storage: Local filesystem`);
    const syncStatus = this.sync.getConnectionStatus();
    if (syncStatus.isConnected) {
      const syncType = this.config.SYNC_TYPE || 'local';
      const syncMetadata = syncType !== 'local' ? getSyncMetadata(syncType.toLowerCase()) : null;
      const syncDisplay = syncMetadata?.name || syncType;
      console.log(`Cloud Sync: ✅ ${syncStatus.authMethod === 'oauth' ? `${syncDisplay} (OAuth)` : syncDisplay}`);
      if (syncStatus.userEmail) {
        console.log(`  User: ${syncStatus.userEmail}`);
      }
    } else {
      console.log(`Cloud Sync: ❌ Not configured`);
    }
    
    // Tag file modes
    const fileMode = this.config.TAG_FILE_MODE || 'new-file';
    const fileModeText = fileMode === 'new-file' 
      ? 'New File (each message creates new file)' 
      : 'Append (all messages to same file)';
    console.log(`Tag File Mode: ${fileModeText}`);
    
    const dynamicTitles = this.config.TAG_DYNAMIC_TITLES !== false; // Default true
    console.log(`Dynamic Titles: ${dynamicTitles ? '✅ Enabled' : '❌ Disabled'}`);
    
    console.log(`Vault Path: ${this.config.VAULT_PATH}`);
    console.log(`Web Dashboard: ${this.config.WEB_ENABLED ? '✅ Enabled' : '❌ Disabled'} (Port: ${this.config.WEB_PORT})`);
    console.log(`Log Level: ${this.config.LOG_LEVEL}`);
    
    console.log('─────────────────────────────────────────────────────');
    console.log('\n💡 To change settings, edit your .env file and restart Witral.\n');
    
    this.showMenu();
    this.prompt();
  }

  private async configureCloudSync(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const config = getConfig();
    const currentSyncPlugin = config.SYNC_TYPE || 'local';
    const availablePlugins = getAvailableSyncPlugins();
    
    console.log('\n☁️  Cloud Sync Configuration');
    console.log('─────────────────────────────────────────────────────');
    
    // Show available sync plugins
    if (availablePlugins.length > 0) {
      console.log('\nAvailable sync plugins:');
      availablePlugins.forEach((pluginName: string) => {
        const metadata = getSyncMetadata(pluginName);
        const configured = pluginName === currentSyncPlugin ? ' (Configured)' : '';
        console.log(`  • ${metadata?.name || pluginName} - ${metadata?.description || 'No description'}${configured}`);
      });
      console.log('');
    }
    
    // Show current status
    const syncStatus = this.sync.getConnectionStatus();
    console.log(`Current plugin: ${currentSyncPlugin}`);
    console.log(`Status: ${syncStatus.isConnected ? '✅ Connected' : '❌ Not connected'}`);
    
    // If Google Drive is selected, show OAuth configuration options
    if (currentSyncPlugin === 'googledrive') {
      console.log('\n1) Configure Google Drive OAuth');
      console.log('2) View connection status');
      console.log('3) Back to settings');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', async (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            await this.configureGoogleDriveOAuth();
            break;
          case '2':
            this.showCloudSyncStatus();
            break;
          case '3':
          case 'back':
            this.showSettings();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-3.\n');
            this.configureCloudSync();
        }
      });
    } else {
      console.log('\n1) Configure sync plugin');
      console.log('2) Back to settings');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            this.selectSyncPlugin();
            break;
          case '2':
          case 'back':
            this.showSettings();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-2.\n');
            this.configureCloudSync();
        }
      });
    }
  }

  private async configureGoogleDriveOAuth(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    console.log('\n🔐 Google Drive OAuth Configuration');
    console.log('─────────────────────────────────────────────────────');
    
    // Check if already configured
    const credentialsConfigured = await isOAuthConfigured();
    const tokensConfigured = await hasOAuthTokens();
    
    if (credentialsConfigured && tokensConfigured) {
      console.log('✅ OAuth is already configured and authorized.');
      console.log('\n1) Re-authorize (configure new credentials)');
      console.log('2) View authorization status');
      console.log('3) Clear OAuth Tokens (force re-authorization)');
      console.log('4) Back to cloud sync menu');
      console.log('─────────────────────────────────────────────────────');
      
      this.rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        switch (trimmed) {
          case '1':
            this.setupGoogleDriveCredentials();
            break;
          case '2':
            this.showGoogleDriveAuthStatus();
            break;
          case '3':
            this.clearOAuthTokens();
            break;
          case '4':
          case 'back':
            this.configureCloudSync();
            break;
          default:
            console.log('❌ Invalid option. Please select 1-4.\n');
            this.configureGoogleDriveOAuth();
        }
      });
    } else {
      await this.setupGoogleDriveCredentials();
    }
  }

  private async clearOAuthTokens(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    console.log('\n🗑️  Clear OAuth Tokens');
    console.log('─────────────────────────────────────────────────────');
    console.log('This will delete OAuth tokens and force re-authorization.');
    console.log('OAuth credentials (client ID/secret) will be preserved.');
    console.log('You will need to re-authorize after clearing tokens.\n');
    
    this.rl.question('Are you sure you want to clear OAuth tokens? (yes/N): ', async (answer) => {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const confirmed = answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y';
      
      if (!confirmed) {
        console.log('❌ Token clear cancelled.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
        return;
      }

      try {
        const { promises: fs } = await import('fs');
        const { existsSync } = await import('fs');
        const path = await import('path');
        const config = getConfig();
        
        let deletedCount = 0;
        
        // Delete OAuth tokens in vault
        const tokensPath = path.join(config.VAULT_PATH, '.google-oauth-tokens.json');
        if (existsSync(tokensPath)) {
          await fs.unlink(tokensPath);
          deletedCount++;
          logger.debug({ path: tokensPath }, 'OAuth tokens deleted');
        }
        
        // Note: We preserve OAuth credentials (client ID/secret) in data/googledrive/
        // Only tokens are deleted, not credentials
        
        if (deletedCount > 0) {
          console.log(`✅ OAuth tokens cleared successfully (${deletedCount} file(s) deleted).\n`);
          console.log('📋 Next steps:');
          console.log('  1. Return to Cloud Sync menu');
          console.log('  2. Select "Configure Google Drive OAuth"');
          console.log('  3. Follow the authorization flow to re-authorize\n');
        } else {
          console.log('ℹ️  No OAuth tokens found. Nothing to clear.\n');
        }
        
        // Update sync instance if it exists (to reflect disconnected state)
        if (this.sync) {
          // Sync will detect missing tokens on next operation
          logger.debug({}, 'OAuth tokens cleared - sync will require re-authorization');
        }
        
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      } catch (error) {
        logger.error({ error }, 'Error clearing OAuth tokens');
        console.log('❌ Error clearing OAuth tokens. Please check permissions and try again.\n');
        this.isInSubMenu = false;
        this.showMenu();
        this.prompt();
      }
    });
  }

  private async setupGoogleDriveCredentials(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    console.log('\n📝 Setup Google Drive OAuth Credentials');
    console.log('─────────────────────────────────────────────────────');
    console.log('You need to get your OAuth credentials from Google Cloud Console:');
    console.log('1. Go to https://console.cloud.google.com/apis/credentials');
    console.log('2. Click "Create Credentials" → "OAuth client ID"');
    console.log('3. Select "Web application"');
    console.log('4. Add authorized redirect URI: http://localhost:3000/web/oauth/callback');
    console.log('5. Copy your Client ID and Client Secret\n');
    
    this.rl.question('Client ID: ', async (clientId) => {
      const trimmedClientId = clientId.trim();
      if (!trimmedClientId) {
        console.log('❌ Client ID is required.\n');
        this.setupGoogleDriveCredentials();
        return;
      }
      
      this.rl.question('Client Secret: ', async (clientSecret) => {
        const trimmedClientSecret = clientSecret.trim();
        if (!trimmedClientSecret) {
          console.log('❌ Client Secret is required.\n');
          this.setupGoogleDriveCredentials();
          return;
        }
        
        // Save credentials
        try {
          const { promises: fs } = await import('fs');
          const credentialsPath = './data/googledrive/oauth-credentials.json';
          await fs.mkdir('./data/googledrive', { recursive: true });
          
          // Save in Web Application format (required for web app OAuth)
          const credentials = {
            web: {
              client_id: trimmedClientId,
              client_secret: trimmedClientSecret,
            }
          };
          
          // Security: Save credentials file with restricted permissions (owner read/write only)
          await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { encoding: 'utf-8', mode: 0o600 });
          console.log('✅ Credentials saved successfully!\n');
          
          // Now generate authorization URL
          await this.authorizeGoogleDrive();
        } catch (error: any) {
          console.log(`❌ Error saving credentials: ${error.message}\n`);
          this.configureGoogleDriveOAuth();
        }
      });
    });
  }

  private async authorizeGoogleDrive(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    console.log('\n🔗 Google Drive Authorization');
    console.log('─────────────────────────────────────────────────────');
    
    try {
      const config = getConfig();
      const port = config.WEB_PORT || 3000;
      const callbackPath = '/web/oauth/callback';
      
      // Generate authorization URL using Desktop App flow
      const authUrl = await getAuthorizationUrl(port, callbackPath);
      
      console.log('\n1. Open this URL in your browser:');
      console.log(`\n${authUrl}\n`);
      console.log('2. Authorize the application');
      console.log('3. After authorization, you will be redirected to localhost');
      console.log('4. Copy the "code" parameter from the URL in your browser');
      console.log('   Example: If URL is http://localhost:3000/web/oauth/callback?code=ABC123');
      console.log('   Then the code is: ABC123\n');
      
      this.rl.question('Authorization code: ', async (code) => {
        const trimmedCode = code.trim();
        if (!trimmedCode) {
          console.log('❌ Authorization code is required.\n');
          this.authorizeGoogleDrive();
          return;
        }
        
        try {
          // Exchange code for tokens using Desktop App flow
          await exchangeCodeForTokens(trimmedCode, port, callbackPath);
          console.log('\n✅ Authorization successful! Google Drive sync is now configured.\n');
          
          // Reinitialize sync if possible
          if ((this.sync as any).reinitializeDrive) {
            await (this.sync as any).reinitializeDrive();
          }
          
          this.configureCloudSync();
        } catch (error: any) {
          console.log(`\n❌ Error authorizing: ${error.message}\n`);
          this.configureGoogleDriveOAuth();
        }
      });
    } catch (error: any) {
      console.log(`❌ Error generating authorization URL: ${error.message}\n`);
      this.configureGoogleDriveOAuth();
    }
  }

  private showCloudSyncStatus(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const syncStatus = this.sync.getConnectionStatus();
    const config = getConfig();
    
    console.log('\n☁️  Cloud Sync Status');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Plugin: ${config.SYNC_TYPE || 'local'}`);
    console.log(`Status: ${syncStatus.isConnected ? '✅ Connected' : '❌ Not connected'}`);
    if (syncStatus.userEmail) {
      console.log(`User: ${syncStatus.userEmail}`);
    }
    console.log('');
    
    this.rl.question('Press Enter to continue...', () => {
      this.configureCloudSync();
    });
  }

  private async showGoogleDriveAuthStatus(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const credentialsConfigured = await isOAuthConfigured();
    const tokensConfigured = await hasOAuthTokens();
    const syncStatus = this.sync.getConnectionStatus();
    
    console.log('\n🔐 Google Drive OAuth Status');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Credentials: ${credentialsConfigured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`Authorization: ${tokensConfigured ? '✅ Authorized' : '❌ Not authorized'}`);
    console.log(`Connection: ${syncStatus.isConnected ? '✅ Connected' : '❌ Not connected'}`);
    if (syncStatus.userEmail) {
      console.log(`User: ${syncStatus.userEmail}`);
    }
    console.log('');
    
    this.rl.question('Press Enter to continue...', () => {
      this.configureGoogleDriveOAuth();
    });
  }

  private async selectSyncPlugin(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    this.isInSubMenu = true;
    
    const config = getConfig();
    const currentSyncPlugin = config.SYNC_TYPE || 'local';
    const availablePlugins = getAvailableSyncPlugins();
    
    console.log('\n📦 Select Sync Plugin');
    console.log('─────────────────────────────────────────────────────');
    console.log('Available sync plugins:\n');
    
    availablePlugins.forEach((pluginName: string, index: number) => {
      const metadata = getSyncMetadata(pluginName);
      const configured = pluginName === currentSyncPlugin ? ' (Current)' : '';
      console.log(`  ${index + 1}) ${metadata?.name || pluginName} - ${metadata?.description || 'No description'}${configured}`);
    });
    console.log(`  ${availablePlugins.length + 1}) Back to cloud sync menu`);
    console.log('─────────────────────────────────────────────────────');
    
    this.rl.question(`> Select plugin [1-${availablePlugins.length + 1}]: `, async (answer) => {
      const trimmed = answer.trim();
      const choice = parseInt(trimmed, 10);
      
      if (choice === availablePlugins.length + 1 || trimmed.toLowerCase() === 'back') {
        this.configureCloudSync();
        return;
      }
      
      if (isNaN(choice) || choice < 1 || choice > availablePlugins.length) {
        console.log('❌ Invalid selection.\n');
        this.selectSyncPlugin();
        return;
      }
      
      const selectedPlugin = availablePlugins[choice - 1];
      
      if (!selectedPlugin || typeof selectedPlugin !== 'string') {
        console.log('❌ Invalid plugin selected.\n');
        this.selectSyncPlugin();
        return;
      }
      
      if (selectedPlugin === currentSyncPlugin) {
        console.log(`✅ ${selectedPlugin} is already configured.\n`);
        this.configureCloudSync();
        return;
      }
      
      try {
        // Update .env file
        await this.updateEnvFile('SYNC_TYPE', selectedPlugin);
        
        // Update process.env and reload config
        process.env.SYNC_TYPE = selectedPlugin;
        _clearCache();
        const { config: loadEnv } = await import('dotenv');
        loadEnv();
        this.config = getConfig();
        
        // Recreate sync plugin dynamically
        console.log('🔄 Loading sync plugin...');
        const newSync = await createSync();
        await newSync.initialize();
        
        // Replace the sync instance
        this.sync = newSync;

        // Create feedback callback for TagWriter
        const feedbackCallback = async (feedbackMessage: string) => {
          if (this.currentMessageGroup && this.ingestor.isConnected()) {
            try {
              // Check if ingestor supports sendMessageToGroup
              if ('sendMessageToGroup' in this.ingestor && typeof (this.ingestor as any).sendMessageToGroup === 'function') {
                await (this.ingestor as any).sendMessageToGroup(this.currentMessageGroup, feedbackMessage);
              }
            } catch (error) {
              logger.debug({ error }, 'Could not send feedback message');
            }
          }
        };

        // Update writers with new sync instance
        this.tagWriter = new TagWriter(this.tagManager, this.storage, this.sync, feedbackCallback);
        this.groupWriter = new GroupWriter(this.storage, this.sync);
        
        // Update web server context if it exists
        await updateWebServerSync(this.sync);
        
        console.log(`✅ Sync plugin updated to: ${selectedPlugin}`);
        console.log('   The change is active immediately. No restart required.\n');
        
        // If Google Drive, offer to configure OAuth
        if (selectedPlugin === 'googledrive') {
          console.log('Would you like to configure Google Drive OAuth now?');
          console.log('  1) Configure OAuth now');
          console.log('  2) Skip (configure later)');
          console.log('');
          
          this.rl.question('> [1-2] (default: 1): ', (answer2) => {
            const trimmed2 = answer2.trim();
            if (trimmed2 === '2') {
              this.configureCloudSync();
            } else {
              this.configureGoogleDriveOAuth();
            }
          });
        } else {
          this.configureCloudSync();
        }
      } catch (error: any) {
        console.log(`❌ Error updating sync plugin: ${error.message}\n`);
        this.configureCloudSync();
      }
    });
  }

  /**
   * Update .env file (similar to wizard)
   */
  private async updateEnvFile(key: string, value: string): Promise<void> {
    try {
      const { existsSync } = await import('fs');
      const { promises: fs } = await import('fs');
      const { getEnvPath } = await import('../config/index.js');
      const envPath = getEnvPath();
      let envContent = '';
      
      if (existsSync(envPath)) {
        envContent = await fs.readFile(envPath, 'utf-8');
      }
      
      const lines = envContent.split('\n');
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
          found = true;
          return `${key}=${value}`;
        }
        return line;
      });
      
      if (!found) {
        newLines.push(`${key}=${value}`);
      }
      
      await fs.writeFile(envPath, newLines.join('\n'), 'utf-8');
    } catch (error) {
      logger.warn({ error, key, value }, 'Could not update .env file');
      throw error;
    }
  }

  /**
   * Install and configure a plugin from the CLI
   */
  private async installAndConfigurePlugin(): Promise<void> {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log('\n📦 Install and Configure Plugin');
    console.log('─────────────────────────────────────────────────────');
    
    const availablePlugins = getAvailableIngestors();
    
    if (availablePlugins.length === 0) {
      console.log('⚠️  No ingestor plugins are available in the registry.');
      console.log('Please add a plugin to src/plugins/registry.json\n');
      this.isInSubMenu = false;
      this.showMenu();
      this.prompt();
      return;
    }
    
    console.log('Available plugins:\n');
    availablePlugins.forEach((pluginName, index) => {
      const metadata = getIngestorMetadata(pluginName);
      const description = metadata?.description || 'No description';
      const deps = metadata?.dependencies && metadata.dependencies.length > 0 
        ? ` (requires: ${metadata.dependencies.join(', ')})`
        : '';
      console.log(`  ${index + 1}) ${pluginName} - ${description}${deps}`);
    });
    console.log(`  ${availablePlugins.length + 1}) Cancel`);
    console.log('');
    
    this.rl.question(`┌─ Select plugin [1-${availablePlugins.length + 1}]: `, async (answer) => {
      const trimmed = answer.trim();
      const choice = parseInt(trimmed, 10);
      
      if (isNaN(choice) || choice < 1 || choice > availablePlugins.length + 1) {
        console.log('❌ Invalid selection.\n');
        this.installAndConfigurePlugin();
        return;
      }
      
      if (choice === availablePlugins.length + 1) {
        // Cancel
        this.manageMessagingService();
        return;
      }
      
      const selectedPlugin = availablePlugins[choice - 1];
      if (!selectedPlugin) {
        console.log('❌ Invalid selection.\n');
        this.installAndConfigurePlugin();
        return;
      }
      
      const metadata = getIngestorMetadata(selectedPlugin);
      
      try {
        // Step 1: Install dependencies if needed
        if (metadata && metadata.dependencies && metadata.dependencies.length > 0) {
          console.log(`\n📦 Installing ${selectedPlugin} plugin dependencies automatically...`);
          console.log(`   This will install: ${metadata.dependencies.join(', ')}`);
          try {
            await installPlugin('ingestor', selectedPlugin);
            console.log(`✅ ${selectedPlugin} plugin dependencies installed successfully\n`);
          } catch (error: any) {
            console.log(`\n⚠️  Could not install dependencies automatically.`);
            if (metadata && metadata.dependencies && metadata.dependencies.length > 0) {
              console.log(`   Please run manually: npm install ${metadata.dependencies.join(' ')}\n`);
            }
            console.log('   Then restart Witral and try again.\n');
            this.manageMessagingService();
            return;
          }
        } else {
          console.log(`\n✅ ${selectedPlugin} plugin selected (no dependencies required)\n`);
        }
        
        // Step 2: Update .env file
        console.log('🔧 Configuring plugin...');
        await this.updateEnvFile('INGESTOR_TYPE', selectedPlugin);
        
        // Step 3: Update process.env and clear config cache
        process.env.INGESTOR_TYPE = selectedPlugin;
        _clearCache();
        const { config } = await import('dotenv');
        config();
        this.config = getConfig();
        
        // Step 4: Reload ingestor
        console.log('🔄 Loading plugin...');
        await this.reloadIngestor(selectedPlugin);
        
        console.log(`\n✅ Plugin "${selectedPlugin}" installed and configured successfully!`);
        console.log('💡 You can now connect to the messaging service.\n');
        
        // Return to messaging service menu
        this.manageMessagingService();
      } catch (error: any) {
        logger.error({ error }, 'Failed to install/configure plugin');
        console.log(`\n❌ Error: ${error.message}\n`);
        this.manageMessagingService();
      }
    });
  }

  /**
   * Reload ingestor with new plugin
   */
  private async reloadIngestor(pluginName: string): Promise<void> {
    try {
      // Stop current ingestor
      await this.ingestor.stop();
      
      // Create new ingestor
      const { createIngestor } = await import('../core/ingestor/factory.js');
      const newIngestor = await createIngestor(this.groupManager);
      
      // Configure TagManager if supported
      if ('setTagManager' in newIngestor && typeof (newIngestor as any).setTagManager === 'function') {
        (newIngestor as any).setTagManager(this.tagManager);
      }
      
      // Initialize new ingestor
      await newIngestor.initialize();
      
      // Replace ingestor instance
      this.ingestor = newIngestor;
      
      // Re-setup message handler with new ingestor
      this.setupMessageHandler();
      
      logger.debug({ plugin: pluginName }, 'Ingestor reloaded successfully');
    } catch (error: any) {
      logger.error({ error, plugin: pluginName }, 'Failed to reload ingestor');
      throw new Error(`Failed to load plugin "${pluginName}": ${error.message}`);
    }
  }

  private async exit(): Promise<void> {
    console.log('\n🛑 Closing Witral...\n');
    await this.ingestor.stop();
    this.rl.close();
    process.exit(0);
  }

  setupInputHandler(): void {
    // Handle Ctrl+C
    this.rl.on('SIGINT', async () => {
      console.log('\n\n🛑 Interruption detected. Closing...\n');
      await this.ingestor.stop();
      this.rl.close();
      process.exit(0);
    });
  }
}

