// Witral - Command Handler
// Modular command system that can be used by CLI or messaging platforms

import { IngestorInterface } from '../ingestor/interface.js';
import { GroupManager } from '../groups/index.js';
import { TagManager } from '../tags/index.js';
import { logger } from '../../utils/logger.js';

export interface CommandContext {
  ingestor: IngestorInterface;
  groupManager: GroupManager;
  tagManager: TagManager;
  sender?: string;
  groupName?: string;
  sendResponse?: (text: string) => Promise<void>;
}

export interface CommandResponse {
  text: string;
  requiresInput?: boolean;
  nextCommand?: string;
}

export class CommandHandler {
  private context: CommandContext;
  private commandState: Map<string, any> = new Map(); // State per user/group
  private timeouts: Map<string, NodeJS.Timeout> = new Map(); // Timeouts to auto-close menu
  private readonly MENU_TIMEOUT_MS = 120000; // 2 minutes

  constructor(context: CommandContext) {
    this.context = context;
  }

  /**
   * Helper to append exit instruction to menu messages
   */
  private appendExitInstruction(text: string): string {
    const exitNote = '\n\n_💡 Tip: Type "0" or "exit" to close the menu from any submenu_';
    // Only append if not already present
    if (text.includes('"0"') && text.includes('"exit"') && text.includes('close')) {
      return text;
    }
    return text + exitNote;
  }

  /**
   * Check if there's a pending state for a user
   */
  hasPendingState(userId: string): boolean {
    const state = this.commandState.get(userId);
    return state && state.waitingForInput === true;
  }

  /**
   * Process command and generate response
   */
  async processCommand(command: string, userId: string = 'default'): Promise<CommandResponse | null> {
    const trimmed = command.trim().toLowerCase();
    
    // Clear any existing timeout when user sends a command
    this.clearTimeout(userId);
    
    // GLOBAL EXIT: "0" or "exit" always closes the menu from any submenu
    if (trimmed === '0' || trimmed === 'exit') {
      const state = this.commandState.get(userId);
      if (state && state.waitingForInput) {
        this.clearState(userId);
        return { text: '👋 Menu closed.' };
      }
      // If no active menu, return null to process normally
      return null;
    }
    
    // Detect "menu,," or "menu" or ",,menu" command (for compatibility)
    if (trimmed === 'menu,,' || trimmed === 'menu' || trimmed === ',,menu') {
      return this.showMainMenu(userId);
    }

    // Check if there's a pending command (state)
    const state = this.commandState.get(userId);
    if (state && state.waitingForInput) {
      // Only process non-empty commands when menu is waiting for input
      // Empty strings or whitespace-only messages should not be processed as commands
      if (!trimmed || trimmed.length === 0) {
        return null; // Ignore empty messages, process normally (categorization)
      }
      
      if (state.currentMenu === 'main') {
        // Process main menu command
        return await this.handleMainMenuCommand(trimmed, userId);
      }
      return await this.handleInput(command, state, userId);
    }

    // If no pending state and not "menu", return null
    // so message is processed normally (categorization)
    return null;
  }

  /**
   * Show main menu
   */
  private showMainMenu(userId: string = 'default'): CommandResponse {
    const isConnected = this.context.ingestor.isConnected();
    const groups = this.context.groupManager.getAllGroups();
    const tags = this.context.tagManager.getAllTags();
    
    const status = isConnected ? '✅ Connected' : '❌ Disconnected';
    
    const qrOption = this.context.ingestor.requiresQR() 
      ? '1️⃣ QR - Generate QR code' 
      : '1️⃣ Connect - Connect to messaging service';
    const instructions = this.context.ingestor.getConnectionInstructions();
    
    const menu = `📱 *Witral - Universal Ingestion Framework* [${status}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Options:*

${qrOption}
2️⃣ Status - View connection status
3️⃣ Disconnect - Disconnect from service
4️⃣ Groups (${groups.length}) - Manage groups
5️⃣ Tags (${tags.length}) - Manage tags
6️⃣ Exit - Close menu

${instructions ? `_${instructions}_` : ''}

_Type the number or command name_`;

    // Set pending state to allow main menu commands
    this.commandState.set(userId, {
      waitingForInput: true,
      currentMenu: 'main',
      step: 'selectOption'
    });

    // Set timeout to auto-close menu after 2 minutes
    this.setTimeout(userId);

    return { text: menu, requiresInput: true };
  }

