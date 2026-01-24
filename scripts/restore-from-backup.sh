#!/bin/bash
# ============================================
# Witral - Restore from Backup Script
# ============================================
# Restores configurations and content from a backup
# PRESERVES local sessions and OAuth tokens (does not restore them from backup)
# Works on clean installations (with or without wizard) and mature installations
#
# Usage: ./scripts/restore-from-backup.sh [--backup-path PATH] [--force]
#
# Options:
#   --backup-path PATH  Specific backup to restore (default: latest backup)
#   --force            Skip confirmation prompts
#
# What's restored:
#   ✓ data/.env, tags.json, monitored-groups.json, .wizard-completed
#   ✓ vault/tags/, vault/groups/ (markdown content)
#   ✓ data/logs/ (if exists)
#
# What's preserved (NOT restored from backup):
#   ✓ data/session/ (local sessions maintained)
#   ✓ vault/.google-oauth-tokens.json (local OAuth tokens maintained)
#   ✓ data/googledrive/ (local OAuth credentials maintained)
#
# After restore, regenerate sessions/tokens via CLI if needed
# ============================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
BACKUP_DIR="${PROJECT_ROOT}/backups"
BACKUP_PATH=""
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backup-path)
      BACKUP_PATH="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 [--backup-path PATH] [--force]"
      exit 1
      ;;
  esac
done

# Change to project root
cd "$PROJECT_ROOT"

# ============================================
# Helper Functions
# ============================================

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed or not in PATH"
    exit 1
  fi
}

check_docker() {
  if ! docker info &> /dev/null; then
    log_error "Docker is not running or not accessible"
    exit 1
  fi
}

# ============================================
# Pre-flight Checks
# ============================================

log_info "Running pre-flight checks..."

# Check required commands
check_command docker
check_docker

# Check for docker compose (modern) or docker-compose (legacy)
if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
  log_error "docker compose is not available"
  log_info "Please install Docker Compose:"
  log_info "  • For Linux, install: docker-compose-plugin or docker-compose"
  log_info "  • See: https://docs.docker.com/compose/install/"
  exit 1
fi

# Use docker-compose if docker compose is not available
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
  COMPOSE_CMD="docker-compose"
fi

# Verify we're in the right directory
if [[ ! -f "docker-compose.yml" ]] || [[ ! -f "package.json" ]]; then
  log_error "This script must be run from the Witral project root"
  exit 1
fi

log_success "Pre-flight checks passed"

# ============================================
# Find Backup
# ============================================

if [[ -n "$BACKUP_PATH" ]]; then
  # Use specified backup path
  if [[ ! -d "$BACKUP_PATH" ]]; then
    log_error "Backup path does not exist: $BACKUP_PATH"
    exit 1
  fi
  SELECTED_BACKUP="$BACKUP_PATH"
  log_info "Using specified backup: $SELECTED_BACKUP"
else
  # Find latest backup
  if [[ ! -d "$BACKUP_DIR" ]]; then
    log_error "Backup directory not found: $BACKUP_DIR"
    log_info "Create a backup first with: ./scripts/create-backup.sh"
    exit 1
  fi
  
  SELECTED_BACKUP=$(ls -td "${BACKUP_DIR}"/backup_* 2>/dev/null | head -1)
  
  if [[ -z "$SELECTED_BACKUP" ]]; then
    log_error "No backups found in $BACKUP_DIR"
    log_info "Create a backup first with: ./scripts/create-backup.sh"
    exit 1
  fi
  
  log_info "Found latest backup: $(basename "$SELECTED_BACKUP")"
fi

# ============================================
# Validate Backup
# ============================================

log_info "Validating backup structure..."

# Check backup directory exists
if [[ ! -d "$SELECTED_BACKUP" ]]; then
  log_error "Backup directory does not exist: $SELECTED_BACKUP"
  exit 1
fi

# Check for backup_info.txt (indicates valid backup)
if [[ ! -f "${SELECTED_BACKUP}/backup_info.txt" ]]; then
  log_warning "backup_info.txt not found - backup may be incomplete"
  if [[ "$FORCE" != true ]]; then
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      log_info "Restore cancelled"
      exit 0
    fi
  fi
fi

# Check that backup has at least data/ or vault/
if [[ ! -d "${SELECTED_BACKUP}/data" ]] && [[ ! -d "${SELECTED_BACKUP}/vault" ]]; then
  log_error "Backup appears to be empty (no data/ or vault/ directories)"
  exit 1
fi

# Show backup information
if [[ -f "${SELECTED_BACKUP}/backup_info.txt" ]]; then
  log_info "Backup information:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  head -20 "${SELECTED_BACKUP}/backup_info.txt" | grep -v "^=" | head -15
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

