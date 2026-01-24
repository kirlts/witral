// Witral - Baileys Plugin (Example Implementation)
// Optional ingestor plugin using @whiskeysockets/baileys
// This module must be installed as an optional dependency

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { IngestorInterface, Message, Group, ConnectionState } from '../../core/ingestor/interface.js';
import { GroupManager } from '../../core/groups/index.js';
import { TagManager } from '../../core/tags/index.js';
import { CommandHandler, CommandContext } from '../../core/commands/handler.js';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { broadcastSSE } from '../../web/sse.js';

export class BaileysIngestor implements IngestorInterface {
  private socket: WASocket | null = null;
  private config = getConfig();
  private groupManager: GroupManager;
  private tagManager?: TagManager;
  private commandHandler?: CommandHandler;
  private isConnecting = false;
  private connectionState: ConnectionState = 'disconnected';
  private currentQR: string | null = null;
  private connectionCallbacks: Set<() => void> = new Set();
  private messageCallbacks: Set<(message: Message) => void> = new Set();
  private isInitialSync = true;
  private initialSyncTimeout: NodeJS.Timeout | null = null;
  private shouldDisplayQR = false; // Flag to show QR only when explicitly requested

  constructor(groupManager?: GroupManager, tagManager?: TagManager) {
    this.groupManager = groupManager || new GroupManager();
    this.tagManager = tagManager;
    
    // Initialize CommandHandler if we have tagManager
    if (this.tagManager) {
      const context: CommandContext = {
        ingestor: this,
        groupManager: this.groupManager,
        tagManager: this.tagManager,
        sendResponse: async (text: string) => {
          // This method will be used when a command is detected
          // Will be implemented in message handler
        }
      };
      this.commandHandler = new CommandHandler(context);
    }
  }

  /**
   * Configure CommandHandler (called from index.ts after initializing tagManager)
   */
  setTagManager(tagManager: TagManager): void {
    logger.debug('Configuring CommandHandler with TagManager');
    this.tagManager = tagManager;
    const context: CommandContext = {
      ingestor: this,
      groupManager: this.groupManager,
      tagManager: tagManager,
      sendResponse: async (text: string) => {
        // Implemented in handleCommand
      }
    };
    this.commandHandler = new CommandHandler(context);
    logger.debug('✅ CommandHandler configured correctly');
  }


  async initialize(): Promise<void> {
    await this.groupManager.load();
  }


  async start(): Promise<void> {
    if (this.isConnecting || this.connectionState === 'connected') {
      return;
    }

    this.shouldDisplayQR = false; // Don't show QR automatically on startup
    this.isConnecting = true;
    this.connectionState = 'connecting';

    try {
      logger.info('🔄 Attempting to connect to messaging service...');
      await this.connect();
      // Connection success will be logged in connection.update handler
    } catch (error) {
      logger.error({ error }, '❌ Error starting ingestor');
      this.isConnecting = false;
      this.connectionState = 'disconnected';
    }
  }

  async generateQR(): Promise<void> {
    if (this.connectionState === 'connected') {
      logger.warn('Already connected. Disconnect first if you want to generate a new QR code.');
      return;
    }

    if (this.socket) {
      await this.stop();
    }

    this.shouldDisplayQR = true; // Activate flag to show QR
    this.isConnecting = true;
    this.connectionState = 'connecting';

    try {
      await this.connect();
    } catch (error) {
      logger.error({ error }, 'Error generating QR');
      this.isConnecting = false;
      this.connectionState = 'disconnected';
      this.shouldDisplayQR = false;
      throw error;
    }
  }

  private async connect(): Promise<void> {
    // CRITICAL: Clean up existing socket before creating new one
    // This prevents event listener leaks and "zombie" sockets
    if (this.socket) {
      try {
        // Remove specific event listeners we registered
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        // Gracefully close the existing socket (this will clean up remaining listeners)
        this.socket.end(undefined);
      } catch (error) {
        logger.debug({ error }, 'Error cleaning up existing socket (may already be closed)');
      }
      this.socket = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(
      this.config.INGESTOR_SESSION_PATH
    );

    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Witral'),
      logger: logger.child({ component: 'baileys' }, { level: 'fatal' }), // Only show fatal errors, suppress stream:error
      getMessage: async () => undefined,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      generateHighQualityLinkPreview: false,
    });