  /**
   * Handle main menu commands
   */
  private async handleMainMenuCommand(command: string, userId: string): Promise<CommandResponse> {
    switch (command) {
      case '1':
      case 'qr':
        this.clearState(userId);
        return await this.handleQR();
      case '2':
      case 'status':
        // Keep state to allow more commands
        return this.handleStatus();
      case '3':
      case 'disconnect':
        this.clearState(userId);
        return await this.handleDisconnect();
      case '4':
      case 'groups':
        return this.handleGroupsMenu(userId);
      case '5':
      case 'tags':
        return this.handleTagsMenu(userId);
      case '6':
      case 'exit':
        this.clearState(userId);
        return { text: '👋 Goodbye!' };
      default:
        // If command not recognized, keep menu and show error
        return { text: this.appendExitInstruction('❌ Invalid option. Type a number from 1 to 6 or the command name.'), requiresInput: true };
    }
  }

  /**
   * Handle QR generation
   */
  private async handleQR(): Promise<CommandResponse> {
    if (this.context.ingestor.isConnected()) {
      return { text: '⚠️ Already connected. Disconnect first if you want to generate a new QR code.\n\n_Type "menu" to return to main menu_' };
    }

    try {
      await this.context.ingestor.generateQR();
      return { text: '🔄 Generating QR code... Check the web dashboard or console to see it.\n\n_Type "menu" to return to main menu_' };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error generating QR from command');
      return { text: '❌ Error generating QR code. Please try again.\n\n_Type "menu" to return to main menu_' };
    }
  }

  /**
   * Handle status
   */
  private handleStatus(): CommandResponse {
    const isConnected = this.context.ingestor.isConnected();
    const state = this.context.ingestor.getConnectionState();
    const groups = this.context.groupManager.getAllGroups();
    const tags = this.context.tagManager.getAllTags();
    
    const statusText = isConnected ? '✅ Connected' : '❌ Disconnected';
    const stateText = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Disconnected';
    
    return {
      text: this.appendExitInstruction(`📊 *Connection Status*

Status: ${statusText}
Detail: ${stateText}
Monitored groups: ${groups.length}
Tags: ${tags.length}

_Type another menu command (1-6) or "menu" to return to main menu_`),
      requiresInput: true
    };
  }

  /**
   * Handle disconnect
   */
  private async handleDisconnect(): Promise<CommandResponse> {
    if (!this.context.ingestor.isConnected()) {
      return { text: '⚠️ No active connection.\n\n_Type "menu" to return to main menu_' };
    }

    try {
      await this.context.ingestor.stop();
      return { text: '✅ Disconnected successfully.\n\n_Type "menu" to return to main menu_' };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error disconnecting from command');
      return { text: '❌ Error disconnecting.\n\n_Type "menu" to return to main menu_' };
    }
  }

  /**
   * Show groups menu
   */
  private handleGroupsMenu(userId: string = 'default'): CommandResponse {
    const monitoredGroups = this.context.groupManager.getAllGroups();
    
    let groupsText = '';
    if (monitoredGroups.length === 0) {
      groupsText = '⚪ No monitored groups.';
    } else {
      groupsText = '*Monitored groups:*\n';
      monitoredGroups.forEach((group, index) => {
        groupsText += `${index + 1}. ${group.name}\n`;
      });
    }
    
    const menu = `📋 *Groups Management*

${groupsText}

*Options:*
1️⃣ List and add group
2️⃣ Remove group
3️⃣ Return to main menu

_Type the option number_
_💡 Tip: Type "0" or "exit" to close the menu from any submenu_`;

    // Save state to wait for input
    this.commandState.set(userId, {
      waitingForInput: true,
      currentMenu: 'groups',
      step: 'selectOption'
    });

    // Reset timeout for submenu
    this.setTimeout(userId);

    return { text: menu, requiresInput: true, nextCommand: 'groups' };
  }

