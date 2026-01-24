// Witral - First Run Wizard
// Interactive wizard to guide new users through initial setup

import { IngestorInterface } from '../core/ingestor/interface.js';
import { GroupManager } from '../core/groups/index.js';
import { TagManager } from '../core/tags/index.js';
import { StorageInterface } from '../core/storage/interface.js';
import { SyncInterface } from '../core/sync/interface.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createIngestor } from '../core/ingestor/factory.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { writeFile, readFile } from 'fs/promises';
import readline from 'readline';
import { sanitizeTagName, sanitizeSeparator } from '../utils/sanitize.js';
import { getAvailableIngestors, getIngestorMetadata, getAvailableSyncPlugins, getSyncMetadata } from '../core/plugins/registry.js';
import { installPlugin } from './plugin-installer.js';

const WIZARD_COMPLETED_FLAG = join(process.cwd(), 'data', '.wizard-completed');

export class FirstRunWizard {
  private rl: readline.Interface;
  private ingestor: IngestorInterface;
  private groupManager: GroupManager;
  private tagManager: TagManager;
  private storage: StorageInterface;
  private sync: SyncInterface;
  private config = getConfig();
  private webEnabled: boolean = false;
  private environment: 'development' | 'minimal' = 'development';

  constructor(
    ingestor: IngestorInterface,
    groupManager: GroupManager,
    tagManager: TagManager,
    storage: StorageInterface,
    sync: SyncInterface,
    rl: readline.Interface
  ) {
    this.ingestor = ingestor;
    this.groupManager = groupManager;
    this.tagManager = tagManager;
    this.storage = storage;
    this.sync = sync;
    this.rl = rl;
  }

  /**
   * Check if wizard should run
   */
  static shouldRun(): boolean {
    if (existsSync(WIZARD_COMPLETED_FLAG)) {
      return false;
    }
    return true;
  }

  /**
   * Mark wizard as completed
   */
  static async markCompleted(): Promise<void> {
    try {
      const { mkdir } = await import('fs/promises');
      const dir = join(WIZARD_COMPLETED_FLAG, '..');
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(WIZARD_COMPLETED_FLAG, new Date().toISOString(), 'utf-8');
    } catch (error) {
      logger.warn({ error }, 'Could not save wizard completion flag');
    }
  }