log_success "Backup validation passed"

# ============================================
# Confirm Restoration
# ============================================

if [[ "$FORCE" != true ]]; then
  log_warning "This will OVERWRITE all current data/ and vault/ directories"
  log_warning "Any existing data will be permanently lost!"
  echo
  log_info "Backup to restore: $(basename "$SELECTED_BACKUP")"
  log_info "Backup location: $SELECTED_BACKUP"
  echo
  read -p "Are you sure you want to proceed? (yes/N): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Restore cancelled"
    exit 0
  fi
fi

# ============================================
# Stop Container
# ============================================

CONTAINER_RUNNING=false
if docker ps --format '{{.Names}}' | grep -q "^witral$"; then
  CONTAINER_RUNNING=true
  log_info "Stopping running container..."
  docker compose down || {
    log_error "Failed to stop container"
    exit 1
  }
  log_success "Container stopped"
else
  log_info "Container is not running"
fi

# ============================================
# Create Base Directories
# ============================================

log_info "Ensuring base directories exist..."

# Create data/ directory structure
mkdir -p "${PROJECT_ROOT}/data"
mkdir -p "${PROJECT_ROOT}/data/session"
mkdir -p "${PROJECT_ROOT}/data/logs"
mkdir -p "${PROJECT_ROOT}/data/googledrive"

# Create vault/ directory structure
mkdir -p "${PROJECT_ROOT}/vault"
mkdir -p "${PROJECT_ROOT}/vault/tags"
mkdir -p "${PROJECT_ROOT}/vault/groups"

log_success "Base directories created"

# ============================================
# Restore data/ (SELECTIVE - configurations only)
# ============================================

if [[ -d "${SELECTED_BACKUP}/data" ]]; then
  log_info "Restoring data/ directory (configurations only)..."
  log_warning "⚠️  PRESERVING local sessions and OAuth tokens (not restoring from backup)"
  
  # Preserve existing sessions and OAuth tokens
  PRESERVE_SESSION=false
  PRESERVE_OAUTH=false
  
  if [[ -d "${PROJECT_ROOT}/data/session" ]]; then
    SESSION_COUNT=$(find "${PROJECT_ROOT}/data/session" -type f 2>/dev/null | wc -l)
    if [[ $SESSION_COUNT -gt 0 ]]; then
      PRESERVE_SESSION=true
      log_info "  Preserving existing session data ($SESSION_COUNT files)"
      # Create temporary backup of session
      if [[ -d "${PROJECT_ROOT}/data/session" ]]; then
        mkdir -p "/tmp/witral-restore-session-$$"
        cp -r "${PROJECT_ROOT}/data/session" "/tmp/witral-restore-session-$$/" 2>/dev/null || true
      fi
    fi
  fi
  
  if [[ -f "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" ]]; then
    PRESERVE_OAUTH=true
    log_info "  Preserving existing OAuth tokens"
    # Create temporary backup of OAuth tokens
    mkdir -p "/tmp/witral-restore-oauth-$$"
    cp "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" "/tmp/witral-restore-oauth-$$/" 2>/dev/null || true
  fi
  
  if [[ -d "${PROJECT_ROOT}/data/googledrive" ]]; then
    OAUTH_CRED_COUNT=$(find "${PROJECT_ROOT}/data/googledrive" -name "*.json" 2>/dev/null | wc -l)
    if [[ $OAUTH_CRED_COUNT -gt 0 ]]; then
      PRESERVE_OAUTH=true
      log_info "  Preserving existing OAuth credentials ($OAUTH_CRED_COUNT files)"
      mkdir -p "/tmp/witral-restore-oauth-$$/googledrive"
      cp -r "${PROJECT_ROOT}/data/googledrive" "/tmp/witral-restore-oauth-$$/" 2>/dev/null || true
    fi
  fi
  
  # Restore configuration files selectively
  CONFIG_FILES=(
    ".env"
    "tags.json"
    "monitored-groups.json"
    ".wizard-completed"
  )
  
  RESTORED_COUNT=0
  for file in "${CONFIG_FILES[@]}"; do
    if [[ -f "${SELECTED_BACKUP}/data/$file" ]]; then
      cp "${SELECTED_BACKUP}/data/$file" "${PROJECT_ROOT}/data/$file" 2>/dev/null && {
        log_success "  ✓ Restored: data/$file"
        ((RESTORED_COUNT++))
      } || log_warning "  ⚠ Failed to restore: data/$file"
    fi
  done
  
  # Restore logs directory if it exists in backup
  if [[ -d "${SELECTED_BACKUP}/data/logs" ]]; then
    cp -r "${SELECTED_BACKUP}/data/logs" "${PROJECT_ROOT}/data/logs" 2>/dev/null && {
      log_success "  ✓ Restored: data/logs/"
    } || log_warning "  ⚠ Failed to restore: data/logs/"
  fi
  
  # Restore preserved sessions
  if [[ "$PRESERVE_SESSION" == true ]] && [[ -d "/tmp/witral-restore-session-$$/session" ]]; then
    cp -r "/tmp/witral-restore-session-$$/session" "${PROJECT_ROOT}/data/session" 2>/dev/null || true
    rm -rf "/tmp/witral-restore-session-$$" 2>/dev/null || true
    log_success "  ✓ Preserved: data/session/ (local session maintained)"
  fi
  
  # Restore preserved OAuth tokens
  if [[ "$PRESERVE_OAUTH" == true ]]; then
    if [[ -f "/tmp/witral-restore-oauth-$$/.google-oauth-tokens.json" ]]; then
      cp "/tmp/witral-restore-oauth-$$/.google-oauth-tokens.json" "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" 2>/dev/null || true
    fi
    if [[ -d "/tmp/witral-restore-oauth-$$/googledrive" ]]; then
      cp -r "/tmp/witral-restore-oauth-$$/googledrive" "${PROJECT_ROOT}/data/googledrive" 2>/dev/null || true
    fi
    rm -rf "/tmp/witral-restore-oauth-$$" 2>/dev/null || true
    log_success "  ✓ Preserved: OAuth tokens (local tokens maintained)"
  fi
  
  log_success "data/ restored (configurations only: $RESTORED_COUNT files)"
  
  # Verify critical files were restored
  if [[ -f "${PROJECT_ROOT}/data/.env" ]]; then
    log_success "  ✓ Configuration file (.env) restored"
  else
    log_warning "  ⚠ Configuration file (.env) not found in backup"
  fi
  
  if [[ -f "${PROJECT_ROOT}/data/tags.json" ]]; then
    TAG_COUNT=$(jq 'length' "${PROJECT_ROOT}/data/tags.json" 2>/dev/null || echo "0")
    log_success "  ✓ Tags restored ($TAG_COUNT tags)"
  else
    log_warning "  ⚠ Tags file (tags.json) not found in backup"
  fi
  
  if [[ -f "${PROJECT_ROOT}/data/monitored-groups.json" ]]; then
    GROUP_COUNT=$(jq 'length' "${PROJECT_ROOT}/data/monitored-groups.json" 2>/dev/null || echo "0")
    log_success "  ✓ Monitored groups restored ($GROUP_COUNT groups)"
  else
    log_warning "  ⚠ Monitored groups file not found in backup"
  fi
  
  # Warn about sessions if they weren't preserved
  if [[ "$PRESERVE_SESSION" == false ]]; then
    log_warning "  ⚠ No session data found locally - you must regenerate session via CLI"
  fi
  
  # Warn about OAuth if tokens weren't preserved
  if [[ "$PRESERVE_OAUTH" == false ]]; then
    log_warning "  ⚠ No OAuth tokens found locally - you must re-authorize if using cloud sync"
  fi
