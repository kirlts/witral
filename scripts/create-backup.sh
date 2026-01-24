#!/bin/bash
# ============================================
# Witral - Backup Creation Script
# ============================================
# Creates selective backups of configurations and content
# EXCLUDES: messaging service sessions and OAuth tokens
#           (these must be regenerated manually after restore)
#
# Can be used standalone or called from other scripts
#
# Usage: ./scripts/create-backup.sh [--output-dir DIR] [--keep N]
#
# Options:
#   --output-dir DIR  Directory to store backups (default: ./backups)
#   --keep N          Number of backups to keep (default: 10)
#
# What's backed up:
#   ✓ data/.env, tags.json, monitored-groups.json, .wizard-completed
#   ✓ vault/tags/, vault/groups/ (markdown content)
#   ✓ data/logs/ (if exists)
#
# What's excluded:
#   ✗ data/session/ (messaging service sessions)
#   ✗ vault/.google-oauth-tokens.json (OAuth tokens)
#   ✗ data/googledrive/ (OAuth credentials)
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
KEEP_BACKUPS=10

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --output-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --keep)
      KEEP_BACKUPS="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 [--output-dir DIR] [--keep N]"
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

# ============================================
# Pre-flight Checks
# ============================================

log_info "Running pre-flight checks..."

# Verify we're in the right directory
if [[ ! -f "docker-compose.yml" ]] || [[ ! -f "package.json" ]]; then
  log_error "This script must be run from the Witral project root"
  exit 1
fi

# Check if git is available (optional, for metadata)
if command -v git &> /dev/null; then
  GIT_AVAILABLE=true
else
  GIT_AVAILABLE=false
  log_warning "Git not available - metadata will be limited"
fi

# Check if Docker is available (optional, for metadata)
if command -v docker &> /dev/null && docker info &> /dev/null; then
  DOCKER_AVAILABLE=true
else
  DOCKER_AVAILABLE=false
  log_warning "Docker not available - metadata will be limited"
fi

# Check if container is running (for metadata)
CONTAINER_RUNNING=false
if [[ "$DOCKER_AVAILABLE" == true ]]; then
  if docker ps --format '{{.Names}}' | grep -q "^witral$"; then
    CONTAINER_RUNNING=true
  fi
fi

log_success "Pre-flight checks passed"

# ============================================
# Backup Creation
# ============================================

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CURRENT_BACKUP="${BACKUP_DIR}/backup_${TIMESTAMP}"

log_info "Creating selective backup (configurations and content only)..."
log_warning "⚠️  EXCLUDED from backup (to prevent session conflicts):"
log_warning "  • data/session/ (messaging service sessions)"
log_warning "  • vault/.google-oauth-tokens.json (OAuth tokens)"
log_warning "  • data/googledrive/ (OAuth credentials)"
log_warning "  These must be regenerated manually after restore."

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$CURRENT_BACKUP"

# Track what's being backed up
BACKUP_ITEMS=()

# Backup data/ directory (SELECTIVE - excludes sessions and OAuth tokens)
if [[ -d "data" ]]; then
  log_info "Backing up data/ directory (configurations only)..."
  mkdir -p "${CURRENT_BACKUP}/data"
  BACKUP_ITEMS+=("data/ (selective)")
  
  # Verify critical files exist
  CRITICAL_FILES=(
    "data/.env"
    "data/tags.json"
    "data/monitored-groups.json"
    "data/.wizard-completed"
  )
  
  log_info "Verifying critical configuration files..."
  for file in "${CRITICAL_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      cp "$file" "${CURRENT_BACKUP}/$file" 2>/dev/null || true
      log_success "  ✓ Backed up: $file"
    else
      log_warning "  ⚠ Missing: $file (may be first run)"
    fi
  done
  
  # Backup logs directory if it exists (but not session/)
  if [[ -d "data/logs" ]]; then
    cp -r "data/logs" "${CURRENT_BACKUP}/data/logs" 2>/dev/null || true
    log_info "  ✓ Backed up: data/logs/"
  fi
  
  # Check for session data (but don't back it up)
  if [[ -d "data/session" ]]; then
    SESSION_COUNT=$(find "data/session" -type f 2>/dev/null | wc -l)
    log_warning "  ⚠ EXCLUDED: data/session/ ($SESSION_COUNT files - will not be backed up)"
  fi
  
  # Check for OAuth credentials (but don't back them up)
  if [[ -d "data/googledrive" ]]; then
    OAUTH_FILES=$(find "data/googledrive" -name "*.json" 2>/dev/null | wc -l)
    if [[ $OAUTH_FILES -gt 0 ]]; then
      log_warning "  ⚠ EXCLUDED: data/googledrive/ ($OAUTH_FILES file(s) - will not be backed up)"
    fi
  fi
  
  log_success "data/ backed up (configurations only: .env, tags.json, monitored-groups.json, logs/)"