  /**
   * Show tags menu
   */
  private handleTagsMenu(userId: string = 'default'): CommandResponse {
    const tags = this.context.tagManager.getAllTags();
    
    let tagsText = '';
    if (tags.length === 0) {
      tagsText = '⚪ No tags configured.';
    } else {
      tagsText = '*Tags:*\n';
      tags.forEach((tag, index) => {
        const mode = tag.fileMode || 'default';
        const modeIcon = tag.fileMode === 'append' ? '📝' : tag.fileMode === 'new-file' ? '📄' : '⚙️';
        tagsText += `${index + 1}. ${tag.name} ${modeIcon}${tag.description ? ` - ${tag.description}` : ''}\n`;
      });
      tagsText += '\n_📄=new-file, 📝=append, ⚙️=global default_';
    }
    
    const menu = `📁 *Tags Management*

${tagsText}

*Options:*
1️⃣ Create tag
2️⃣ Delete tag
3️⃣ Configure file mode per tag
4️⃣ Edit tag description
5️⃣ Return to main menu

_Type the option number_
_💡 Tip: Type "0" or "exit" to close the menu from any submenu_`;

    // Save state to wait for input
    this.commandState.set(userId, {
      waitingForInput: true,
      currentMenu: 'tags',
      step: 'selectOption'
    });

    // Reset timeout for submenu
    this.setTimeout(userId);

    return { text: menu, requiresInput: true, nextCommand: 'tags' };
  }

  /**
   * Handle input in submenus
   */
  private async handleInput(input: string, state: any, userId: string): Promise<CommandResponse | null> {
    // Ignore empty input
    const trimmed = input.trim();
    if (!trimmed || trimmed.length === 0) {
      return null; // Don't process empty messages, let them be categorized normally
    }
    
    // Reset timeout on any input
    this.setTimeout(userId);
    
    if (state.currentMenu === 'groups') {
      return await this.handleGroupsInput(input, state, userId);
    } else if (state.currentMenu === 'tags') {
      return await this.handleTagsInput(input, state, userId);
    }
    
    // Clear state if not recognized
    this.clearState(userId);
    return { text: this.appendExitInstruction('❌ Invalid option. Type "menu" to return to main menu.') };
  }

  /**
   * Handle input in groups menu
   */
  private async handleGroupsInput(input: string, state: any, userId: string): Promise<CommandResponse> {
    // GLOBAL EXIT: "0" or "exit" always closes the menu from any submenu
    const trimmed = input.trim().toLowerCase();
    if (trimmed === '0' || trimmed === 'exit') {
      this.clearState(userId);
      return { text: '👋 Menu closed.' };
    }

    // Handle post-action state (after successful operations)
    if (state.step === 'post-action') {
      if (trimmed === 'menu' || trimmed === 'return' || trimmed === 'back') {
        return this.handleGroupsMenu(userId);
      }
      // If user types anything else, treat as menu command
      return this.handleGroupsMenu(userId);
    }

    if (input === '3' || input.toLowerCase() === 'return' || input.toLowerCase() === 'back') {
      return this.showMainMenu(userId);
    }

    if (input === '1') {
      // List available groups
      try {
        if (!this.context.ingestor.isConnected()) {
          this.clearState(userId);
          return { text: '⚠️ Not connected. Connect first.' };
        }

        const groups = await this.context.ingestor.listGroups();
        const monitoredGroups = this.context.groupManager.getAllGroups();
        const monitoredNames = new Set(monitoredGroups.map(g => g.name.toLowerCase()));

        let groupsText = '*Available Groups:*\n\n';
        groups.forEach((group, index) => {
          const isMonitored = monitoredNames.has(group.name.toLowerCase());
          const status = isMonitored ? '✅ Monitored' : '⚪ Not monitored';
          groupsText += `${index + 1}. ${group.name} ${status}\n`;
          if (group.participants) {
            groupsText += `   👥 ${group.participants} participants\n`;
          }
          groupsText += '\n';
        });

        groupsText += '_Type the number of the group to add (or "cancel" to go back)_';

        this.commandState.set(userId, {
          waitingForInput: true,
          currentMenu: 'groups',
          step: 'selectGroup',
          availableGroups: groups
        });

        this.setTimeout(userId);
        return { text: this.appendExitInstruction(groupsText), requiresInput: true };
      } catch (error: any) {
        this.clearState(userId);
        logger.error({ error: error.message }, 'Error listing groups from command');
        return { text: '❌ Error getting groups. Check your connection.' };
      }
    }

    if (input === '2') {
      // Remove group
      const monitoredGroups = this.context.groupManager.getAllGroups();
      
      if (monitoredGroups.length === 0) {
        this.clearState(userId);
        return { text: '⚪ No monitored groups to remove.' };
      }

      let groupsText = '*Monitored Groups:*\n\n';
      monitoredGroups.forEach((group, index) => {
        groupsText += `${index + 1}. ${group.name}\n`;
      });
      groupsText += '\n_Type the number of the group to remove (or "cancel" to go back)_';

      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'groups',
        step: 'removeGroup',
        monitoredGroups: monitoredGroups
      });

