// Witral - Storage Interface
// Abstract interface for storage systems
// Approach: Unidirectional upload - Witral only pushes changes

/**
 * Interface for storage systems
 * Witral is the producer - we don't care if the file changes remotely
 */
export interface StorageInterface {
  /**
   * Save or update a file
   * @param path Relative file path (e.g., "tags/idea.md")
   * @param content File content
   */
  saveFile(path: string, content: string): Promise<void>;

  /**
   * Read a file
   * @param path Relative file path
   * @returns File content or null if not found
   */
  readFile(path: string): Promise<string | null>;

  /**
   * Check if a file exists
   * @param path Relative file path
   */
  exists(path: string): Promise<boolean>;

  /**
   * Delete a file
   * @param path Relative file path
   */
  deleteFile(path: string): Promise<void>;

  /**
   * List files in a directory
   * @param path Relative directory path
   * @returns Array of relative file paths
   */
  listFiles(path: string): Promise<string[]>;

  /**
   * Initialize the storage system
   */
  initialize(): Promise<void>;
}