else
  log_warning "data/ not found in backup - skipping data restoration"
fi

# ============================================
# Restore vault/ (SELECTIVE - content only, excludes OAuth tokens)
# ============================================

if [[ -d "${SELECTED_BACKUP}/vault" ]]; then
  log_info "Restoring vault/ directory (content only, excluding OAuth tokens)..."
  log_warning "⚠️  OAuth tokens are NOT restored (must be regenerated if needed)"
  
  # Preserve existing OAuth tokens if they exist
  PRESERVE_VAULT_OAUTH=false
  if [[ -f "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" ]]; then
    PRESERVE_VAULT_OAUTH=true
    log_info "  Preserving existing OAuth tokens in vault/"
    mkdir -p "/tmp/witral-restore-vault-oauth-$$"
    cp "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" "/tmp/witral-restore-vault-oauth-$$/" 2>/dev/null || true
  fi
  
  # Restore tags/ directory
  if [[ -d "${SELECTED_BACKUP}/vault/tags" ]]; then
    # Remove existing tags/ but preserve structure
    if [[ -d "${PROJECT_ROOT}/vault/tags" ]]; then
      rm -rf "${PROJECT_ROOT}/vault/tags" 2>/dev/null || true
    fi
    cp -r "${SELECTED_BACKUP}/vault/tags" "${PROJECT_ROOT}/vault/tags" 2>/dev/null && {
      TAG_FILES=$(find "${PROJECT_ROOT}/vault/tags" -type f -name "*.md" 2>/dev/null | wc -l)
      log_success "  ✓ Tag markdown files restored ($TAG_FILES files)"
    } || log_warning "  ⚠ Failed to restore: vault/tags/"
  fi
  
  # Restore groups/ directory
  if [[ -d "${SELECTED_BACKUP}/vault/groups" ]]; then
    # Remove existing groups/ but preserve structure
    if [[ -d "${PROJECT_ROOT}/vault/groups" ]]; then
      rm -rf "${PROJECT_ROOT}/vault/groups" 2>/dev/null || true
    fi
    cp -r "${SELECTED_BACKUP}/vault/groups" "${PROJECT_ROOT}/vault/groups" 2>/dev/null && {
      GROUP_FILES=$(find "${PROJECT_ROOT}/vault/groups" -type f -name "*.md" 2>/dev/null | wc -l)
      log_success "  ✓ Group markdown files restored ($GROUP_FILES files)"
    } || log_warning "  ⚠ Failed to restore: vault/groups/"
  fi
  
  # Restore preserved OAuth tokens
  if [[ "$PRESERVE_VAULT_OAUTH" == true ]] && [[ -f "/tmp/witral-restore-vault-oauth-$$/.google-oauth-tokens.json" ]]; then
    cp "/tmp/witral-restore-vault-oauth-$$/.google-oauth-tokens.json" "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" 2>/dev/null || true
    rm -rf "/tmp/witral-restore-vault-oauth-$$" 2>/dev/null || true
    log_success "  ✓ Preserved: vault/.google-oauth-tokens.json (local tokens maintained)"
  else
    log_warning "  ⚠ OAuth tokens not restored - regenerate via CLI if using cloud sync"
  fi
  
  log_success "vault/ restored (content only: tags/, groups/)"
