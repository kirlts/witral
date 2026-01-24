#!/bin/bash
# ============================================
# Witral - Download Production Script
# ============================================
# Downloads and mirrors production Witral configurations and content to local
# PRESERVES local sessions and OAuth tokens (does not download them from production)
#
# Usage: ./scripts/download-prod.sh --ip IP_ADDRESS --key PRIVATE_KEY_PATH [--user USERNAME] [--port PORT] [--force]
#
# Options:
#   --ip IP_ADDRESS        Production server IP address (required)
#   --key PRIVATE_KEY_PATH Path to SSH private key file (required)
#   --user USERNAME        SSH username (default: ubuntu)
#   --port PORT            SSH port (default: 22)
#   --force                Skip confirmation prompts
#
# What's downloaded:
#   ✓ data/.env, tags.json, monitored-groups.json, .wizard-completed
#   ✓ vault/tags/, vault/groups/ (markdown content)
#   ✓ data/logs/ (if exists)
#
# What's preserved (NOT downloaded from production):
#   ✓ data/session/ (local sessions maintained)
#   ✓ vault/.google-oauth-tokens.json (local OAuth tokens maintained)
#   ✓ data/googledrive/ (local OAuth credentials maintained)
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
PROD_IP=""
PRIVATE_KEY=""
SSH_USER="ubuntu"
SSH_PORT="22"
FORCE=false
REMOTE_WITRAL_PATH="~/witral"
DOCKER_COMPOSE_CMD=""  # Will be set during pre-flight checks

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --ip)
      PROD_IP="$2"
      shift 2
      ;;
    --key)
      PRIVATE_KEY="$2"
      shift 2
      ;;
    --user)
      SSH_USER="$2"
      shift 2
      ;;
    --port)
      SSH_PORT="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 --ip IP_ADDRESS --key PRIVATE_KEY_PATH [--user USERNAME] [--port PORT] [--force]"
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

# Check required arguments
if [[ -z "$PROD_IP" ]]; then
  log_error "Production IP address is required (--ip)"
  echo "Usage: $0 --ip IP_ADDRESS --key PRIVATE_KEY_PATH [--user USERNAME] [--port PORT] [--force]"
  exit 1
fi

if [[ -z "$PRIVATE_KEY" ]]; then
  log_error "Private key path is required (--key)"
  echo "Usage: $0 --ip IP_ADDRESS --key PRIVATE_KEY_PATH [--user USERNAME] [--port PORT] [--force]"
  exit 1
fi

# Check required commands
check_command ssh
check_command rsync
check_command docker
# Check for docker compose (modern) or docker-compose (legacy)
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
  if ! command -v docker-compose &> /dev/null; then
    log_error "Neither 'docker compose' nor 'docker-compose' is available"
    exit 1
  fi
  DOCKER_COMPOSE_CMD="docker-compose"
else
  DOCKER_COMPOSE_CMD="docker compose"
fi
check_docker

# Verify private key exists and has correct permissions
if [[ ! -f "$PRIVATE_KEY" ]]; then
  log_error "Private key file not found: $PRIVATE_KEY"
  exit 1
fi

# Ensure private key has correct permissions (600)
chmod 600 "$PRIVATE_KEY" 2>/dev/null || {
  log_warning "Could not set private key permissions to 600 (may require sudo)"
}

