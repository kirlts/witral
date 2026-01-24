#!/bin/bash
#
# Witral - Development Reset Script
# 
# Resets the system to initial state for testing first-run experience
# This script removes all generated files and user data to leave the repo ready for GitHub
#
# Usage:
#   ./scripts/reset-dev.sh

# Don't use set -e here because we want to continue even if some commands fail
# (e.g., Docker commands might fail if Docker is not running or containers don't exist)
set -u  # Exit on undefined variables (safer)

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

# Counters for summary
REMOVED_COUNT=0
SKIPPED_COUNT=0

# Helper function to safely remove files/directories
safe_remove() {
    local target="$1"
    local description="${2:-$target}"
    
    if [ ! -e "$target" ]; then
        print_warning "Not found: ${description}"
        ((SKIPPED_COUNT++))
        return 0
    fi
    
    # Special handling for node_modules (common source of permission issues)
    if [ "$target" = "node_modules/" ] || [ "$target" = "node_modules" ]; then
        # Stop any processes that might be using files
        pkill -f "node.*witral" 2>/dev/null || true
        sleep 1
        sync
        
        # Fix permissions first
        chmod -R u+w "$target" 2>/dev/null || true
        if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
            sudo chown -R "$(id -u):$(id -g)" "$target" 2>/dev/null || true
            sudo chmod -R u+w "$target" 2>/dev/null || true
        fi
    fi
    
    # Try to remove with standard rm -rf
    if rm -rf "$target" 2>/dev/null; then
        print_success "Removed: ${description}"
        ((REMOVED_COUNT++))
        sync
        return 0
    fi
    
    # If still failing, try to change permissions first (for directories)
    if [ -d "$target" ]; then
        chmod -R u+w "$target" 2>/dev/null || true
        sync
        sleep 1
        if rm -rf "$target" 2>/dev/null; then
            print_success "Removed: ${description}"
            ((REMOVED_COUNT++))
            sync
            return 0
        fi
        
        # Try with sudo if available (non-interactive, only if we have sudo rights)
        if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
            sudo chown -R "$(id -u):$(id -g)" "$target" 2>/dev/null || true
            sudo chmod -R u+w "$target" 2>/dev/null || true
            sync
            sleep 1
            if sudo rm -rf "$target" 2>/dev/null; then
                print_success "Removed (with sudo): ${description}"
                ((REMOVED_COUNT++))
                sync
                return 0
            fi
        fi
    fi
    
    # Last resort: report failure but continue
    print_warning "Could not remove: ${description} (may require manual cleanup: sudo rm -rf ${target})"
    ((SKIPPED_COUNT++))
    return 1
}

# Helper function to find and remove files by pattern
remove_files_by_pattern() {
    local pattern="$1"
    local description="$2"
    local maxdepth="${3:-1}"
    
    local count=0
    while IFS= read -r -d '' file; do
        if rm -f "$file" 2>/dev/null; then
            ((count++))
        fi
    done < <(find . -maxdepth "$maxdepth" -name "$pattern" -type f -print0 2>/dev/null)
    
    if [ "$count" -gt 0 ]; then
        print_success "Removed ${count} ${description}"
        ((REMOVED_COUNT++))
    else
        ((SKIPPED_COUNT++))
    fi
}

cd "$PROJECT_DIR"

echo ""
echo "🔄 Witral Development Reset"
echo "========================"
echo ""
echo "This will remove all generated files and user data, leaving the repo clean for GitHub."
echo ""
echo "The following will be removed:"
echo ""
echo "📁 Local Files:"
echo "  - data/ directory (all user data)"
echo "    - Monitored groups, tags, markdown files"
echo "    - Ingestor session data"
echo "    - Cloud sync tokens and credentials (OAuth)"
echo "    - Wizard completion flag"
echo "  - vault/ directory (PRESERVED - contains your valuable markdown files)"
echo "  - dist/ directory (build artifacts)"
echo "  - node_modules/ directory (npm dependencies - will be reinstalled)"
echo "  - package-lock.json (npm lock file - will be regenerated)"
echo "  - .env file (user configuration)"
echo "  - Temporary files (*.log, *.tmp, *.temp, *.tar.gz, *.zip)"
echo ""
echo "🐳 Docker Resources:"
echo "  - Witral Docker containers (stopped and removed)"
echo "  - Docker volumes associated with Witral"
echo "  - Docker network (witral-network)"
echo ""
echo "Starting cleanup..."
echo ""

# Stop local Node.js processes
print_info "Stopping Witral processes..."
PROCESSES_STOPPED=0
for pattern in "node.*witral" "tsx.*src/index.ts" "tsx.*witral" "node.*dist/index.js"; do
    if pkill -f "$pattern" 2>/dev/null; then
        ((PROCESSES_STOPPED++))
    fi
done

if [ "$PROCESSES_STOPPED" -gt 0 ]; then
    sleep 2  # Give processes time to terminate gracefully
    print_success "Stopped ${PROCESSES_STOPPED} Witral process(es)"
