#!/bin/bash
#
# Witral - Production Update Script
# 
# This script updates Witral in production:
# - Executes git pull to fetch latest changes
# - Rebuilds the Docker image
# - Restarts the container preserving all data
#   (sessions, vault, data, OAuth tokens, etc.)
#
# Usage:
#   ./scripts/update-prod.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions to print messages
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    echo ""
    echo "Please install Docker first:"
    echo "  • Linux:   https://docs.docker.com/engine/install/"
    echo "  • macOS:   https://docs.docker.com/desktop/install/mac-install/"
    echo "  • Windows: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    print_error "docker compose is not available"
    echo ""
    echo "Please install Docker Compose:"
    echo "  • Docker Compose is usually included with Docker Desktop"
    echo "  • For Linux, install: docker-compose-plugin or docker-compose"
    exit 1
fi

# Use docker-compose if docker compose is not available
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_DIR"

echo ""
echo "🔄 Witral - Production Update"
echo "=========================="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "No git repository found in current directory"
    exit 1
fi

# Check git status before pulling
print_info "Checking repository status..."
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    print_warning "There are uncommitted changes in the repository"
    echo ""
    echo "The following files have changes:"
    git status --short
    echo ""
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Update cancelled"
        exit 0
    fi
fi

# Execute git pull
print_info "Fetching latest changes from repository..."
if git pull; then
    print_success "Git pull completed"
else
    print_error "Error executing git pull"
    exit 1
fi

# Check if container is running before updating
print_info "Checking container status..."
CONTAINER_RUNNING=false
if $COMPOSE_CMD ps -q witral 2>/dev/null | grep -q .; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^witral$"; then
        CONTAINER_RUNNING=true
        print_info "Container witral is running"
    else
        print_warning "Container witral exists but is not running"
    fi
else
    print_warning "Container witral not found"
fi

# Check if data directories exist
print_info "Checking data directories..."
DATA_DIRS_OK=true
if [ ! -d "data" ]; then
    print_warning "Directory data/ does not exist (will be created automatically)"
    DATA_DIRS_OK=false
fi
if [ ! -d "vault" ]; then
    print_warning "Directory vault/ does not exist (will be created automatically)"
    DATA_DIRS_OK=false
fi

if [ "$DATA_DIRS_OK" = true ]; then
    print_success "Data directories verified"
    echo "  • data/ - Configuration, sessions, groups, tags"
    echo "  • vault/ - Generated Markdown files"
fi

# Rebuild the image
print_info "Rebuilding Docker image..."
if $COMPOSE_CMD build --no-cache witral; then
    print_success "Image rebuilt successfully"
else
    print_error "Error rebuilding image"
    exit 1
fi

# Stop container if running (preserves volumes)
if [ "$CONTAINER_RUNNING" = true ]; then
    print_info "Stopping container (volumes will be preserved)..."
    if $COMPOSE_CMD stop witral; then
        print_success "Container stopped"
    else
        print_warning "Error stopping container (may already be stopped)"
    fi
fi

# Start container with new image
print_info "Starting container with new image..."
if $COMPOSE_CMD up -d witral; then
    print_success "Container started"
else
    print_error "Error starting container"
    exit 1
fi

# Wait a moment for container to start
print_info "Waiting for container to start..."
sleep 5

# Verify container status
print_info "Checking service status..."
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^witral$"; then
    print_success "Container is running"
    
    # Show container status
    echo ""
    $COMPOSE_CMD ps witral
    
    # Check health check
    echo ""
    print_info "Checking health check..."
    sleep 3
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' witral 2>/dev/null || echo "unknown")
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        print_success "Service is healthy"
    elif [ "$HEALTH_STATUS" = "starting" ]; then
        print_warning "Service is starting (health check in progress)"
    else
        print_warning "Health check status: $HEALTH_STATUS"
        print_info "Check logs if there are issues: $COMPOSE_CMD logs -f witral"
    fi
else
    print_error "Container is not running"
    echo ""
    print_info "Checking logs to diagnose the issue..."
    $COMPOSE_CMD logs --tail=50 witral
    exit 1
fi

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "Update completed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Data preserved:"
echo "  ✅ WhatsApp sessions (data/session/)"
echo "  ✅ Groups and tags configuration (data/)"
echo "  ✅ Generated Markdown files (vault/)"
echo "  ✅ OAuth tokens (data/googledrive/, vault/.google-oauth-tokens.json)"
echo "  ✅ All configuration data"
echo ""
echo "🔧 Useful commands:"
echo "  View logs:       $COMPOSE_CMD logs -f witral"
echo "  Access CLI:      docker exec -it witral node dist/index.js"
echo "  Restart:         $COMPOSE_CMD restart witral"
echo "  Status:          $COMPOSE_CMD ps witral"
echo ""