else
  log_warning "vault/ not found in backup - skipping vault restoration"
fi

# ============================================
# Adjust Permissions
# ============================================

log_info "Adjusting file permissions..."

# Set permissions for data/
chmod -R 777 "${PROJECT_ROOT}/data" 2>/dev/null || true

# Set permissions for vault/
chmod -R 777 "${PROJECT_ROOT}/vault" 2>/dev/null || true

# Try to set ownership if running as root
if [[ "$(id -u)" == "0" ]]; then
  chown -R 1001:1001 "${PROJECT_ROOT}/data" 2>/dev/null || true
  chown -R 1001:1001 "${PROJECT_ROOT}/vault" 2>/dev/null || true
fi

log_success "Permissions adjusted"

# ============================================
# Restart Container
# ============================================

log_info "Starting container with restored data..."

# Build and start container
$COMPOSE_CMD up -d --build || {
  log_error "Failed to start container"
  log_warning "Data has been restored, but container failed to start"
  log_warning "Check logs with: $COMPOSE_CMD logs witral"
  exit 1
}

log_success "Container started successfully"

# ============================================
# Health Check
# ============================================

log_info "Waiting for container to be healthy..."
sleep 5

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^witral$"; then
  log_error "Container failed to start"
  log_warning "Check logs with: $COMPOSE_CMD logs witral"
  exit 1
fi

# Wait for health check
MAX_WAIT=60
WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' witral 2>/dev/null || echo "none")
  if [[ "$HEALTH" == "healthy" ]]; then
    log_success "Container is healthy"
    break
  elif [[ "$HEALTH" == "unhealthy" ]]; then
    log_error "Container is unhealthy"
    log_warning "Check logs with: $COMPOSE_CMD logs witral"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo -n "."
done
echo

if [[ $WAITED -ge $MAX_WAIT ]]; then
  log_warning "Health check timeout (container may still be starting)"
  log_info "Check status with: docker compose ps"
fi

# ============================================
# Summary
# ============================================

log_success "Restore completed successfully!"
echo
log_info "Summary:"
echo "  • Backup: $(basename "$SELECTED_BACKUP")"
echo "  • Data restored: $([ -d "${PROJECT_ROOT}/data" ] && echo "Yes" || echo "No")"
echo "  • Vault restored: $([ -d "${PROJECT_ROOT}/vault" ] && echo "Yes" || echo "No")"
echo "  • Container: Running"
echo
log_warning "⚠️  IMPORTANT - Next Steps:"
echo "  • Sessions and OAuth tokens were NOT restored from backup"
echo "  • If you need to regenerate them:"
echo "    1. Messaging Service Session:"
echo "       Access CLI menu → Messaging Service → Clear Session"
echo "       Then reconnect to generate new QR/credentials"
echo "    2. OAuth Tokens (if using cloud sync):"
echo "       Access CLI menu → Settings → Configure Cloud Sync → Clear OAuth Tokens"
echo "       Then re-authorize OAuth"
echo
log_info "Useful commands:"
echo "  • View logs: $COMPOSE_CMD logs -f witral"
echo "  • Check status: $COMPOSE_CMD ps"
echo "  • Create new backup: ./scripts/create-backup.sh"
echo