  /**
   * Run the wizard
   */
  async run(): Promise<void> {
    // Suppress logs during wizard
    const originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'error'; // Only show errors during wizard

    try {
      // IMPORTANT: Clear any residual input from stdin before starting wizard
      // This prevents buffered Enter keys or other input from interfering
      if (process.stdin.isTTY) {
        // Pause readline to prevent any buffered input from being processed
        this.rl.pause();
        // Drain stdin to clear any buffered input
        process.stdin.setRawMode(false);
        // Wait longer to ensure any buffered input is cleared
        await new Promise(resolve => setTimeout(resolve, 500));
        // Resume readline for wizard questions
        this.rl.resume();
      } else {
        // If not TTY, just wait a bit for terminal to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  🎉 Welcome to Witral - Universal Ingestion Framework!        ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('\nThis wizard will guide you through the complete setup.\n');

      // Step 1: Installation type selection
      const environment = await this.step1_Environment();
      this.environment = environment;

      // Minimal installation: skip all other steps, apply minimal config, then exit wizard
      if (environment === 'minimal') {
        await this.applyMinimalConfig();
        await FirstRunWizard.markCompleted();
        console.log('\n✅ Minimal setup complete!');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 Next steps (local dev mirror of production):');
        console.log('');
        console.log('  1. Exit: Press Ctrl+C to stop the container.');
        console.log('  2. Run:  docker compose down');
        console.log('  3. Run:  ./scripts/download-prod.sh --ip YOUR_PROD_IP --key /path/to/key.key');
        console.log('  4. Run:  docker compose up -d');
        console.log('');
        console.log('  Your local instance will then be a full mirror of production.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        if (originalLogLevel) process.env.LOG_LEVEL = originalLogLevel;
        return;
      }
      
      // Step 2: Messaging service (essential - connect first)
      await this.step2_MessagingService();
      
      // Step 3: Add groups to monitor (after connecting)
      await this.step3_AddGroups();

      // Step 4: Create first tag (after groups are set up)
      await this.step4_CreateTag();

      // Step 5: Tag file modes configuration
      await this.step5_TagFileModes();

      // Step 6: Dynamic titles configuration
      await this.step6_DynamicTitles();

      // Step 7: Web dashboard (optional - can be configured later)
      await this.step7_WebDashboard();

      // Step 8: Cloud sync configuration (optional - at the end)
      await this.step8_CloudSync();
      
      console.log('\n✅ Setup complete! You can now start using Witral.');
      console.log('💡 Tip: Type "menu" in any monitored messaging group to access the interactive menu.');
      
      // Show CLI access command if in setup mode
      if (process.env.WITRAL_SETUP_MODE === 'true') {
        console.log('\n💻 To interact with the CLI later:');
        console.log('   docker exec -it witral node dist/index.js\n');
      } else {
        console.log('');
      }
      
      await FirstRunWizard.markCompleted();
      
      // Restore log level
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    } catch (error: any) {
      if (error.message === 'WIZARD_SKIPPED') {
        console.log('\n⚠️  Wizard skipped. You can run the setup later or configure manually.\n');
        await FirstRunWizard.markCompleted();
      } else {
        logger.error({ error }, 'Error during wizard');
        console.log('\n❌ An error occurred during setup. You can continue manually.\n');
      }
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    }
  }

  /**
   * Step 1: Environment selection (development vs minimal)
   */
  private async step1_Environment(): Promise<'development' | 'minimal'> {
    const askQuestion = (): Promise<'development' | 'minimal'> => {
      return new Promise((resolve) => {
        this.rl.question('   ┌─ Your choice [1-2] (default: 1): ', (answer) => {
          const choice = answer.trim();
          if (choice === '' || choice === '1') {
            console.log('✅ Development installation selected\n');
            resolve('development');
          } else if (choice === '2') {
            console.log('✅ Minimal installation selected (for local dev + download-prod)\n');
            resolve('minimal');
          } else {
            console.log('⚠️  Invalid choice. Please enter 1 or 2.\n');
            resolve(askQuestion());
          }
        });
      });
    };
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  📍 Step 1: Installation Type                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('What type of installation do you need?');
    console.log('  1) Development installation (full setup wizard)');
    console.log('  2) Minimal installation (you will run download-prod next)');
    console.log('');
    
    return askQuestion();
  }

  /**
   * Apply minimal config for "minimal installation" flow.
   * Sets .env to minimal values (no ingestor, no sync, no web) and ensures structure exists.
   */
  private async applyMinimalConfig(): Promise<void> {
    await this.updateEnvFile('INGESTOR_TYPE', '');
    await this.updateEnvFile('SYNC_TYPE', 'local');
    await this.updateEnvFile('WEB_ENABLED', 'false');
    await this.updateEnvFile('TAG_FILE_MODE', 'new-file');
    await this.updateEnvFile('TAG_DYNAMIC_TITLES', 'true');
  }

  /**
   * Step 7: Web dashboard (optional - can be configured later)
   */
  private async step7_WebDashboard(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  🌐 Step 7: Web Dashboard                                      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('Witral includes an optional web dashboard.');
      console.log('You can always enable it later.\n');
      console.log('  1) Enable web dashboard');
      console.log('  2) Disable web dashboard (recommended)');
      console.log('');
      
      this.rl.question('   ┌─ Your choice [1-2] (default: 2): ', async (answer) => {
        const trimmed = answer.trim();
        const enable = trimmed === '1';  // Only enable if explicitly chosen
        this.webEnabled = enable;
        
        if (enable) {
          // Update .env
          await this.updateEnvFile('WEB_ENABLED', 'true');
          console.log('✅ Web dashboard enabled');
          const host = this.config.WEB_HOST === '0.0.0.0' ? 'localhost' : this.config.WEB_HOST;
          console.log(`   Access at: http://${host}:${this.config.WEB_PORT}/web\n`);
        } else {
          await this.updateEnvFile('WEB_ENABLED', 'false');
          console.log('✅ Web dashboard disabled\n');
        }
        
        resolve();
      });
    });
  }

