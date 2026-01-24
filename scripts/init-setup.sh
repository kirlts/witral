#!/bin/sh
#
# Witral - Initial Setup Script (runs inside Docker container)
# This script ensures necessary files and directories exist before starting the app

# Create .env in data directory (persisted in volume) from env.example if it doesn't exist
# Priority: ./data/.env (persisted) > ./.env (fallback for local dev)
if [ ! -f /app/data/.env ]; then
    # Check if ./.env exists (from local dev or old setup)
    if [ -f /app/.env ]; then
        echo "📝 Moving existing .env to data/.env for persistence..."
        cp /app/.env /app/data/.env
        chmod 666 /app/data/.env 2>/dev/null || true
        echo "✅ .env file moved to data/.env"
    elif [ -f /app/env.example ]; then
        echo "📝 Creating .env file in data/ from env.example..."
        cp /app/env.example /app/data/.env
        # Ensure .env is writable by witral user
        chmod 666 /app/data/.env 2>/dev/null || true
        echo "✅ .env file created in data/.env"
    else
        echo "⚠️  Warning: env.example not found, skipping .env creation"
    fi
else
    # Ensure existing data/.env is writable by witral user
    chmod 666 /app/data/.env 2>/dev/null || true
fi

# Create data directories (if they don't exist, preserve if they do)
mkdir -p /app/data/session
mkdir -p /app/data/logs
mkdir -p /app/data/googledrive

# Create vault directory at root (if it doesn't exist, preserve if it does)
if [ ! -d /app/vault ]; then
    mkdir -p /app/vault/tags
    mkdir -p /app/vault/groups
fi

# Ensure subdirectories exist even if vault already exists
mkdir -p /app/vault/tags
mkdir -p /app/vault/groups