else
  log_warning "data/ directory not found (first run?)"
fi

# Backup vault/ directory (SELECTIVE - excludes OAuth tokens)
if [[ -d "vault" ]]; then
  log_info "Backing up vault/ directory (content only, excluding OAuth tokens)..."
  mkdir -p "${CURRENT_BACKUP}/vault"
  BACKUP_ITEMS+=("vault/ (selective)")
  
  # Backup tags/ directory
  if [[ -d "vault/tags" ]]; then
    cp -r "vault/tags" "${CURRENT_BACKUP}/vault/tags" 2>/dev/null || true
    TAG_FILES=$(find "vault/tags" -type f -name "*.md" 2>/dev/null | wc -l)
    log_info "  ✓ Backed up: vault/tags/ ($TAG_FILES markdown files)"
  fi
  
  # Backup groups/ directory
  if [[ -d "vault/groups" ]]; then
    cp -r "vault/groups" "${CURRENT_BACKUP}/vault/groups" 2>/dev/null || true
    GROUP_FILES=$(find "vault/groups" -type f -name "*.md" 2>/dev/null | wc -l)
    log_info "  ✓ Backed up: vault/groups/ ($GROUP_FILES markdown files)"
  fi
  
  # Check for OAuth tokens (but don't back them up)
  if [[ -f "vault/.google-oauth-tokens.json" ]]; then
    log_warning "  ⚠ EXCLUDED: vault/.google-oauth-tokens.json (will not be backed up)"
  fi
  
  log_success "vault/ backed up (content only: tags/, groups/)"
else
  log_warning "vault/ directory not found (first run?)"
fi