  /**
   * Step 2: Messaging service (essential - connect first)
   */
  private async step2_MessagingService(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  🔌 Step 2: Messaging Service Plugin                           ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      
      // Check if an ingestor plugin is configured
      let ingestorType = this.config.INGESTOR_TYPE;
      
      if (!ingestorType || ingestorType.trim() === '') {
        // No plugin configured - ask user to select one from available plugins
        const availablePlugins = getAvailableIngestors();
        
        if (availablePlugins.length === 0) {
          console.log('⚠️  No ingestor plugins are available in the registry.');
          console.log('Please add a plugin to src/plugins/registry.json or configure INGESTOR_TYPE manually in .env file.\n');
          resolve();
          return;
        }
        
        console.log('No messaging service plugin is configured.');
        console.log('Let\'s set one up now.\n');
        console.log('Available ingestor plugins:');
        
        availablePlugins.forEach((pluginName, index) => {
          const metadata = getIngestorMetadata(pluginName);
          const description = metadata?.description || 'No description';
          console.log(`  ${index + 1}) ${pluginName} - ${description}`);
        });
        
        console.log(`  ${availablePlugins.length + 1}) Skip (configure manually in .env later)`);
        console.log('');
        
        const maxChoice = availablePlugins.length + 1;
        this.rl.question(`   ┌─ Your choice [1-${maxChoice}] (default: 1): `, async (answer) => {
          const trimmed = answer.trim();
          const choice = trimmed === '' ? 1 : parseInt(trimmed, 10);
          
          // Allow skipping (maxChoice is the "Skip" option)
          if (choice === maxChoice) {
            console.log('✅ Configuration skipped. You can configure it manually in .env or download from production.\n');
            resolve();
            return;
          }
          
          // Validate choice
          if (isNaN(choice) || choice < 1 || choice > maxChoice) {
            console.log('⚠️  Invalid selection. Please select a valid option.\n');
            // Re-prompt
            this.step2_MessagingService().then(resolve);
            return;
          }
          
          // User selected a plugin
          const selectedPlugin = availablePlugins[choice - 1];
          if (!selectedPlugin) {
            console.log('\n⚠️  Invalid selection.\n');
            resolve();
            return;
          }
          ingestorType = selectedPlugin;
          const metadata = getIngestorMetadata(ingestorType);
          await this.updateEnvFile('INGESTOR_TYPE', ingestorType);
          console.log(`✅ Plugin set to: ${ingestorType}`);
          
          // Install plugin dependencies if needed
          if (metadata && metadata.dependencies.length > 0) {
            console.log(`\n📦 Installing ${ingestorType} plugin dependencies automatically...`);
            console.log(`   This will install: ${metadata.dependencies.join(', ')}`);
          try {
              await installPlugin('ingestor', ingestorType);
              console.log(`✅ ${ingestorType} plugin installed successfully\n`);
            } catch (error: any) {
              console.log(`\n⚠️  Could not install ${ingestorType} automatically.`);
              if (metadata.dependencies.length > 0) {
                console.log(`   Please run manually: npm install ${metadata.dependencies.join(' ')}\n`);
              }
            }
          } else {
            console.log(`✅ ${ingestorType} plugin configured (no dependencies required)\n`);
          }
          
          // Now ask if they want to configure it
          console.log('Would you like to configure this messaging service now?');
          console.log('You can always configure it later from the main menu.\n');
          console.log('  1) Configure now');
          console.log('  2) Skip (configure later)');
          console.log('');
          
          this.rl.question('┌─ Your choice [1-2] (default: 1): ', async (answer2) => {
            const trimmed2 = answer2.trim();
            const shouldConfigure = trimmed2 !== '2';
            
            if (!shouldConfigure) {
              console.log('✅ Configuration skipped. You can configure it later from the main menu.\n');
              console.log('⚠️  Note: You will need to restart Witral for the plugin to be loaded.\n');
              resolve();
              return;
            }

            // Update process.env immediately (updateEnvFile already wrote to .env)
            process.env.INGESTOR_TYPE = ingestorType;
            
            // Clear config cache and reload
            const { _clearCache } = await import('../config/index.js');
            _clearCache();
            // Reload .env file to ensure consistency
            const { config } = await import('dotenv');
            config();
            this.config = getConfig();
            
            // Recreate the ingestor with the real plugin
            try {
              console.log('🔄 Loading plugin...\n');
              const { createIngestor } = await import('../core/ingestor/factory.js');
              const newIngestor = await createIngestor(this.groupManager);
              
              // Configure TagManager in new ingestor if supported
              if ('setTagManager' in newIngestor && typeof (newIngestor as any).setTagManager === 'function') {
                (newIngestor as any).setTagManager(this.tagManager);
              }
              
              // Initialize the new ingestor
              await newIngestor.initialize();
              
              // Replace the placeholder with the real ingestor
              this.ingestor = newIngestor;
              
              console.log('✅ Plugin loaded successfully\n');
              
              // Now configure the specific plugin immediately
              await this.step2a_ConfigurePlugin();
              resolve();
            } catch (error: any) {
              logger.warn({ error }, 'Could not load plugin');
              console.log('⚠️  Could not load plugin. You may need to restart Witral.\n');
              console.log('   Error:', error.message, '\n');
              resolve();
              return;
            }
          });
        });
      } else {
        // Plugin already configured
        console.log(`Detected plugin: ${ingestorType}`);
        console.log('Would you like to configure this messaging service now?');
        console.log('You can always configure it later from the main menu.\n');
        console.log('  1) Configure now');
        console.log('  2) Skip (configure later)');
        console.log('');
        
        this.rl.question('   ┌─ Your choice [1-2] (default: 1): ', async (answer) => {
          const trimmed = answer.trim();
          const shouldConfigure = trimmed !== '2';
          
          if (!shouldConfigure) {
            console.log('✅ Configuration skipped. You can configure it later from the main menu.\n');
            resolve();
            return;
          }

          // Now configure the specific plugin
          await this.step2a_ConfigurePlugin();
          resolve();
        });
      }
    });
  }

  /**
   * Step 2a: Configure the specific plugin (QR setup, connection, etc.)
   */
  private async step2a_ConfigurePlugin(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('🔄 Configuring messaging service...\n');
      
      // Check if this ingestor requires QR (Baileys does)
      const needsQR = this.ingestor.requiresQR();
      
      if (needsQR) {
        console.log('This service requires a QR code to connect.');
        console.log('You will scan it with your messaging app.\n');
        
        // Retry logic for unstable internet
        const maxRetries = 3;
        const retryDelay = 3000; // 3 seconds between retries
        const generateQRTimeout = 30000; // 30 seconds timeout per attempt
        
        let qrGenerated = false;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`🔄 Retrying connection (attempt ${attempt}/${maxRetries})...\n`);
            }
            
            // Generate QR with timeout
            const generatePromise = this.ingestor.generateQR();
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('QR generation timeout')), generateQRTimeout);
            });
            
            await Promise.race([generatePromise, timeoutPromise]);
            qrGenerated = true;
            break; // Success, exit retry loop
          } catch (error) {
            lastError = error;
            logger.warn({ error, attempt }, `QR generation attempt ${attempt} failed`);
            
            if (attempt < maxRetries) {
              console.log(`⚠️  Connection attempt ${attempt} failed. Retrying in ${retryDelay / 1000} seconds...\n`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }
        
        if (!qrGenerated) {
          logger.error({ error: lastError }, 'Could not generate QR after retries');
          console.log('⚠️  Could not generate QR after multiple attempts.');
          console.log('   Please check your internet connection and try again later from the main menu.\n');
          resolve();
          return;
        }
        
        // Wait for connection with timeout
        const connectionPromise = new Promise<void>((connectionResolve) => {
          const timeout = setTimeout(() => {
            console.log('\n⏱️  Connection timeout. You can connect later from the main menu.\n');
            connectionResolve();
          }, 120000); // 2 minutes
          
          this.ingestor.onConnected(() => {
            clearTimeout(timeout);
            console.log('\n✅ Connection established!\n');
            connectionResolve();
          });
        });
        
        await connectionPromise;
      } else {
        try {
          await this.ingestor.start();
          if (this.ingestor.isConnected()) {
            console.log('✅ Connection established!\n');
          } else {
            console.log('⚠️  Not connected. You can connect later from the main menu.\n');
            resolve();
            return;
          }
        } catch (error) {
          logger.warn({ error }, 'Could not connect during wizard');
          console.log('⚠️  Could not connect. You can connect later from the main menu.\n');
          resolve();
          return;
        }
      }

      // Groups will be added in step 3 (separate step)

      resolve();
    });
  }

  /**
   * Step 3: Add groups to monitor (after connecting)
   */
  private async step3_AddGroups(): Promise<void> {
    return new Promise(async (resolve) => {
      // Skip if no ingestor is configured (user skipped plugin selection)
      if (!this.config.INGESTOR_TYPE || this.config.INGESTOR_TYPE.trim() === '') {
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║  👥 Step 3: Add Groups to Monitor                              ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('⚠️  No messaging service configured. Skipping group setup.');
        console.log('You can add groups later after configuring a messaging service.\n');
        resolve();
        return;
      }
      
      try {
        const groups = await this.ingestor.listGroups();
        if (groups.length === 0) {
          console.log('No groups found. You can add them later from the menu.\n');
          resolve();
          return;
        }

        console.log(`Found ${groups.length} group(s).`);
        console.log('\nWould you like to monitor some groups now?');
        console.log('\n📋 What does "monitoring" a group mean?');
        console.log('   When you monitor a group, Witral will:');
        console.log('   • Listen for messages in that group');
        console.log('   • Detect tagged messages (e.g., ",,idea My idea")');
        console.log('   • Save tagged messages to organized files');
        console.log('   • Save all messages from the group to group files');
        console.log('\nAvailable groups:');
        groups.forEach((group, index) => {
          const isMonitored = this.groupManager.isMonitored(group.name);
          const status = isMonitored ? '✅ Already monitored' : '⚪ Not monitored';
          console.log(`  ${index + 1}. ${group.name} ${status}`);
        });

        console.log('');
        this.rl.question('   ┌─ Group numbers (e.g., 1,3,5) or Enter to skip: ', async (answer) => {
          // Sanitize input - remove any non-numeric characters except commas and spaces
          const sanitized = answer.trim().replace(/[^0-9,\s]/g, '');
          const trimmed = sanitized.trim();
          
          if (!trimmed) {
            console.log('Skipped. You can add groups later from the menu.\n');
            resolve();
            return;
          }

          const indices = trimmed.split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < groups.length);
          
          if (indices.length === 0) {
            console.log('⚠️  No valid group numbers entered. Skipping.\n');
            resolve();
            return;
          }
          
          let added = 0;
          for (const index of indices) {
            const group = groups[index];
            if (group && !this.groupManager.isMonitored(group.name)) {
              await this.groupManager.addGroup(group.name, group.jid);
              console.log(`✅ Added "${group.name}" to monitoring`);
              added++;
            }
          }

          if (added > 0) {
            console.log('');
          }
          resolve();
        });
      } catch (error) {
        logger.warn({ error }, 'Could not list groups during wizard');
        console.log('⚠️  Could not list groups. You can add them later from the menu.\n');
        resolve();
      }
    });
  }

  /**
   * Step 4: Create first tag
   */
  private async step4_CreateTag(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  🏷️  Step 4: Create Your First Tag                            ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('Tags help you organize messages. When you send a message like:');
      console.log('  ,,idea This is a great idea!');
      console.log('Witral will save it to a file for that tag.\n');

      const existingTags = this.tagManager.getAllTags();
      if (existingTags.length > 0) {
        console.log(`✅ You already have ${existingTags.length} tag(s) configured.\n`);
        resolve();
        return;
      }

      console.log('Let\'s create your first tag.\n');

      // Tag name
      this.rl.question('   ┌─ Tag name (e.g., "idea", "todo", "note") or Enter to skip: ', async (tagName) => {
        // Sanitize input - remove control characters and non-printable characters
        const sanitized = tagName.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        const trimmed = sanitized.trim();

        if (!trimmed) {
          console.log('✅ Tag creation skipped. You can create tags later from the menu.\n');
          resolve();
          return;
        }

        try {
          const sanitizedName = sanitizeTagName(trimmed);

          // Separator
          console.log('');
          this.rl.question('   ┌─ Separator (1-3 characters, default: ",,") or Enter for default: ', async (separator) => {
            // Sanitize input - remove control characters
            const sanitizedInput = separator.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            const sanitizedSeparator = sanitizeSeparator(sanitizedInput || ',,');

            // Description (optional)
            console.log('');
            this.rl.question('   ┌─ Description (optional, press Enter to skip): ', async (description) => {
              // Sanitize input - remove control characters
              const sanitizedDesc = description.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
              const desc = sanitizedDesc.trim() || undefined;

              // File mode for this tag
              console.log('');
              console.log('   File mode for this tag:');
              console.log('     1) new-file - Each message creates a new file');
              console.log('        ✅ Supports dynamic titles (,,tag,,title content)');
              console.log('     2) append - All messages go to the same file (line by line)');
              console.log('        ⚠️  Dynamic titles NOT supported (will be ignored)');
              console.log('     3) default - Use global setting');
              console.log('');
              
              this.rl.question('   ┌─ Your choice [1-3] (default: 3): ', async (modeChoice) => {
                const sanitizedChoice = modeChoice.trim().replace(/[^123]/g, '');
                
                let fileMode: 'new-file' | 'append' | undefined;
                if (sanitizedChoice === '1') {
                  fileMode = 'new-file';
                } else if (sanitizedChoice === '2') {
                  fileMode = 'append';
                } else {
                  fileMode = undefined; // Use global default
                }

                const added = await this.tagManager.addTag(
                  sanitizedName,
                  desc,
                  ['AUTOR', 'HORA', 'FECHA', 'CONTENIDO'],
                  sanitizedSeparator,
                  fileMode
                );

                if (added) {
                  const modeText = fileMode || 'global default';
                  console.log(`\n✅ Created tag "${sanitizedName}" (mode: ${modeText})`);
                  console.log(`   Use it by sending: ${sanitizedSeparator}${sanitizedName} your message here`);
                  if (fileMode === 'append') {
                    console.log(`   📁 File: tags/${sanitizedName}.md`);
                    console.log(`   ⚠️  Note: Dynamic titles are ignored in append mode`);
                  }
                  console.log('');
                } else {
                  console.log(`\n⚠️  Tag "${sanitizedName}" already exists.\n`);
                }

                resolve();
              });
            });
          });
        } catch (error) {
          console.log(`\n❌ Invalid tag name. Skipping tag creation.\n`);
          resolve();
        }
      });
    });
  }

  /**
   * Step 8: Cloud sync configuration (optional)
   */
  private async step8_CloudSync(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ☁️  Step 8: Cloud Sync Configuration                        ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('Witral can sync your files to cloud storage services.');
      console.log('Files are always saved locally first, then synced to cloud.\n');
      
      const availableSyncPlugins = getAvailableSyncPlugins().filter(name => name !== 'local'); // 'local' is always option 1
      
      console.log('Available sync services:');
      console.log('  1) Local only (default)');
      
      availableSyncPlugins.forEach((pluginName, index) => {
        const metadata = getSyncMetadata(pluginName);
        const description = metadata?.description || 'Cloud sync plugin';
        console.log(`  ${index + 2}) ${metadata?.name || pluginName} - ${description}`);
      });
      
      console.log('');
      console.log('💡 Tip: You can configure cloud sync later from the CLI or dashboard.\n');
      
      const maxChoice = availableSyncPlugins.length + 1;
      this.rl.question(`   ┌─ Your choice [1-${maxChoice}] (default: 1): `, async (answer) => {
        const trimmed = answer.trim();
        const choice = trimmed === '' ? 1 : parseInt(trimmed, 10);
        
        if (choice === 1 || isNaN(choice) || choice < 1 || choice > maxChoice) {
          console.log('\n✅ Using local storage only.');
          console.log('   You can configure cloud sync later from the CLI or dashboard.\n');
          resolve();
          return;
        }
        
        // User selected a cloud sync plugin
        const selectedPlugin = availableSyncPlugins[choice - 2];
        if (!selectedPlugin) {
          console.log('\n⚠️  Invalid selection. Using local storage only.\n');
          resolve();
          return;
        }
        
        const metadata = getSyncMetadata(selectedPlugin);
        
        if (selectedPlugin === 'googledrive') {
          // Google Drive requires OAuth setup
          await this.step4a_GoogleDriveSetup();
        } else {
          // Generic plugin setup (for future plugins)
          await this.updateEnvFile('SYNC_TYPE', selectedPlugin);
          console.log(`\n✅ Cloud sync set to: ${metadata?.name || selectedPlugin}`);
          console.log('   You may need to configure additional settings later.\n');
        }
        
        resolve();
      });
    });
  }

  /**
   * Step 4a: Google Drive OAuth setup
   */
  private async step4a_GoogleDriveSetup(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ☁️  Google Drive Setup                                       ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('\nTo connect Google Drive, create OAuth credentials in GCP:');
      console.log('');
      console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
      console.log('2. Click "Create Credentials" → "OAuth client ID"');
      console.log('3. Select "Desktop app" as application type');
      console.log('4. Copy the Client ID and Client Secret');
      console.log('');
      
      // Pause readline to clear any residual input from previous step
      this.rl.pause();
      // Wait longer to ensure any buffered Enter key is processed
      await new Promise(resolve => setTimeout(resolve, 300));
      // Resume readline for the new question
      this.rl.resume();
      
      this.rl.question('   ┌─ Client ID (or Enter to skip): ', async (clientId) => {
        const trimmedClientId = clientId.trim();
        
        if (!trimmedClientId) {
          console.log('\n⚠️  Google Drive setup skipped.');
          console.log('   You can configure this later from the CLI or dashboard.\n');
          resolve();
          return;
        }
        
        this.rl.question('   ┌─ Client Secret: ', async (clientSecret) => {
          const trimmedSecret = clientSecret.trim();
          
          if (!trimmedSecret) {
            console.log('\n⚠️  Client Secret is required.');
            console.log('   You can configure this later from the CLI or dashboard.\n');
            resolve();
            return;
          }
          
          try {
            // Create credentials JSON (Desktop App format)
            const credentials = {
              installed: {
                client_id: trimmedClientId,
                client_secret: trimmedSecret
              }
            };
            
            // Save credentials file
            const { promises: fs, existsSync } = await import('fs');
            const { dirname } = await import('path');
            const credentialsPath = './data/googledrive/oauth-credentials.json';
            const dirPath = dirname(credentialsPath);
            
            if (!existsSync(dirPath)) {
              await fs.mkdir(dirPath, { recursive: true });
            }
            
            // Security: Save credentials file with restricted permissions (owner read/write only)
            await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { encoding: 'utf-8', mode: 0o600 });
            
            // Update env file and process.env
            await this.updateEnvFile('GOOGLE_OAUTH_CREDENTIALS_PATH', credentialsPath);
            await this.updateEnvFile('SYNC_TYPE', 'googledrive');
            
            // Update process.env immediately so createSync() will use googledrive
            process.env.GOOGLE_OAUTH_CREDENTIALS_PATH = credentialsPath;
            process.env.SYNC_TYPE = 'googledrive';
            
            console.log('\n✅ Credentials saved');
            
            // Continue with OAuth authorization
            await this.step4b_GoogleDriveOAuth();
            resolve();
          } catch (error: any) {
            console.log(`\n❌ Error saving credentials: ${error.message}`);
            console.log('   You can configure this later from the CLI or dashboard.\n');
            resolve();
          }
        });
      });
    });
  }

  /**
   * Step 4b: Google Drive OAuth authorization (Desktop App flow)
   * Uses a temporary HTTP server on localhost to receive the OAuth callback
   * Works locally and via SSH (with port forwarding or manual code entry)
   */
  private async step4b_GoogleDriveOAuth(): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        const { isOAuthConfigured, getAuthorizationUrl, exchangeCodeForTokens } = await import('../plugins/sync/googledrive/oauth.js');
        const http = await import('http');
        const urlModule = await import('url');
        
        const configured = await isOAuthConfigured();
        if (!configured) {
          console.log('\n⚠️  OAuth credentials not properly configured.\n');
          resolve();
          return;
        }
        
        console.log('\n🔐 Authorize Google Drive Access');
        console.log('─────────────────────────────────────────────────────');
        
        // Use port 3000 which is mapped from Docker container to host
        const port = 3000;
        let server: any = null;
        let authCompleted = false;
        let codeReceived: string | null = null;
        
        // Start temporary HTTP server to receive callback
        const serverReady = new Promise<void>((readyResolve) => {
          server = http.createServer(async (req, res) => {
            const parsedUrl = urlModule.parse(req.url || '', true);
            
            // Desktop App OAuth redirects to root path with ?code=...
            const code = parsedUrl.query.code as string;
            const error = parsedUrl.query.error as string;
            
            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Error</h1>
                  <p>${error}</p>
                  <p>You can close this window.</p>
                </body></html>
              `);
              codeReceived = 'error';
              return;
            }
            
            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>✅ Authorization Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </body></html>
              `);
              codeReceived = code;
              return;
            }
            
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Witral OAuth</h1>
                <p>Waiting for authorization...</p>
              </body></html>
            `);
          });
          
          // Listen on all interfaces to handle WSL/Docker networking
          server.listen(port, () => {
            readyResolve();
          });
        });
        
        // Wait for server to be ready
        await serverReady;
        
        // Generate auth URL
        const authUrl = await getAuthorizationUrl(port);
        
        console.log('\n📋 Open this URL in your browser:\n');
        console.log(`   ${authUrl}\n`);
        console.log('─────────────────────────────────────────────────────');
        console.log('⏳ Waiting for authorization...');
        console.log('');
        console.log('💡 After authorizing in your browser, the page will redirect');
        console.log('   automatically. If it doesn\'t work, copy the code from the');
        console.log('   URL (after "code=") and paste it below.');
        console.log('');
        console.log('   ┌─ Authorization code (or Enter to wait for callback): ');
        
        // Wait for either: HTTP callback, manual code entry, or timeout
        const result = await new Promise<string | null>((waitResolve) => {
          let resolved = false;
          
          // Check for HTTP callback every 500ms
          const checkInterval = setInterval(() => {
            if (codeReceived && codeReceived !== 'error') {
              if (!resolved) {
                resolved = true;
                clearInterval(checkInterval);
                waitResolve(codeReceived);
              }
            } else if (codeReceived === 'error') {
              if (!resolved) {
                resolved = true;
                clearInterval(checkInterval);
                waitResolve(null);
              }
            }
          }, 500);
          
          // Allow manual code entry
          this.rl.once('line', (input) => {
            const trimmed = input.trim();
            if (!resolved) {
              resolved = true;
              clearInterval(checkInterval);
              if (trimmed) {
                waitResolve(trimmed);
              } else {
                // User pressed Enter - keep waiting for callback
                // Re-register the line listener
                const waitForCallback = () => {
                  if (codeReceived && codeReceived !== 'error') {
                    waitResolve(codeReceived);
                  } else if (codeReceived === 'error') {
                    waitResolve(null);
                  } else {
                    setTimeout(waitForCallback, 500);
                  }
                };
                waitForCallback();
              }
            }
          });
          
          // Timeout after 3 minutes
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              clearInterval(checkInterval);
              waitResolve(null);
            }
          }, 180000);
        });
        
        // Cleanup server
        if (server) {
          server.close();
        }
        
        if (!result) {
          console.log('\n⚠️  OAuth authorization timed out or was cancelled.');
          console.log('   You can complete this later from the main menu.\n');
          resolve();
          return;
        }
        
        // Exchange code for tokens
        authCompleted = true;
        console.log('\n🔄 Exchanging code for tokens...');
        
        try {
          await exchangeCodeForTokens(result, port);
          
          // Reinitialize sync with OAuth
          const { createSync } = await import('../core/sync/factory.js');
          const { _clearCache } = await import('../config/index.js');
          _clearCache();
          const newSync = await createSync();
          await newSync.initialize();
          
          // Update the sync instance used by this wizard
          this.sync = newSync;
          
          if (newSync.isConnected()) {
            const status = newSync.getConnectionStatus();
            console.log('✅ Cloud sync connected successfully!');
            if (status.userEmail) {
              console.log(`   Account: ${status.userEmail}\n`);
            }
          } else {
            console.log('\n✅ Authorization successful!');
            console.log('   Cloud sync will be active on next restart.\n');
          }
        } catch (error: any) {
          console.log(`\n❌ Error: ${error.message}`);
          console.log('   You can try again later from the main menu.\n');
        }
        
        resolve();
      } catch (error: any) {
        console.log(`\n❌ Error: ${error.message}`);
        console.log('   You can configure cloud sync later from the main menu.\n');
        resolve();
      }
    });
  }
  


  /**
   * Step 5: Tag file modes configuration
   */
  private async step5_TagFileModes(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  📝 Step 5: Tag File Modes Configuration                      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('Witral supports two modes for saving tagged messages:\n');
      console.log('  1) New-file mode (default): Each message creates a new file');
      console.log('     Example: Each "idea" message creates tags/idea_[timestamp].md');
      console.log('     Ideal for Obsidian and other PKM systems\n');
      console.log('  2) Append mode: All messages are added to the same file');
      console.log('     Example: All "idea" messages go to tags/idea.md\n');
      
      this.rl.question('   ┌─ File mode [1=new-file, 2=append] (default: 1): ', async (answer) => {
        // Sanitize input - only allow 1, 2, or empty
        const sanitized = answer.trim().replace(/[^12]/g, '');
        const fileMode = sanitized === '2' ? 'append' : 'new-file';
        await this.updateEnvFile('TAG_FILE_MODE', fileMode);
        console.log(`✅ File mode set to: ${fileMode}\n`);
        resolve();
      });
    });
  }

  /**
   * Step 6: Dynamic titles configuration
   */
  private async step6_DynamicTitles(): Promise<void> {
    return new Promise(async (resolve) => {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  🏷️  Step 6: Dynamic Titles Configuration                    ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('Dynamic titles allow you to specify custom filenames for your tagged messages.\n');
      console.log('Format: tag+separator+title+space+content');
      console.log('Example: ",,idea,,Christmas buy gifts"');
      console.log('  → Saves to: tags/idea/Christmas.md');
      console.log('  → Content: "buy gifts" (title is used for filename only)\n');
      console.log('This ensures native compatibility with Obsidian and other PKM systems.\n');
      
      console.log('  1) Enable dynamic titles (default)');
      console.log('  2) Disable dynamic titles');
      console.log('');
      
      this.rl.question('   ┌─ Your choice [1-2] (default: 1): ', async (answer) => {
        // Sanitize input - only allow 1, 2, or empty
        const sanitized = answer.trim().replace(/[^12]/g, '');
        const dynamicTitles = sanitized !== '2';
        await this.updateEnvFile('TAG_DYNAMIC_TITLES', dynamicTitles ? 'true' : 'false');
        console.log(`✅ Dynamic titles ${dynamicTitles ? 'enabled' : 'disabled'}\n`);
        resolve();
      });
    });
  }

  /**
   * Update .env file
   */
  private async updateEnvFile(key: string, value: string): Promise<void> {
    const { getEnvPath } = await import('../config/index.js');
    const envPath = getEnvPath();
    
    try {
      const { mkdir } = await import('fs/promises');
      
      // Ensure directory exists (for ./data/.env)
      const dirPath = envPath.includes('/') ? envPath.substring(0, envPath.lastIndexOf('/')) : '.';
      if (dirPath !== '.' && !existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
      }
      
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = await readFile(envPath, 'utf-8');
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
      
      await writeFile(envPath, newLines.join('\n'), 'utf-8');
      logger.debug({ key, value, path: envPath }, 'Updated .env file successfully');
    } catch (error) {
      // Log full error details for debugging
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ error: errorMsg, stack: errorStack, key, value, path: envPath }, '❌ Failed to update .env file - configuration may not persist');
      // Don't re-throw - allow wizard to continue, but log error so it's visible
    }
  }

  /**
   * Get web enabled status (for index.ts)
   */
  getWebEnabled(): boolean {
    return this.webEnabled;
  }

  /**
   * Get the current ingestor (may have been replaced with real plugin)
   */
  getIngestor(): IngestorInterface {
    return this.ingestor;
  }

  /**
   * Get the current sync (may have been updated with OAuth)
   */
  getSync(): SyncInterface {
    return this.sync;
  }
}
