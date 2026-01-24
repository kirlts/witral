// Utility to check if a port is in use
import { createServer } from 'net';

/**
 * Check if a port is already in use
 */
export async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
  });
}