# Verify we backed up something
if [[ ${#BACKUP_ITEMS[@]} -eq 0 ]]; then
  log_error "No data to backup (data/ and vault/ not found)"
  rm -rf "$CURRENT_BACKUP"
  exit 1
fi

# Create detailed backup info file
log_info "Creating backup metadata..."
cat > "${CURRENT_BACKUP}/backup_info.txt" <<EOF
========================================
Witral Production Backup Information
========================================
Backup created: $(date)
Backup ID: $(basename "$CURRENT_BACKUP")

Git Information:
  Commit: $([ "$GIT_AVAILABLE" == true ] && git rev-parse HEAD 2>/dev/null || echo "unknown")
  Branch: $([ "$GIT_AVAILABLE" == true ] && git branch --show-current 2>/dev/null || echo "unknown")
  Commit message: $([ "$GIT_AVAILABLE" == true ] && git log -1 --pretty=format:"%s" 2>/dev/null || echo "unknown")

Docker Information:
  Image ID: $([ "$DOCKER_AVAILABLE" == true ] && docker images witral:latest --format "{{.ID}}" 2>/dev/null || echo "unknown")
  Image tag: $([ "$DOCKER_AVAILABLE" == true ] && docker images witral:latest --format "{{.Tag}}" 2>/dev/null || echo "unknown")
  Container was running: $CONTAINER_RUNNING

Backup Contents:
$(for item in "${BACKUP_ITEMS[@]}"; do echo "  - $item"; done)

Critical Files Backed Up:
$(for file in "${CRITICAL_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      SIZE=$(du -h "$file" 2>/dev/null | cut -f1)
      echo "  ✓ $file ($SIZE)"
    fi
  done)

Data Statistics:
$(if [[ -f "data/tags.json" ]]; then
    TAG_COUNT=$(jq 'length' "data/tags.json" 2>/dev/null || echo "0")
    echo "  Tags configured: $TAG_COUNT"
  fi)
$(if [[ -f "data/monitored-groups.json" ]]; then
    GROUP_COUNT=$(jq 'length' "data/monitored-groups.json" 2>/dev/null || echo "0")
    echo "  Monitored groups: $GROUP_COUNT"
  fi)
$(if [[ -d "vault/tags" ]]; then
    echo "  Tag markdown files: $(find vault/tags -type f -name "*.md" 2>/dev/null | wc -l)"
  fi)
$(if [[ -d "vault/groups" ]]; then
    echo "  Group markdown files: $(find vault/groups -type f -name "*.md" 2>/dev/null | wc -l)"
  fi)

EXCLUDED FROM BACKUP (to prevent session conflicts):
  ✗ data/session/ - Messaging service sessions (must be regenerated)
  ✗ vault/.google-oauth-tokens.json - OAuth tokens (must be regenerated)
  ✗ data/googledrive/ - OAuth credentials (must be regenerated)

IMPORTANT: After restoring this backup, you must:
  1. Regenerate messaging service session via CLI menu (Messaging Service → Clear Session)
  2. Re-authorize OAuth if using cloud sync (Settings → Configure Cloud Sync → Clear OAuth Tokens)

Session Data (EXCLUDED):
$(if [[ -d "data/session" ]]; then
    echo "  Session files found: $(find data/session -type f 2>/dev/null | wc -l) (NOT backed up)"
  else
    echo "  No session data found"
  fi)

OAuth Tokens (EXCLUDED):
$(if [[ -f "vault/.google-oauth-tokens.json" ]]; then
    echo "  OAuth tokens found (NOT backed up - must be regenerated)"
  else
    echo "  No OAuth tokens found"
  fi)
$(if [[ -d "data/googledrive" ]] && [[ $(find data/googledrive -name "*.json" 2>/dev/null | wc -l) -gt 0 ]]; then
    echo "  OAuth credentials found (NOT backed up - must be regenerated)"
  else
    echo "  No OAuth credentials found"
  fi)

Backup Size:
  Total: $(du -sh "$CURRENT_BACKUP" 2>/dev/null | cut -f1)

========================================
To restore this backup, run:
  ./scripts/restore-from-backup.sh --backup-path "$CURRENT_BACKUP"
========================================
EOF

log_success "Backup created: $(basename "$CURRENT_BACKUP")"
log_info "Backup size: $(du -sh "$CURRENT_BACKUP" 2>/dev/null | cut -f1)"
log_info "Backup location: $CURRENT_BACKUP"

# Cleanup old backups
if [[ $KEEP_BACKUPS -gt 0 ]]; then
  log_info "Cleaning up old backups (keeping last $KEEP_BACKUPS)..."
  BACKUP_COUNT=$(ls -td "${BACKUP_DIR}"/backup_* 2>/dev/null | wc -l)
  if [[ $BACKUP_COUNT -gt $KEEP_BACKUPS ]]; then
    REMOVE_COUNT=$((BACKUP_COUNT - KEEP_BACKUPS))
    ls -td "${BACKUP_DIR}"/backup_* 2>/dev/null | tail -n "$REMOVE_COUNT" | xargs rm -rf 2>/dev/null || true
    log_success "Removed $REMOVE_COUNT old backup(s)"
  else
    log_info "No old backups to remove"
  fi
fi

log_success "Backup process completed successfully!"
echo
log_info "Backup summary:"
echo "  • Location: $CURRENT_BACKUP"
echo "  • Size: $(du -sh "$CURRENT_BACKUP" 2>/dev/null | cut -f1)"
echo "  • Items: $(IFS=', '; echo "${BACKUP_ITEMS[*]}")"
echo "  • Type: Selective backup (configurations and content only)"
echo "  • Excluded: Sessions and OAuth tokens (must be regenerated after restore)"
echo

# Exit with success
exit 0