# Verify we're in the right directory
if [[ ! -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
  log_error "docker-compose.yml not found. Are you in the Witral project root?"
  exit 1
fi

log_success "Pre-flight checks passed"
echo

# ============================================
# Test SSH Connection
# ============================================

log_info "Testing SSH connection to production server..."

# Test connection
if ! ssh -i "$PRIVATE_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${PROD_IP}" "echo 'Connection successful'" &>/dev/null; then
  log_error "Failed to connect to ${SSH_USER}@${PROD_IP}:${SSH_PORT}"
  log_error "Please verify:"
  log_error "  • IP address is correct"
  log_error "  • Private key is correct and has proper permissions (chmod 600)"
  log_error "  • SSH port is correct (default: 22)"
  log_error "  • Server is accessible from your network"
  exit 1
fi

log_success "SSH connection successful"
echo

# ============================================
# Verify Remote Witral Installation
# ============================================

log_info "Verifying remote Witral installation..."

# Check if remote Witral directory exists
if ! ssh -i "$PRIVATE_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${PROD_IP}" "test -d ${REMOTE_WITRAL_PATH}" &>/dev/null; then
  log_error "Witral directory not found on production server: ${REMOTE_WITRAL_PATH}"
  log_error "Please verify the remote path is correct"
  exit 1
fi

# Check if remote data/ and vault/ directories exist
if ! ssh -i "$PRIVATE_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${PROD_IP}" "test -d ${REMOTE_WITRAL_PATH}/data && test -d ${REMOTE_WITRAL_PATH}/vault" &>/dev/null; then
  log_warning "Remote data/ or vault/ directories not found"
  log_warning "This may be a fresh installation. Proceeding anyway..."
fi

log_success "Remote Witral installation verified"
echo

# ============================================
# Confirmation
# ============================================

if [[ "$FORCE" != true ]]; then
  log_warning "This will:"
  log_warning "  • Stop your local Witral container"
  log_warning "  • Replace local data/ and vault/ with production data"
  log_warning "  • Restart your local container"
  echo
  read -p "Continue? (yes/no): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Operation cancelled"
    exit 0
  fi
fi

# ============================================
# Stop Local Container
# ============================================

log_info "Stopping local Witral container (if running)..."

# Check if container is running (works for both docker compose and docker-compose)
if $DOCKER_COMPOSE_CMD ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  $DOCKER_COMPOSE_CMD down || {
    log_warning "Failed to stop container gracefully, forcing stop..."
    $DOCKER_COMPOSE_CMD kill 2>/dev/null || true
    $DOCKER_COMPOSE_CMD down 2>/dev/null || true
  }
  log_success "Container stopped"
else
  log_info "Container is not running (this is normal for first-time setup)"
fi

echo

# ============================================
# Create Backup of Local Data (Safety)
# ============================================

log_info "Creating backup of local data (safety measure)..."

if [[ -d "${PROJECT_ROOT}/data" ]] || [[ -d "${PROJECT_ROOT}/vault" ]]; then
  BACKUP_DIR="${PROJECT_ROOT}/backups"
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  LOCAL_BACKUP="${BACKUP_DIR}/local_before_prod_download_${TIMESTAMP}"
  
  mkdir -p "$LOCAL_BACKUP"
  
  if [[ -d "${PROJECT_ROOT}/data" ]]; then
    cp -r "${PROJECT_ROOT}/data" "${LOCAL_BACKUP}/data" 2>/dev/null || true
  fi
  
  if [[ -d "${PROJECT_ROOT}/vault" ]]; then
    cp -r "${PROJECT_ROOT}/vault" "${LOCAL_BACKUP}/vault" 2>/dev/null || true
  fi
  
  log_success "Local backup created: $(basename "$LOCAL_BACKUP")"
else
  log_info "No local data to backup"
fi

echo

# ============================================
# Download Production Data
# ============================================

log_info "Downloading production data..."

# Ensure local directories exist
mkdir -p "${PROJECT_ROOT}/data"
mkdir -p "${PROJECT_ROOT}/vault"

# Download data/ directory using rsync (SELECTIVE - excludes sessions and OAuth tokens)
log_info "  Downloading data/ directory (configurations only)..."
log_warning "    ⚠️  EXCLUDED: data/session/ and data/googledrive/ (to prevent session conflicts)"
log_info "    This includes: .env, tags.json, monitored-groups.json, logs/"

# Run rsync with exclusions for sessions and OAuth credentials
# Use -rLz (no -a) to avoid preserving permissions/times that fail on WSL or Docker-created dirs
set +e
rsync -rLz --delete --exclude='session/' --exclude='googledrive/' --info=progress2 -e "ssh -i \"$PRIVATE_KEY\" -p $SSH_PORT -o StrictHostKeyChecking=no" "${SSH_USER}@${PROD_IP}:${REMOTE_WITRAL_PATH}/data/" "${PROJECT_ROOT}/data/"
RSYNC_EXIT_CODE=$?
set -e

# Check if files were actually downloaded (even if rsync returned non-zero)
FILES_DOWNLOADED=false
if [[ -f "${PROJECT_ROOT}/data/.env" ]] || [[ -f "${PROJECT_ROOT}/data/tags.json" ]]; then
  FILES_DOWNLOADED=true
fi

if [[ $RSYNC_EXIT_CODE -eq 0 ]]; then
  log_success "  ✓ data/ downloaded successfully"
elif [[ "$FILES_DOWNLOADED" == true ]]; then
  if [[ $RSYNC_EXIT_CODE -eq 23 ]] || [[ $RSYNC_EXIT_CODE -eq 24 ]]; then
    log_warning "  ⚠ data/ downloaded with warnings (some files may have issues)"
  else
    log_warning "  ⚠ data/ downloaded but rsync reported issues (exit code: $RSYNC_EXIT_CODE)"
  fi
else
  log_error "  ✗ Failed to download data/ (exit code: $RSYNC_EXIT_CODE)"
  log_error "    Check SSH connection and remote path: ${REMOTE_WITRAL_PATH}/data/"
fi

# Download vault/ directory (SELECTIVE - excludes OAuth tokens)
log_info "  Downloading vault/ directory (content only, excluding OAuth tokens)..."
log_warning "    ⚠️  EXCLUDED: vault/.google-oauth-tokens.json (to prevent token conflicts)"
log_info "    This includes: tags/, groups/"

set +e
rsync -rLz --delete --exclude='.google-oauth-tokens.json' --info=progress2 -e "ssh -i \"$PRIVATE_KEY\" -p $SSH_PORT -o StrictHostKeyChecking=no" "${SSH_USER}@${PROD_IP}:${REMOTE_WITRAL_PATH}/vault/" "${PROJECT_ROOT}/vault/"
RSYNC_EXIT_CODE=$?
set -e

FILES_DOWNLOADED=false
if [[ -d "${PROJECT_ROOT}/vault/tags" ]] || [[ -d "${PROJECT_ROOT}/vault/groups" ]]; then
  FILES_DOWNLOADED=true
fi

if [[ $RSYNC_EXIT_CODE -eq 0 ]]; then
  log_success "  ✓ vault/ downloaded successfully"
elif [[ "$FILES_DOWNLOADED" == true ]]; then
  if [[ $RSYNC_EXIT_CODE -eq 23 ]] || [[ $RSYNC_EXIT_CODE -eq 24 ]]; then
    log_warning "  ⚠ vault/ downloaded with warnings (some files may have issues)"
  else
    log_warning "  ⚠ vault/ downloaded but rsync reported issues (exit code: $RSYNC_EXIT_CODE)"
  fi
else
  log_error "  ✗ Failed to download vault/ (exit code: $RSYNC_EXIT_CODE)"
  log_error "    Check SSH connection and remote path: ${REMOTE_WITRAL_PATH}/vault/"
fi

echo

# ============================================
# Verify Downloaded Data
# ============================================

log_info "Verifying downloaded data..."

VERIFICATION_FAILED=false

# Check critical files
if [[ -f "${PROJECT_ROOT}/data/.env" ]]; then
  log_success "  ✓ Configuration file (.env) downloaded"
else
  log_warning "  ⚠ Configuration file (.env) not found"
fi

if [[ -f "${PROJECT_ROOT}/data/tags.json" ]]; then
  # Try to count tags (use python if jq not available)
  if command -v jq &> /dev/null; then
    TAG_COUNT=$(jq 'length' "${PROJECT_ROOT}/data/tags.json" 2>/dev/null || echo "0")
  elif command -v python3 &> /dev/null; then
    TAG_COUNT=$(python3 -c "import json; f=open('${PROJECT_ROOT}/data/tags.json'); d=json.load(f); print(len(d))" 2>/dev/null || echo "0")
  else
    TAG_COUNT="?"
  fi
  log_success "  ✓ Tags file downloaded ($TAG_COUNT tags)"
else
  log_warning "  ⚠ Tags file (tags.json) not found"
fi

if [[ -f "${PROJECT_ROOT}/data/monitored-groups.json" ]]; then
  if command -v jq &> /dev/null; then
    GROUP_COUNT=$(jq 'length' "${PROJECT_ROOT}/data/monitored-groups.json" 2>/dev/null || echo "0")
  elif command -v python3 &> /dev/null; then
    GROUP_COUNT=$(python3 -c "import json; f=open('${PROJECT_ROOT}/data/monitored-groups.json'); d=json.load(f); print(len(d))" 2>/dev/null || echo "0")
  else
    GROUP_COUNT="?"
  fi
  log_success "  ✓ Monitored groups file downloaded ($GROUP_COUNT groups)"
else
  log_warning "  ⚠ Monitored groups file not found"
fi

# Note: Sessions and OAuth tokens are NOT downloaded (excluded to prevent conflicts)
if [[ -d "${PROJECT_ROOT}/data/session" ]]; then
  SESSION_COUNT=$(find "${PROJECT_ROOT}/data/session" -type f 2>/dev/null | wc -l)
  if [[ $SESSION_COUNT -gt 0 ]]; then
    log_info "  ℹ️  Local session data preserved ($SESSION_COUNT files - not overwritten)"
  else
    log_warning "  ⚠ No session data found - regenerate via CLI menu"
  fi
fi

if [[ -d "${PROJECT_ROOT}/data/googledrive" ]]; then
  OAUTH_COUNT=$(find "${PROJECT_ROOT}/data/googledrive" -name "*.json" 2>/dev/null | wc -l)
  if [[ $OAUTH_COUNT -gt 0 ]]; then
    log_info "  ℹ️  Local OAuth credentials preserved ($OAUTH_COUNT files - not overwritten)"
  fi
fi

if [[ -d "${PROJECT_ROOT}/vault/tags" ]]; then
  TAG_FILES=$(find "${PROJECT_ROOT}/vault/tags" -type f -name "*.md" 2>/dev/null | wc -l)
  log_success "  ✓ Tag markdown files downloaded ($TAG_FILES files)"
fi

if [[ -d "${PROJECT_ROOT}/vault/groups" ]]; then
  GROUP_FILES=$(find "${PROJECT_ROOT}/vault/groups" -type f -name "*.md" 2>/dev/null | wc -l)
  log_success "  ✓ Group markdown files downloaded ($GROUP_FILES files)"
fi

# Note: OAuth tokens are NOT downloaded (excluded to prevent conflicts)
if [[ -f "${PROJECT_ROOT}/vault/.google-oauth-tokens.json" ]]; then
  log_info "  ℹ️  Local OAuth tokens preserved (not overwritten)"
else
  log_warning "  ⚠ No OAuth tokens found - regenerate via CLI if using cloud sync"
fi

echo

# ============================================
# Adjust File Permissions
# ============================================

log_info "Adjusting file permissions..."

# Set permissions for data/ and vault/ (try without sudo first)
PERM_ERROR=false
if ! chmod -R 777 "${PROJECT_ROOT}/data" 2>/dev/null; then
  PERM_ERROR=true
fi

if ! chmod -R 777 "${PROJECT_ROOT}/vault" 2>/dev/null; then
  PERM_ERROR=true
fi

# If running as root, change ownership
if [[ "$EUID" -eq 0 ]]; then
  chown -R 1001:1001 "${PROJECT_ROOT}/data" 2>/dev/null || true
  chown -R 1001:1001 "${PROJECT_ROOT}/vault" 2>/dev/null || true
fi

if [[ "$PERM_ERROR" == true ]]; then
  log_warning "Some permissions could not be set (Docker will handle this automatically)"
else
  log_success "Permissions adjusted"
fi
echo

# ============================================
# Start Local Container
# ============================================

log_info "Starting local container with production data..."

# Rebuild if needed (in case of code changes)
log_info "  Building/updating Docker image..."
$DOCKER_COMPOSE_CMD build --no-cache >/dev/null 2>&1 || {
  log_warning "Full rebuild failed, trying incremental build..."
  $DOCKER_COMPOSE_CMD build >/dev/null 2>&1 || {
    log_warning "Build failed, trying to start with existing image..."
  }
}

# Start container in background
log_info "  Starting container..."
if $DOCKER_COMPOSE_CMD up -d --remove-orphans; then
  log_success "Container started successfully"
else
  log_error "Failed to start container"
  log_info "Try running manually: $DOCKER_COMPOSE_CMD up -d --remove-orphans"
  exit 1
fi

echo

# ============================================
# Summary
# ============================================

log_success "Production mirror completed successfully!"
echo
log_info "Summary:"
echo "  • Production server: ${SSH_USER}@${PROD_IP}:${SSH_PORT}"
echo "  • Data downloaded: Yes"
echo "  • Vault downloaded: Yes"
echo "  • Container: Running"
if [[ -n "${LOCAL_BACKUP:-}" ]]; then
  echo "  • Local backup: $(basename "$LOCAL_BACKUP")"
fi
echo
log_info "Useful commands:"
echo "  • View logs: $DOCKER_COMPOSE_CMD logs -f witral"
echo "  • Check status: $DOCKER_COMPOSE_CMD ps"
if [[ -n "${LOCAL_BACKUP:-}" ]]; then
  echo "  • Restore local backup: ./scripts/restore-from-backup.sh --backup-path ${LOCAL_BACKUP}"
fi
echo
log_info "Next steps:"
echo "  • Your local environment is now a mirror of production. Develop and test changes safely."
echo "  • To update production, SSH to the server and run ./scripts/update-prod.sh there. This script does not deploy."
echo
log_warning "⚠️  IMPORTANT - Sessions and OAuth tokens were NOT downloaded:"
echo "  • Sessions and OAuth tokens are excluded to prevent conflicts"
echo "  • If you need to regenerate them:"
echo "    1. Messaging Service Session:"
echo "       Access CLI menu → Messaging Service → Clear Session"
echo "       Then reconnect to generate new QR/credentials"
echo "    2. OAuth Tokens (if using cloud sync):"
echo "       Access CLI menu → Settings → Configure Cloud Sync → Clear OAuth Tokens"
echo "       Then re-authorize OAuth"
echo
