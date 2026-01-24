// Witral - Ingestor Interface
// Abstract interface for ingestor implementations

export interface Message {
  group: string;
  sender: string;
  time: string;
  content: string;
}

export interface Group {
  name: string;
  jid?: string;
  participants?: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface IngestorInterface {
  /**
   * Initialize the ingestor
   */
  initialize(): Promise<void>;

  /**
   * Start connection
   */
  start(): Promise<void>;

  /**
   * Stop connection
   */
  stop(): Promise<void>;

  /**
   * Generate QR code for connection
   */
  generateQR(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState;

  /**
   * Register callback for when connected
   */
  onConnected(callback: () => void): void;

  /**
   * Register callback for when a message is received
   */
  onMessage(callback: (message: Message) => void): void;

  /**
   * List available groups
   */
  listGroups(): Promise<Group[]>;

  /**
   * Send message to a group (optional - only if ingestor supports it)
   */
  sendMessageToGroup?(groupName: string, text: string): Promise<void>;

  /**
   * Check if this ingestor requires QR code for connection
   */
  requiresQR(): boolean;

  /**
   * Get connection instructions for this ingestor
   * @returns Human-readable instructions for connecting
   */
  getConnectionInstructions(): string;
}

/**
 * Interface for ingestor plugins
 * Plugins must implement IngestorInterface
 */
export interface IngestorPlugin {
  createIngestor(groupManager?: any): IngestorInterface;
}

