// Witral - Logger SSE Integration
// Logger integration with Server-Sent Events for the web dashboard

import { broadcastSSE } from '../web/sse.js';

let sseEnabled = false;

/**
 * Enable SSE logger integration
 */
export function enableLoggerSSE(): void {
  sseEnabled = true;
}

/**
 * Disable SSE logger integration
 */
export function disableLoggerSSE(): void {
  sseEnabled = false;
}

/**
 * Send log to SSE
 */
export function sendLogToSSE(level: string, message: string, data?: any): void {
  if (!sseEnabled) return;

  try {
    broadcastSSE('log', {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Ignore SSE errors (there may be no connected clients)
  }
}

