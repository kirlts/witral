// Witral - Input Sanitization Utilities
// Sanitization functions for user inputs

/**
 * Sanitize tag name - only alphanumeric, hyphens, underscores
 * Case-insensitive (converts to lowercase)
 */
export function sanitizeTagName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Tag name must be a non-empty string');
  }
  return name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
}

/**
 * Sanitize group name - remove control characters, trim whitespace
 */
export function sanitizeGroupName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Sanitize separator - keep only 1-3 safe characters
 */
export function sanitizeSeparator(separator: string): string {
  if (!separator || typeof separator !== 'string') {
    return ',,';
  }
  const sanitized = separator.slice(0, 3).replace(/[^a-zA-Z0-9.,;:!?-_]/g, '');
  return sanitized || ',,';
}

/**
 * Sanitize message content - remove control characters except newlines
 */
export function sanitizeMessageContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  return content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize filename - preserves Unicode characters but removes problematic characters
 * Removes: / \ : * ? " < > | and control characters
 * Replaces spaces with hyphens
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  
  // Remove characters that are problematic for filenames on all systems
  // / \ : * ? " < > | and control characters
  let sanitized = filename
    .replace(/[/\\:*?"<>|]/g, '') // Remove problematic characters
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
  
  // Replace spaces with hyphens
  sanitized = sanitized.replace(/\s+/g, '-');
  
  // Remove multiple consecutive hyphens
  sanitized = sanitized.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  sanitized = sanitized.replace(/^-+|-+$/g, '');
  
  return sanitized || 'untitled';
}