else
    print_warning "No running Witral processes found"
fi

# Stop and remove Docker resources
if command -v docker &> /dev/null; then
    if ! docker info > /dev/null 2>&1; then
        print_warning "Docker is not running. Skipping Docker cleanup."
    else
        echo ""
        print_info "Cleaning up Docker resources..."
        
        # Detect docker compose command
        COMPOSE_CMD="docker compose"
        if ! docker compose version > /dev/null 2>&1; then
            if docker-compose version > /dev/null 2>&1; then
                COMPOSE_CMD="docker-compose"
            else
                print_warning "Docker Compose not found. Skipping Docker Compose cleanup."
                COMPOSE_CMD=""
            fi
        fi
        
        # Web port Witral uses (must match docker-compose WEB_PORT / default 3000)
        WEB_PORT_DEFAULT=3000

        # 1) Stop and remove ALL containers with "witral" in the name (including
        #    "witral-witral-run-*" from "docker compose run", which aren't named "witral")
        WITRAL_CONTAINERS=$(docker ps -a -q --filter "name=witral" 2>/dev/null || true)
        if [ -n "$WITRAL_CONTAINERS" ]; then
            echo "$WITRAL_CONTAINERS" | xargs docker rm -f 2>/dev/null || true
            print_success "Witral containers stopped and removed (incl. docker compose run)"
            ((REMOVED_COUNT++))
        fi

        # 2) Stop and remove any container using port 3000 (frees port for next "compose run")
        PORT_CONTAINERS=$(docker ps -q --filter "publish=$WEB_PORT_DEFAULT" 2>/dev/null || true)
        if [ -n "$PORT_CONTAINERS" ]; then
            echo "$PORT_CONTAINERS" | xargs docker rm -f 2>/dev/null || true
            print_success "Containers using port $WEB_PORT_DEFAULT stopped and removed"
            ((REMOVED_COUNT++))
        fi

        # 3) docker compose down - comprehensive project cleanup
        if [ -n "$COMPOSE_CMD" ] && [ -f "docker-compose.yml" ]; then
            if $COMPOSE_CMD down -v --remove-orphans 2>/dev/null; then
                print_success "Docker Compose resources removed"
                ((REMOVED_COUNT++))
            else
                print_warning "Docker Compose cleanup had warnings (may be normal)"
            fi
        fi
        
        # Remove Docker network if it exists (more robust check)
        NETWORK_REMOVED=0
        while IFS= read -r network; do
            if [ -n "$network" ] && docker network rm "$network" 2>/dev/null; then
                print_success "Docker network removed: ${network}"
                ((NETWORK_REMOVED++))
            fi
        done < <(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^witral" || true)
        
        if [ "$NETWORK_REMOVED" -eq 0 ]; then
            print_warning "No Witral Docker networks found"
        fi
        
        # Remove orphaned volumes (only Witral-specific ones)
        VOLUME_REMOVED=0
        while IFS= read -r volume; do
            if [ -n "$volume" ] && docker volume rm "$volume" 2>/dev/null; then
                print_success "Docker volume removed: ${volume}"
                ((VOLUME_REMOVED++))
            fi
        done < <(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^witral|witral_" || true)
        
        if [ "$VOLUME_REMOVED" -eq 0 ]; then
            print_warning "No Witral Docker volumes found"
        fi
        
        # Remove Docker images to force rebuild (ensures latest code is used)
        echo ""
        print_info "Removing Docker images to force rebuild..."
        IMAGE_REMOVED=0
        if docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -qE "^witral:latest$|^witral-witral:latest$"; then
            if docker rmi witral:latest 2>/dev/null || docker rmi witral-witral:latest 2>/dev/null; then
                print_success "Docker image removed (will be rebuilt on next docker compose build)"
                ((IMAGE_REMOVED++))
            fi
        fi
        
        # Also try to remove by image ID if name-based removal didn't work
        if [ "$IMAGE_REMOVED" -eq 0 ]; then
            while IFS= read -r image_id; do
                if [ -n "$image_id" ] && docker rmi "$image_id" 2>/dev/null; then
                    print_success "Docker image removed: ${image_id}"
                    ((IMAGE_REMOVED++))
                fi
            done < <(docker images --format '{{.ID}} {{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "^witral" | awk '{print $1}' | head -3 || true)
        fi
        
        if [ "$IMAGE_REMOVED" -eq 0 ]; then
            print_warning "No Witral Docker images found to remove"
        else
            print_info "Tip: Use 'docker compose build --no-cache' to rebuild without cache"
        fi
    fi
else
    print_warning "Docker is not installed. Skipping Docker cleanup."
fi

echo ""
print_info "Removing generated files and data..."

# First, try to fix permissions on directories that might be owned by root (from Docker)
# Only use sudo if it doesn't require a password (non-interactive)
if [ -d "data" ] && [ ! -w "data" ]; then
    print_warning "data/ directory has permission issues, attempting to fix..."
    # Try without sudo first
    chmod -R u+w data/ 2>/dev/null || true
    # Try with sudo only if no password required
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo chown -R "$(id -u):$(id -g)" data/ 2>/dev/null || true
    fi
fi

if [ -d "dist" ] && [ ! -w "dist" ]; then
    print_warning "dist/ directory has permission issues, attempting to fix..."
    # Try without sudo first
    chmod -R u+w dist/ 2>/dev/null || true
    # Try with sudo only if no password required
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo chown -R "$(id -u):$(id -g)" dist/ 2>/dev/null || true
    fi
fi

# Fix permissions on node_modules if it exists (may be owned by root from Docker)
if [ -d "node_modules" ]; then
    if [ ! -w "node_modules" ]; then
        print_warning "node_modules/ directory has permission issues, attempting to fix..."
        # Try without sudo first
        chmod -R u+w node_modules/ 2>/dev/null || true
        # Try with sudo only if no password required
        if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
            sudo chown -R "$(id -u):$(id -g)" node_modules/ 2>/dev/null || true
            sudo chmod -R u+w node_modules/ 2>/dev/null || true
        fi
    fi
fi

# Remove data directory (all user data)
safe_remove "data/" "Data directory (all user data)"

# CRITICAL: vault/ directory is NEVER removed - it contains user's valuable markdown files
# The vault directory is permanently preserved to prevent data loss during development
# Only specific files within vault (like OAuth tokens) may be cleaned up, but never the directory itself

# Remove build artifacts
safe_remove "dist/" "Build artifacts (dist/)"

# Remove node_modules and package-lock.json to fix npm installation issues
# This prevents ENOTEMPTY errors when npm tries to update dependencies
# Clear npm cache as well to ensure clean installation
print_info "Cleaning npm cache..."
npm cache clean --force 2>/dev/null || true

# Remove node_modules with proper permission handling
if [ -d "node_modules" ]; then
    # Fix permissions first (may be owned by root from Docker)
    chmod -R u+w node_modules/ 2>/dev/null || true
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo chown -R "$(id -u):$(id -g)" node_modules/ 2>/dev/null || true
        sudo chmod -R u+w node_modules/ 2>/dev/null || true
    fi
    safe_remove "node_modules/" "Node modules directory (npm dependencies)"
fi

safe_remove "package-lock.json" "Package lock file (npm lock file)"

# Remove .env file (user-specific configuration)
# Note: .env is optional - docker compose will work without it (uses default env vars)
# init-setup.sh will recreate .env from env.example inside the container
safe_remove ".env" ".env file (user configuration - optional)"

# Remove wizard completion flag (must be before removing data/)
if [ -f "data/.wizard-completed" ]; then
    safe_remove "data/.wizard-completed" "Wizard completion flag"
fi

# Remove log files (root level)
remove_files_by_pattern "*.log" "log files"

# Remove temporary files (root level)
remove_files_by_pattern "*.tmp" "temporary files (*.tmp)"
remove_files_by_pattern "*.temp" "temporary files (*.temp)"

# Remove archive files (root level)
remove_files_by_pattern "*.tar.gz" "archive files (*.tar.gz)"
remove_files_by_pattern "*.zip" "archive files (*.zip)"
remove_files_by_pattern "*.tar" "archive files (*.tar)"

# Remove cloud sync credentials and tokens (comprehensive cleanup)
# OAuth tokens in vault (new location) - only the token file, never the vault directory
if [ -f "vault/.google-oauth-tokens.json" ]; then
    if rm -f "vault/.google-oauth-tokens.json" 2>/dev/null; then
        print_success "Removed: OAuth tokens in vault"
        ((REMOVED_COUNT++))
    else
        print_warning "Could not remove OAuth tokens"
    fi
fi

# Note: data/googledrive/ is removed with data/ directory above
# Only try to remove individual files if data/ still exists for some reason
if [ -d "data" ]; then
    safe_remove "data/googledrive/oauth-credentials.json" "OAuth credentials"
    safe_remove "data/googledrive/" "Cloud sync directory"
fi

# Remove any remaining OAuth-related files
remove_files_by_pattern "*oauth*.json" "OAuth-related files" 3

# Clean up any lock files
remove_files_by_pattern "*.lock" "lock files"
remove_files_by_pattern ".lock" "lock files"

# Remove coverage/test artifacts if they exist
safe_remove "coverage/" "Test coverage directory"
safe_remove ".nyc_output/" "NYC output directory"

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "Reset complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  - Removed: ${REMOVED_COUNT} item(s)"
echo "  - Skipped: ${SKIPPED_COUNT} item(s) (not found)"
echo ""
echo "The repository is now clean and ready for GitHub."
echo ""
echo "📋 Next step:"
echo ""
print_info "Run: docker compose run --service-ports --build witral"
echo ""
echo "The wizard will guide you through setup."
echo ""
echo "If you see 'port 3000 already allocated', another process is using it."
echo "Stop it (e.g. other Node apps) or set WEB_PORT in .env before running."
echo ""
