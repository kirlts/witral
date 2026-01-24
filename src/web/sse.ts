// Witral - Server-Sent Events for real-time logs

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { WebServerContext, getWebServerContext } from './index.js';
import { getConfig } from '../config/index.js';

// Store for connected SSE clients
// Separate sets for different streams to allow targeted broadcasting
const logsClients = new Set<ReadableStreamDefaultController>();
const qrClients = new Set<ReadableStreamDefaultController>();
const statusClients = new Set<ReadableStreamDefaultController>();

/**
 * Add SSE client for logs stream
 */
export function addLogsSSEClient(controller: ReadableStreamDefaultController): void {
  logsClients.add(controller);
}

/**
 * Remove SSE client for logs stream
 */
export function removeLogsSSEClient(controller: ReadableStreamDefaultController): void {
  logsClients.delete(controller);
}

/**
 * Add SSE client for QR stream
 */
export function addQRSSEClient(controller: ReadableStreamDefaultController): void {
  qrClients.add(controller);
}

/**
 * Remove SSE client for QR stream
 */
export function removeQRSSEClient(controller: ReadableStreamDefaultController): void {
  qrClients.delete(controller);
}

/**
 * Add SSE client for status stream (connection and sync status)
 */
export function addStatusSSEClient(controller: ReadableStreamDefaultController): void {
  statusClients.add(controller);
}

/**
 * Remove SSE client for status stream
 */
export function removeStatusSSEClient(controller: ReadableStreamDefaultController): void {
  statusClients.delete(controller);
}

/**
 * Send message to all SSE clients (logs, QR, and status streams)
 */
export function broadcastSSE(event: string, data: any): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(message);
  
  // Debug logging
  if (event === 'message' || event === 'log') {
    logger.debug({ event, clientCount: logsClients.size }, '[SSE] Broadcasting to logs clients');
  }
  
  // Send to logs clients (for all events including messages and logs)
  for (const client of logsClients) {
    try {
      client.enqueue(encoded);
    } catch (error) {
      logger.warn({ error, event }, '[SSE] Error sending to logs client, removing');
      removeLogsSSEClient(client);
    }
  }
  
  // Send to QR clients (only for QR-related events)
  if (event === 'qr' || event === 'state') {
    for (const client of qrClients) {
      try {
        client.enqueue(encoded);
      } catch (error) {
        removeQRSSEClient(client);
      }
    }
  }
  
  // Send to status clients (for connection and sync status events)
  if (event === 'connection-status' || event === 'sync-status' || event === 'state') {
    logger.debug({ event, data, clientCount: statusClients.size }, '[SSE] Broadcasting to status clients');
    for (const client of statusClients) {
      try {
        client.enqueue(encoded);
      } catch (error) {
        logger.warn({ error }, '[SSE] Error sending to status client, removing');
        removeStatusSSEClient(client);
      }
    }
  }
}

/**
 * Setup SSE for logs, QR, and status streams
 */
export function setupSSE(app: Hono, context: WebServerContext): void {
  // Helper to get current sync (allows dynamic updates)
  const getSync = () => {
    const currentContext = getWebServerContext();
    return currentContext?.sync || context.sync;
  };
  const { ingestor } = context;

  // Endpoint SSE para logs
  app.get('/web/api/logs/stream', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        addLogsSSEClient(controller);

        // Send connection message
        controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to log stream' })}\n\n`));

        // Keep connection open - send heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
          } catch (error) {
            clearInterval(heartbeat);
            removeLogsSSEClient(controller);
          }
        }, 30000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // Endpoint SSE para QR
  app.get('/web/api/qr/stream', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        addQRSSEClient(controller);

        // Send initial state
        const state = ingestor.getConnectionState();
        controller.enqueue(new TextEncoder().encode(`event: state\ndata: ${JSON.stringify({ state })}\n\n`));

        // Keep connection open - send heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
          } catch (error) {
            clearInterval(heartbeat);
            removeQRSSEClient(controller);
          }
        }, 30000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // Endpoint SSE para status (connection y sync)
  app.get('/web/api/status/stream', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        addStatusSSEClient(controller);

        // Send initial connection status
        const connectionState = ingestor.getConnectionState();
        const isConnected = ingestor.isConnected();
        logger.debug({ state: connectionState, isConnected }, '[SSE] Sending initial connection-status to new client');
        controller.enqueue(new TextEncoder().encode(`event: connection-status\ndata: ${JSON.stringify({ state: connectionState, isConnected })}\n\n`));

        // Send initial sync status
        try {
          const sync = getSync();
          const syncStatus = sync.getConnectionStatus();
          const config = getConfig();
          let vaultFolderLink = null;
          if (syncStatus?.vaultFolderId && config.SYNC_TYPE === 'googledrive') {
            vaultFolderLink = `https://drive.google.com/drive/folders/${syncStatus.vaultFolderId}`;
          }
          controller.enqueue(new TextEncoder().encode(`event: sync-status\ndata: ${JSON.stringify({ 
            isConnected: syncStatus.isConnected, 
            authMethod: syncStatus.authMethod || 'none',
            userEmail: syncStatus.userEmail || null,
            syncType: config.SYNC_TYPE || 'local',
            vaultFolderLink: vaultFolderLink
          })}\n\n`));
        } catch (error) {
          // Ignore sync status errors
        }

        // Keep connection open - send heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
          } catch (error) {
            clearInterval(heartbeat);
            removeStatusSSEClient(controller);
          }
        }, 30000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });
}

