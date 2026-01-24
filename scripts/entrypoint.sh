#!/bin/sh
#
# Witral - Docker Entrypoint Script
#
# This script runs as root initially to adjust permissions,
# then switches to the witral user to run the application.
#

# Run initial setup (create .env, directories, etc.)
if [ -f /app/scripts/init-setup.sh ]; then
    /bin/sh /app/scripts/init-setup.sh
fi

# Check if we're running as root
if [ "$(id -u)" = "0" ]; then
    echo "🔧 Adjusting data directory permissions..."
    
    # Set permissions for data directories
    chmod -R 777 /app/data 2>/dev/null || true
    chown -R 1001:1001 /app/data 2>/dev/null || true
    
    # Set permissions for vault directory (if it exists)
    if [ -d /app/vault ]; then
        chmod -R 777 /app/vault 2>/dev/null || true
        chown -R 1001:1001 /app/vault 2>/dev/null || true
    fi
    
    # Ensure Google Drive service account file is readable (restricted permissions for security)
    if [ -f /app/data/googledrive/service-account.json ]; then
        chmod 600 /app/data/googledrive/service-account.json 2>/dev/null || true
        chown 1001:1001 /app/data/googledrive/service-account.json 2>/dev/null || true
    fi
    
    # Ensure OAuth credentials file has restricted permissions (owner read/write only)
    if [ -f /app/data/googledrive/oauth-credentials.json ]; then
        chmod 600 /app/data/googledrive/oauth-credentials.json 2>/dev/null || true
        chown 1001:1001 /app/data/googledrive/oauth-credentials.json 2>/dev/null || true
    fi
    
    # Ensure .env file in data directory is writable by witral user (for wizard and runtime config updates)
    # Priority: ./data/.env (persisted in volume) > ./.env (fallback for local dev)
    if [ -f /app/data/.env ]; then
        chmod 666 /app/data/.env 2>/dev/null || true
        chown 1001:1001 /app/data/.env 2>/dev/null || true
    elif [ -f /app/.env ]; then
        # Fallback for local development
        chmod 666 /app/.env 2>/dev/null || true
        chown 1001:1001 /app/.env 2>/dev/null || true
    fi
    
    # Ensure package files are writable (for plugin installation during wizard)
    if [ -f /app/package.json ]; then
        chmod 644 /app/package.json 2>/dev/null || true
        chown 1001:1001 /app/package.json 2>/dev/null || true
    fi
    # Create package-lock.json if it doesn't exist (needed for npm install during wizard)
    if [ ! -f /app/package-lock.json ]; then
        touch /app/package-lock.json 2>/dev/null || true
    fi
    if [ -f /app/package-lock.json ]; then
        chmod 666 /app/package-lock.json 2>/dev/null || true
        chown 1001:1001 /app/package-lock.json 2>/dev/null || true
    fi
    
    # Ensure node_modules is writable (for plugin installation during wizard)
    if [ -d /app/node_modules ]; then
        chmod -R 755 /app/node_modules 2>/dev/null || true
        chown -R 1001:1001 /app/node_modules 2>/dev/null || true
    fi
    
    # Verify that session directory is writable
    if [ -d /app/data/session ]; then
        if touch /app/data/session/.test 2>/dev/null; then
            rm -f /app/data/session/.test
        else
            echo "⚠️  Warning: Cannot write to /app/data/session" >&2
        fi
    fi
    
    # Switch to witral user and execute the application
    exec su-exec witral node --max-old-space-size=1024 dist/index.js "$@"
else
    # Already running as witral user, execute directly
    exec node --max-old-space-size=1024 dist/index.js "$@"
fi