    this.socket.ev.on('creds.update', async () => {
      await saveCreds();
    });

    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQR = qr;
        
        // Send QR to SSE (always, for web dashboard)
        // Send original QR code so frontend can generate image
        try {
          broadcastSSE('qr', { 
            qrCode: qr, // Original QR code for image generation
            message: 'QR code generated, scan with your messaging app' 
          });
        } catch (error) {
          // Ignore if no SSE clients connected
        }
        
        // Only show QR in terminal if explicitly requested (through menu)
        if (this.shouldDisplayQR) {
          process.stdout.write('\n\n');
          process.stdout.write('═══════════════════════════════════════════════════════\n');
          process.stdout.write('📱 SCAN THIS QR CODE WITH YOUR MESSAGING APP:\n');
          process.stdout.write('═══════════════════════════════════════════════════════\n');
          process.stdout.write('\n');
          qrcode.generate(qr, { small: true });
          process.stdout.write('\n');
          process.stdout.write('═══════════════════════════════════════════════════════\n');
          process.stdout.write('⏱️  You have 60 seconds to scan the QR code\n');
          process.stdout.write('📱 Open your messaging app and scan the code\n');
          process.stdout.write('═══════════════════════════════════════════════════════\n');
        }
      }

      if (connection === 'close') {
        // Handle cases where lastDisconnect might be undefined (silent disconnect bug in Baileys)
        // This is a known issue where connections close after ~12-24 hours without proper disconnect event
        const errorCode = lastDisconnect?.error 
          ? (lastDisconnect.error as Boom)?.output?.statusCode 
          : undefined;
        const shouldReconnect = errorCode !== DisconnectReason.loggedOut && errorCode !== 401;
        
        // If lastDisconnect is undefined/empty, it's likely a silent disconnect - attempt reconnect
        const isSilentDisconnect = !lastDisconnect || !lastDisconnect.error;
        if (isSilentDisconnect) {
          logger.warn('Silent disconnect detected (no disconnect reason provided) - this is a known Baileys issue after ~12-24 hours');
        }

        const errorData = lastDisconnect?.error as any;
        const isStreamError = errorData?.data?.tag === 'stream:error';
        const isRestartRequired = 
          errorCode === 515 ||
          errorData?.data?.attrs?.code === '515' ||
          isStreamError;

        const isUnauthorized = errorCode === 401 || errorData?.data?.reason === '401';

        // Handle stream:error silently - it's a normal part of connection process
        if (isStreamError && isRestartRequired) {
          logger.debug('Stream restart required (normal connection process)');
          this.socket = null;
          this.isConnecting = false;
          this.connectionState = 'disconnected';
          
          setTimeout(async () => {
            if (this.connectionState === 'disconnected' && !this.isConnecting) {
              this.isConnecting = true;
              this.connectionState = 'connecting';
              
              // Broadcast connecting state change to dashboard
              try {
                broadcastSSE('connection-status', { state: 'connecting', isConnected: false });
              } catch (error) {
                // Ignore SSE errors
              }
              
              try {
                await this.connect();
              } catch (error) {
                logger.error({ error }, 'Error reconnecting');
                this.isConnecting = false;
                this.connectionState = 'disconnected';
                
                // Broadcast disconnection state change to dashboard
                try {
                  broadcastSSE('connection-status', { state: 'disconnected', isConnected: false });
                } catch (error) {
                  // Ignore SSE errors
                }
              }
            }
          }, 2000);
          return;
        }

        if (isUnauthorized) {
          logger.warn('Invalid credentials. Clearing session...');
          this.socket = null;
          this.isConnecting = false;
          this.connectionState = 'disconnected';
          return;
        }

        if (isRestartRequired && shouldReconnect) {
          logger.debug('Restart required after pairing. Reconnecting...');
          this.socket = null;
          this.isConnecting = false;
          this.connectionState = 'disconnected';
          
          setTimeout(async () => {
            if (this.connectionState === 'disconnected' && !this.isConnecting) {
              this.isConnecting = true;
              this.connectionState = 'connecting';
              
              // Broadcast connecting state change to dashboard
              try {
                broadcastSSE('connection-status', { state: 'connecting', isConnected: false });
              } catch (error) {
                // Ignore SSE errors
              }
              
              try {
                await this.connect();
              } catch (error) {
                logger.error({ error }, 'Error reconnecting');
                this.isConnecting = false;
                this.connectionState = 'disconnected';
                
                // Broadcast disconnection state change to dashboard
                try {
                  broadcastSSE('connection-status', { state: 'disconnected', isConnected: false });
                } catch (error) {
                  // Ignore SSE errors
                }
              }
            }
          }, 2000);
          return;
        }

        this.socket = null;
        this.isConnecting = false;
        this.connectionState = 'disconnected';
        
        // Broadcast disconnection state change to dashboard
        try {
          broadcastSSE('connection-status', { state: 'disconnected', isConnected: false });
        } catch (error) {
          // Ignore SSE errors
        }

        // Always attempt reconnect for silent disconnects (known Baileys bug)
        const shouldAttemptReconnect = shouldReconnect || isSilentDisconnect;
        
        if (!shouldAttemptReconnect) {
          logger.error('Session closed. You need to scan the QR code again.');
        } else {
          // Auto-reconnect for all other disconnection reasons (timeouts, network issues, silent disconnects, etc.)
          if (isSilentDisconnect) {
            logger.warn('Silent disconnect detected - attempting automatic reconnection (known Baileys issue after ~12-24 hours)');
          } else {
            logger.warn({ errorCode, errorData: errorData?.data }, 'Connection closed unexpectedly, attempting to reconnect...');
          }
          
          setTimeout(async () => {
            if (this.connectionState === 'disconnected' && !this.isConnecting) {
              this.isConnecting = true;
              this.connectionState = 'connecting';
              
              // Broadcast connecting state change to dashboard
              try {
                broadcastSSE('connection-status', { state: 'connecting', isConnected: false });
              } catch (error) {
                // Ignore SSE errors
              }
              
              try {
                logger.info('🔄 Attempting automatic reconnection...');
                await this.connect();
              } catch (error) {
                logger.error({ error }, '❌ Error during automatic reconnection');
                this.isConnecting = false;
                this.connectionState = 'disconnected';
                
                // Broadcast disconnection state change to dashboard
                try {
                  broadcastSSE('connection-status', { state: 'disconnected', isConnected: false });
                } catch (error) {
                  // Ignore SSE errors
                }
              }
            }
          }, 3000); // Wait 3 seconds before reconnecting
        }
      } else if (connection === 'open') {
        this.isConnecting = false;
        this.connectionState = 'connected';
        this.currentQR = null;
        this.shouldDisplayQR = false; // Reset flag when connected
        
        // Broadcast connection state change to dashboard
        try {
          logger.debug({}, '[Baileys] Connection opened - broadcasting connection-status SSE event');
          broadcastSSE('connection-status', { state: 'connected', isConnected: true });
          logger.debug({}, '[Baileys] Connection-status SSE event broadcasted successfully');
        } catch (error) {
          logger.warn({ error }, '[Baileys] Error broadcasting connection-status SSE event');
        }
        
        // Trigger connection callbacks
        this.connectionCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            logger.warn({ error }, 'Error in connection callback');
          }
        });
        this.connectionCallbacks.clear();
        
        this.isInitialSync = true;
        logger.info('✅ Connected to messaging service');
        logger.debug('Starting initial sync (ignoring historical messages for 3 seconds)');
        if (this.initialSyncTimeout) clearTimeout(this.initialSyncTimeout);
        this.initialSyncTimeout = setTimeout(() => {
          this.isInitialSync = false;
          this.initialSyncTimeout = null;
          logger.debug('Initial sync completed, processing new messages');
        }, 3000);
        
        this.connectionCallbacks.forEach(callback => callback());
        this.connectionCallbacks.clear();
      } else if (connection === 'connecting') {
        this.connectionState = 'connecting';
      }
    });

    this.socket.ev.on('messages.upsert', async (m) => {
      const messages = m.messages;
      
      
      for (const message of messages) {
        const remoteJid = message.key?.remoteJid;
        const messageId = message.key?.id;
        const fromMe = message.key?.fromMe || false;
        const messageTimestamp = message.messageTimestamp;
        
        const now = Date.now() / 1000;
        const messageAge = typeof messageTimestamp === 'number' ? (now - messageTimestamp) : null;
        const isHistoryMessage = 
          this.isInitialSync ||
          !messageTimestamp ||
          (messageAge !== null && messageAge > 120);
        
        if (isHistoryMessage) {
          continue;
        }
        
        if (!remoteJid || !remoteJid.endsWith('@g.us')) {
          continue;
        }

        try {
          if (!this.socket) {
            logger.warn('Socket not available, ignoring message');
            continue;
          }
          
          // Check if socket is actually connected before processing
          if (this.connectionState !== 'connected') {
            logger.debug('Connection not active, ignoring message');
            continue;
          }
          
          let groupMetadata;
          try {
            groupMetadata = await this.socket.groupMetadata(remoteJid);
          } catch (error: any) {
            // If groupMetadata fails, socket might be disconnected silently
            // Check connection state and attempt reconnection if needed
            if (error?.message?.includes('socket') || error?.message?.includes('connection') || error?.message?.includes('closed')) {
              logger.warn({ error: error.message }, 'Socket appears disconnected while processing message, will attempt reconnection');
              // Trigger reconnection check
              if (this.connectionState === 'connected') {
                this.connectionState = 'disconnected';
                this.socket = null;
                // Attempt reconnection
                setTimeout(async () => {
                  if (this.connectionState === 'disconnected' && !this.isConnecting) {
                    logger.info('🔄 Attempting reconnection after silent disconnect detected...');
                    await this.start();
                  }
                }, 2000);
              }
            }
            throw error; // Re-throw to be caught by outer catch
          }
          const groupName = groupMetadata.subject || 'Unnamed';
          const messageContent = this.extractMessageContent(message);
          
          const senderJid = fromMe 
            ? (this.socket?.user?.id || remoteJid)
            : (message.key?.participant || remoteJid);
          const senderName = fromMe 
            ? 'Me' 
            : this.getSenderName(message, groupMetadata, senderJid);
          
          // Only process commands if group is monitored and we have commandHandler
          // IMPORTANT: Ignore messages sent by the bot itself (fromMe) to prevent processing bot responses as commands
          if (this.groupManager.isMonitored(groupName) && this.commandHandler && !fromMe) {
            const trimmedContent = messageContent.toLowerCase().trim();
            const userId = `${senderJid}-${remoteJid}`;
            
            // Only process if it's "menu,," or "menu" explicitly, or if there's a pending state
            // Also accept ",,menu" for compatibility (separator at the beginning)
            const isMenuCommand = trimmedContent === 'menu,,' || trimmedContent === 'menu' || trimmedContent === ',,menu';
            const hasPendingState = this.commandHandler.hasPendingState(userId);
            
            if (isMenuCommand || hasPendingState) {
              try {
                if (isMenuCommand) {
                  logger.debug({ groupName, senderJid }, 'Menu command detected');
                } else {
                  logger.debug({ groupName, senderJid }, 'Processing command with pending state');
                }
                
                const response = await this.commandHandler.processCommand(messageContent, userId);
                if (response) {
                  // Use jid directly to avoid searching for the group again
                  await this.sendMessageToGroupByJid(remoteJid, response.text);
                  logger.debug({ groupName, isMenuCommand, hasPendingState }, '✅ Response sent successfully');
                  continue; // Don't process as normal message
                }
              } catch (error: any) {
                logger.error({ error: error.message, stack: error.stack }, '❌ Error processing command');
                // Continue with normal processing if it fails
              }
            }
            // If it's not a command and there's no pending state, continue with normal processing
          }
          
          // Only process messages from monitored groups (after commands)
          if (!this.groupManager.isMonitored(groupName)) {
            continue;
          }
          
          const timestamp = messageTimestamp 
            ? new Date((messageTimestamp as number) * 1000)
            : new Date();
          
          // Get timezone from config or environment variable
          const timezone = this.config.TZ || process.env.TZ || 'UTC';
          
          const timeStr = timestamp.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            timeZone: timezone
          });
          const dateStr = timestamp.toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: timezone
          });
          
          const messageData: Message = {
            group: groupName,
            sender: senderName,
            time: `${timeStr} - ${dateStr}`,
            content: messageContent || '[No text content]',
          };
          
          this.messageCallbacks.forEach((callback) => {
            try {
              callback(messageData);
            } catch (error) {
              logger.error({ error, stack: (error as any)?.stack }, '❌ Error in message callback');
            }
          });
        } catch (error) {
          logger.error({ error, remoteJid, stack: (error as any)?.stack }, '❌ Error processing group message');
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (this.initialSyncTimeout) {
      clearTimeout(this.initialSyncTimeout);
      this.initialSyncTimeout = null;
    }
    
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    
    this.isConnecting = false;
    this.connectionState = 'disconnected';
    this.shouldDisplayQR = false; // Reset flag when stopping
    this.connectionCallbacks.clear();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  requiresQR(): boolean {
    return true;
  }

  getConnectionInstructions(): string {
    return 'Connect - Scan QR code with your messaging app to establish connection';
  }

  onConnected(callback: () => void): void {
    if (this.connectionState === 'connected') {
      callback();
    } else {
      this.connectionCallbacks.add(callback);
    }
  }

  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.add(callback);
  }

  async listGroups(): Promise<Group[]> {
    if (!this.socket || !this.isConnected()) {
      throw new Error('No active connection');
    }

    const groups = await this.socket.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    return groupList.map(group => ({
      name: group.subject || 'Unnamed',
      jid: group.id,
      participants: group.participants?.length,
    }));
  }

  /**
   * Send message to a group by jid (more efficient)
   */
  private async sendMessageToGroupByJid(jid: string, text: string): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      logger.error({ jid }, 'No active connection to send message');
      throw new Error('No active connection');
    }

    try {
      logger.debug({ jid, textLength: text.length }, 'Sending message to group by jid');
      await this.socket.sendMessage(jid, { text });
      logger.debug({ jid }, '✅ Message sent to group successfully');
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, jid }, '❌ Error sending message to group');
      throw error;
    }
  }

  /**
   * Send message to a group (optional implementation)
   */
  async sendMessageToGroup(groupName: string, text: string): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      logger.error({ groupName }, 'No active connection to send message');
      throw new Error('No active connection');
    }

    try {
      // Find group by name
      logger.debug({ groupName }, 'Searching for group to send message');
      const groups = await this.socket.groupFetchAllParticipating();
      const groupList = Object.values(groups);
      const group = groupList.find(g => (g.subject || 'Unnamed') === groupName);

      if (!group) {
        logger.error({ groupName, availableGroups: groupList.map(g => g.subject || 'Unnamed') }, 'Group not found');
        throw new Error(`Group "${groupName}" not found`);
      }

      logger.debug({ groupName, groupId: group.id, textLength: text.length }, 'Sending message to group');
      await this.socket.sendMessage(group.id, { text });
      logger.debug({ groupName }, '✅ Message sent to group successfully');
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, groupName }, 'Error sending message to group');
      throw error;
    }
  }

  private extractMessageContent(message: proto.IWebMessageInfo): string {
    const msg = message.message;
    if (!msg) return '';

    if (msg.conversation) {
      return msg.conversation;
    }

    if (msg.extendedTextMessage?.text) {
      return msg.extendedTextMessage.text;
    }

    if (msg.imageMessage?.caption) {
      return `[Image] ${msg.imageMessage.caption}`;
    }

    if (msg.videoMessage?.caption) {
      return `[Video] ${msg.videoMessage.caption}`;
    }

    if (msg.audioMessage) {
      return '[Audio]';
    }

    if (msg.documentMessage) {
      const docName = msg.documentMessage.fileName || 'Unnamed document';
      return `[Document] ${docName}`;
    }

    if (msg.stickerMessage) {
      return '[Sticker]';
    }

    if (msg.locationMessage) {
      return '[Location]';
    }

    if (msg.contactMessage) {
      return '[Contact]';
    }

    return '[Unsupported message]';
  }

  private getSenderName(
    message: proto.IWebMessageInfo,
    groupMetadata: any,
    senderJid: string
  ): string {
    const pushName = message.pushName;
    if (pushName) {
      return pushName;
    }

    if (groupMetadata?.participants) {
      const participant = groupMetadata.participants.find(
        (p: any) => p.id === senderJid
      );
      if (participant?.name) {
        return participant.name;
      }
    }

    return senderJid?.split('@')[0] || 'Unknown';
  }
}