      this.setTimeout(userId);
      return { text: this.appendExitInstruction(groupsText), requiresInput: true };
    }

    // If in step to select group to add
    if (state.step === 'selectGroup' && state.availableGroups) {
      if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'menu') {
        return this.handleGroupsMenu(userId);
      }

      const groupIndex = parseInt(input, 10) - 1;
      if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= state.availableGroups.length) {
        return { text: this.appendExitInstruction('❌ Invalid number. Type a number from the list or "cancel".'), requiresInput: true };
      }

      const selectedGroup = state.availableGroups[groupIndex];
      const monitoredGroups = this.context.groupManager.getAllGroups();
      const monitoredNames = new Set(monitoredGroups.map(g => g.name.toLowerCase()));

      if (monitoredNames.has(selectedGroup.name.toLowerCase())) {
        this.clearState(userId);
        return { text: `⚠️ Group "${selectedGroup.name}" is already being monitored.` };
      }

      await this.context.groupManager.addGroup(selectedGroup.name, selectedGroup.jid);
      
      const responseText = `✅ Group "${selectedGroup.name}" added to monitoring.\n\n_Type "menu" to return, or "0"/"exit" to close_`;
      
      // Keep a minimal state to allow "0" or "exit" to close menu
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'groups',
        step: 'post-action'
      });
      this.setTimeout(userId);
      
      return { text: responseText, requiresInput: true };
    }

    // If in step to remove group
    if (state.step === 'removeGroup' && state.monitoredGroups) {
      if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'menu') {
        return this.handleGroupsMenu(userId);
      }

      const groupIndex = parseInt(input, 10) - 1;
      if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= state.monitoredGroups.length) {
        return { text: this.appendExitInstruction('❌ Invalid number. Type a number from the list or "cancel".'), requiresInput: true };
      }

      const selectedGroup = state.monitoredGroups[groupIndex];
      await this.context.groupManager.removeGroup(selectedGroup.name);
      
      const responseText = `✅ Group "${selectedGroup.name}" removed from monitoring.\n\n_Type "menu" to return, or "0"/"exit" to close_`;
      
      // Keep a minimal state to allow "0" or "exit" to close menu
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'groups',
        step: 'post-action'
      });
      this.setTimeout(userId);
      
      return { text: responseText, requiresInput: true };
    }

    this.clearState(userId);
    return { text: '❌ Invalid option. Type "menu" to return to main menu.' };
  }

  /**
   * Handle input in tags menu
   */
  private async handleTagsInput(input: string, state: any, userId: string): Promise<CommandResponse> {
    // GLOBAL EXIT: "0" or "exit" always closes the menu from any submenu
    const trimmed = input.trim().toLowerCase();
    if (trimmed === '0' || trimmed === 'exit') {
      this.clearState(userId);
      return { text: '👋 Menu closed.' };
    }

    // Handle post-action state (after successful operations)
    if (state.step === 'post-action') {
      if (trimmed === 'menu' || trimmed === 'return' || trimmed === 'back') {
        return this.handleTagsMenu(userId);
      }
      // If user types anything else, treat as menu command
      return this.handleTagsMenu(userId);
    }

    // FIRST: Handle ongoing flows (steps) before menu options
    // This prevents "1", "2", "3" from being interpreted as menu options
    // when the user is in a sub-flow (like selecting file mode)

    // Handle create tag - enter name
    if (state.step === 'createTag_name') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const tagName = input.trim().toLowerCase();
      if (!tagName || tagName.length === 0) {
        return { text: this.appendExitInstruction('❌ Tag name cannot be empty. Try again or type "cancel".'), requiresInput: true };
      }

      // Check if tag already exists
      if (this.context.tagManager.getTag(tagName)) {
        return { text: this.appendExitInstruction(`❌ Tag "${tagName}" already exists. Choose a different name or type "cancel".`), requiresInput: true };
      }

      // Ask for file mode
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'createTag_mode',
        newTagName: tagName
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`📝 *File Mode for "${tagName}"*

How should messages be saved?

1️⃣ *new-file* - Each message creates a new file
   Example: tags/ideas/17-01-2026 - 13-10.md
   ✅ Supports dynamic titles (,,tag,,title content)

2️⃣ *append* - All messages go to the same file
   Example: tags/ideas.md (content added line by line)
   ⚠️ Dynamic titles NOT supported

3️⃣ *default* - Use global setting

_Type 1, 2, or 3_`),
        requiresInput: true 
      };
    }

    // Handle create tag - select mode
    if (state.step === 'createTag_mode') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      let fileMode: 'new-file' | 'append' | undefined;
      if (input === '1') {
        fileMode = 'new-file';
      } else if (input === '2') {
        fileMode = 'append';
      } else if (input === '3') {
        fileMode = undefined; // Use global default
      } else {
        return { text: this.appendExitInstruction('❌ Invalid option. Type 1, 2, or 3.'), requiresInput: true };
      }

      // Ask for description (optional)
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'createTag_description',
        newTagName: state.newTagName,
        newTagFileMode: fileMode
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`📝 *Description for "${state.newTagName}"*
        
Enter a description (optional, press Enter to skip):
        
_Type "cancel" to go back_`),
        requiresInput: true 
      };
    }

    // Handle create tag - enter description
    if (state.step === 'createTag_description') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const description = input.trim() || undefined;

      // Create the tag
      const success = await this.context.tagManager.addTag(
        state.newTagName,
        description,
        undefined, // enabledFields
        ',,', // separator
        state.newTagFileMode
      );

      if (success) {
        const modeText = state.newTagFileMode ? state.newTagFileMode : 'global default';
        let responseText = `✅ Tag "${state.newTagName}" created!\n\n📌 File mode: ${modeText}\n📝 Usage: ,,${state.newTagName} your message`;
        
        if (state.newTagFileMode === 'append') {
          responseText += `\n📁 File: tags/${state.newTagName}.md`;
          responseText += `\n⚠️ Note: Dynamic titles (,,tag,,title) are ignored in append mode`;
        }
        
        if (description) {
          responseText += `\n📄 Description: ${description}`;
        }
        
        responseText += `\n\n_Type "menu" to return, or "0"/"exit" to close_`;
        
        // Keep a minimal state to allow "0" or "exit" to close menu
        this.commandState.set(userId, {
          waitingForInput: true,
          currentMenu: 'tags',
          step: 'post-action'
        });
        this.setTimeout(userId);
        
        return { text: responseText, requiresInput: true };
      } else {
        this.clearState(userId);
        return { text: `❌ Could not create tag "${state.newTagName}".\n\n_Type "menu" to return, or "0"/"exit" to close_` };
      }
    }

    // Handle delete tag - select
    if (state.step === 'deleteTag_select') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const index = parseInt(input, 10) - 1;
      if (isNaN(index) || index < 0 || index >= state.tags.length) {
        return { text: this.appendExitInstruction('❌ Invalid number. Try again or type "cancel".'), requiresInput: true };
      }

      const selectedTag = state.tags[index];
      
      // Confirm deletion
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'deleteTag_confirm',
        tagToDelete: selectedTag.name
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`⚠️ *Delete tag "${selectedTag.name}"?*

This will remove the tag configuration.
Existing files will NOT be deleted.

Type "yes" to confirm or "cancel" to go back.`),
        requiresInput: true 
      };
    }

    // Handle delete tag - confirm
    if (state.step === 'deleteTag_confirm') {
      if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'no') {
        return this.handleTagsMenu(userId);
      }

      if (input.toLowerCase() !== 'yes') {
        return { text: this.appendExitInstruction('❌ Type "yes" to confirm or "cancel" to go back.'), requiresInput: true };
      }

      const success = await this.context.tagManager.removeTag(state.tagToDelete);
      
      if (success) {
        const responseText = `✅ Tag "${state.tagToDelete}" deleted.\n\n_Type "menu" to return, or "0"/"exit" to close_`;
        
        // Keep a minimal state to allow "0" or "exit" to close menu
        this.commandState.set(userId, {
          waitingForInput: true,
          currentMenu: 'tags',
          step: 'post-action'
        });
        this.setTimeout(userId);
        
        return { text: responseText, requiresInput: true };
      } else {
        this.clearState(userId);
        return { text: `❌ Could not delete tag "${state.tagToDelete}".\n\n_Type "menu" to return, or "0"/"exit" to close_` };
      }
    }

    // Handle configure mode - select tag
    if (state.step === 'configureMode_select') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const index = parseInt(input, 10) - 1;
      if (isNaN(index) || index < 0 || index >= state.tags.length) {
        return { text: this.appendExitInstruction('❌ Invalid number. Try again or type "cancel".'), requiresInput: true };
      }

      const selectedTag = state.tags[index];
      const currentMode = selectedTag.fileMode || 'default (global)';
      
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'configureMode_choose',
        tagToConfigure: selectedTag.name
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`⚙️ *Configure "${selectedTag.name}"*

Current mode: ${currentMode}

Select new mode:
1️⃣ *new-file* - Each message = new file
   ✅ Supports dynamic titles

2️⃣ *append* - All messages in one file
   ⚠️ No dynamic titles (ignored)

3️⃣ *default* - Use global setting

_Type 1, 2, or 3 (or "cancel")_`),
        requiresInput: true 
      };
    }

    // Handle configure mode - choose mode
    if (state.step === 'configureMode_choose') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      let newMode: 'new-file' | 'append' | undefined;
      if (input === '1') {
        newMode = 'new-file';
      } else if (input === '2') {
        newMode = 'append';
      } else if (input === '3') {
        newMode = undefined;
      } else {
        return { text: this.appendExitInstruction('❌ Invalid option. Type 1, 2, or 3.'), requiresInput: true };
      }

      const success = await this.context.tagManager.updateTag(state.tagToConfigure, { fileMode: newMode });
      
      if (success) {
        const modeText = newMode || 'global default';
        const responseText = `✅ Tag "${state.tagToConfigure}" updated!\n\nNew mode: ${modeText}\n\n_Type "menu" to return, or "0"/"exit" to close_`;
        
        // Keep a minimal state to allow "0" or "exit" to close menu
        this.commandState.set(userId, {
          waitingForInput: true,
          currentMenu: 'tags',
          step: 'post-action'
        });
        this.setTimeout(userId);
        
        return { text: responseText, requiresInput: true };
      } else {
        this.clearState(userId);
        return { text: `❌ Could not update tag "${state.tagToConfigure}".\n\n_Type "menu" to return, or "0"/"exit" to close_` };
      }
    }

    // THEN: Handle main menu options (only when not in a sub-flow)
    
    // Handle edit description - select tag
    if (state.step === 'editDescription_select') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const index = parseInt(input, 10) - 1;
      if (isNaN(index) || index < 0 || index >= state.tags.length) {
        return { text: this.appendExitInstruction('❌ Invalid number. Try again or type "cancel".'), requiresInput: true };
      }

      const selectedTag = state.tags[index];
      const currentDesc = selectedTag.description || '(no description)';
      
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'editDescription_enter',
        tagToEdit: selectedTag.name,
        currentDescription: selectedTag.description
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`✏️ *Edit Description for "${selectedTag.name}"*
        
Current description: ${currentDesc}
        
Enter new description (or press Enter to remove):
        
_Type "cancel" to go back_`),
        requiresInput: true 
      };
    }

    // Handle edit description - enter new description
    if (state.step === 'editDescription_enter') {
      if (input.toLowerCase() === 'cancel') {
        return this.handleTagsMenu(userId);
      }

      const newDescription = input.trim() || undefined;
      const success = await this.context.tagManager.updateTag(state.tagToEdit, { description: newDescription });
      
      if (success) {
        const descText = newDescription || '(no description)';
        const responseText = `✅ Description updated for "${state.tagToEdit}"!\n\nNew description: ${descText}\n\n_Type "menu" to return, or "0"/"exit" to close_`;
        
        // Keep a minimal state to allow "0" or "exit" to close menu
        this.commandState.set(userId, {
          waitingForInput: true,
          currentMenu: 'tags',
          step: 'post-action'
        });
        this.setTimeout(userId);
        
        return { text: responseText, requiresInput: true };
      } else {
        this.clearState(userId);
        return { text: `❌ Could not update description for "${state.tagToEdit}".\n\n_Type "menu" to return, or "0"/"exit" to close_` };
      }
    }

    // Handle return to main menu
    if (input === '5' || input.toLowerCase() === 'return' || input.toLowerCase() === 'back' || input.toLowerCase() === 'menu') {
      return this.showMainMenu(userId);
    }

    // Handle create tag
    if (input === '1') {
      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'createTag_name'
      });
      this.setTimeout(userId);
      return { 
        text: this.appendExitInstruction(`✨ *Create New Tag*

Enter the tag name (e.g., "ideas", "shopping", "notes"):

_Only letters, numbers, hyphens and underscores allowed_
_Type "cancel" to go back_`),
        requiresInput: true 
      };
    }

    // Handle delete tag
    if (input === '2') {
      const tags = this.context.tagManager.getAllTags();
      if (tags.length === 0) {
        return { text: this.appendExitInstruction('⚪ No tags to delete.\n\n_Type a number to continue_'), requiresInput: true };
      }

      let tagsText = '*Select tag to delete:*\n\n';
      tags.forEach((tag, index) => {
        tagsText += `${index + 1}. ${tag.name}\n`;
      });
      tagsText += '\n_Type the number or "cancel" to go back_';

      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'deleteTag_select',
        tags: tags
      });
      this.setTimeout(userId);
      return { text: this.appendExitInstruction(tagsText), requiresInput: true };
    }

    // Handle configure file mode per tag
    if (input === '3') {
      const tags = this.context.tagManager.getAllTags();
      if (tags.length === 0) {
        return { text: this.appendExitInstruction('⚪ No tags to configure.\n\n_Type a number to continue_'), requiresInput: true };
      }

      let tagsText = '*Select tag to configure file mode:*\n\n';
      tags.forEach((tag, index) => {
        const currentMode = tag.fileMode || 'default (global)';
        tagsText += `${index + 1}. ${tag.name} → ${currentMode}\n`;
      });
      tagsText += '\n_Type the number or "cancel" to go back_';

      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'configureMode_select',
        tags: tags
      });
      this.setTimeout(userId);
      return { text: this.appendExitInstruction(tagsText), requiresInput: true };
    }

    // Handle edit description
    if (input === '4') {
      const tags = this.context.tagManager.getAllTags();
      if (tags.length === 0) {
        return { text: this.appendExitInstruction('⚪ No tags to edit.\n\n_Type a number to continue_'), requiresInput: true };
      }

      let tagsText = '*Select tag to edit description:*\n\n';
      tags.forEach((tag, index) => {
        const desc = tag.description || '(no description)';
        tagsText += `${index + 1}. ${tag.name}\n   Current: ${desc}\n`;
      });
      tagsText += '\n_Type the number or "cancel" to go back_';

      this.commandState.set(userId, {
        waitingForInput: true,
        currentMenu: 'tags',
        step: 'editDescription_select',
        tags: tags
      });
      this.setTimeout(userId);
      return { text: this.appendExitInstruction(tagsText), requiresInput: true };
    }

    this.clearState(userId);
    return { text: '❌ Invalid option. Type "menu" to return to main menu.' };
  }

  /**
   * Set timeout to auto-close menu
   */
  private setTimeout(userId: string): void {
    // Clear existing timeout if any
    this.clearTimeout(userId);
    
    // Set new timeout
    const timeout = setTimeout(async () => {
      const state = this.commandState.get(userId);
      if (state && state.waitingForInput) {
        // Auto-close menu
        this.commandState.delete(userId);
        this.timeouts.delete(userId);
        
        // Send close message if sendResponse is available
        if (this.context.sendResponse) {
          try {
            await this.context.sendResponse('⏱️ *Menu closed*\n\n_Menu automatically closed after 2 minutes of inactivity. Type "menu" to open again._');
          } catch (error) {
            logger.debug({ error }, 'Could not send menu close message');
          }
        }
      }
    }, this.MENU_TIMEOUT_MS);
    
    this.timeouts.set(userId, timeout);
  }

  /**
   * Clear timeout for a user
   */
  private clearTimeout(userId: string): void {
    const timeout = this.timeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(userId);
    }
  }

  /**
   * Clear state for a user
   */
  clearState(userId: string = 'default'): void {
    this.clearTimeout(userId);
    this.commandState.delete(userId);
  }
}

