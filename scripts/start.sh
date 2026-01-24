#!/bin/bash
#
# Witral - Smart Start Script
# 
# This script intelligently starts Witral:
# - If wizard is not completed: runs interactively for setup
# - If wizard is completed: starts in background (24/7 mode)
#
# Usage:
#   ./scripts/start.sh          # Interactive mode (first time)
#   ./scripts/start.sh --bg     # Force background mode (skip wizard check)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WIZARD_FLAG="$PROJECT_DIR/data/.wizard-completed"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo ""
    echo "❌ Error: Docker is not installed or not in PATH"
    echo ""
    echo "📦 Witral requires Docker to run. Please install Docker first:"
    echo ""
    echo "   • Linux:   https://docs.docker.com/engine/install/"
    echo "   • macOS:   https://docs.docker.com/desktop/install/mac-install/"
    echo "   • Windows: https://docs.docker.com/desktop/install/windows-install/"
    echo ""
    echo "   After installation, make sure Docker is running and try again."
    echo ""
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    echo ""
    echo "❌ Error: docker compose is not available"
    echo ""
    echo "📦 Witral requires Docker Compose. Please install it:"
    echo ""
    echo "   • Docker Compose is usually included with Docker Desktop"
    echo "   • For Linux, install: docker-compose-plugin or docker-compose"
    echo "   • See: https://docs.docker.com/compose/install/"
    echo ""
    exit 1
fi

# Use docker-compose if docker compose is not available
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_DIR"

# Check if forcing background mode
FORCE_BG=false
if [[ "$1" == "--bg" ]] || [[ "$1" == "-d" ]] || [[ "$1" == "--detach" ]]; then
    FORCE_BG=true
fi

# Check if wizard is completed
WIZARD_COMPLETED=false
if [ -f "$WIZARD_FLAG" ]; then
    WIZARD_COMPLETED=true
fi

# Decision logic
if [ "$FORCE_BG" = true ]; then
    print_info "Force background mode requested"
    MODE="background"
elif [ "$WIZARD_COMPLETED" = false ]; then
    print_warning "Wizard not completed - running interactive setup..."
    print_info "You'll be able to:"
    echo "   • Scan QR code for WhatsApp connection"
    echo "   • Configure groups and tags"
    echo "   • Set up cloud sync"
    echo ""
    print_info "After setup completes, the script will automatically start the service in background mode (24/7)."
    MODE="interactive"
else
    print_success "Wizard already completed - starting in background mode"
    MODE="background"
fi

# Stop any existing containers first (but preserve data)
print_info "Checking for existing containers..."
if $COMPOSE_CMD ps -q witral 2>/dev/null | grep -q .; then
    print_info "Stopping existing containers..."
    $COMPOSE_CMD stop witral 2>/dev/null || true
fi

# Execute based on mode
if [ "$MODE" = "interactive" ]; then
    print_info "Starting interactive wizard..."
    echo ""
    
    # Run interactively with service ports for OAuth callbacks
    # Note: --rm removes container when it exits (which is expected after wizard)
    # Set WITRAL_SETUP_MODE to indicate we're in setup mode (CLI won't show after wizard)
    # Use -e to pass environment variable to the container
    $COMPOSE_CMD run -e WITRAL_SETUP_MODE=true --service-ports --rm --build witral
    
    # Capture exit code from wizard run
    WIZARD_EXIT_CODE=$?
    
    # After wizard container exits (automatically in setup mode, or manually if user exits)
    # Check if wizard was completed successfully
    if [ -f "$WIZARD_FLAG" ]; then
        echo ""
        print_success "Wizard completed successfully!"
        
        # The run container has exited (--rm removed it automatically)
        # Now start a persistent background container using the same data volumes
        # This preserves all wizard configuration (groups, tags, session, OAuth tokens)
        print_info "Starting service in background mode (24/7)..."
        echo ""
        
        # Ensure any leftover containers are cleaned up
        $COMPOSE_CMD down 2>/dev/null || true
        
        # Start persistent container in background
        # Uses same volumes, so all data from wizard is preserved
        $COMPOSE_CMD up -d --build witral
        
        # Wait a moment for container to start
        sleep 3
        
        # Show status
        echo ""
        print_info "Service status:"
        $COMPOSE_CMD ps witral
        
        echo ""
        print_success "Witral is now running in background (24/7 mode)"
        echo ""
        print_info "The service will:"
        echo "  • Continue running even after you close SSH"
        echo "  • Automatically reconnect on container restart"
        echo "  • Preserve all configuration (groups, tags, WhatsApp session, OAuth tokens)"
        echo ""
        print_info "Useful commands:"
        echo "  Access CLI:       docker exec -it witral node dist/index.js"
        echo "  View logs:        $COMPOSE_CMD logs -f witral"
        echo "  Stop service:     $COMPOSE_CMD down"
        echo "  Restart service:  $COMPOSE_CMD restart witral"
        echo "  View status:      $COMPOSE_CMD ps witral"
    else
        if [ $WIZARD_EXIT_CODE -eq 130 ] || [ $WIZARD_EXIT_CODE -eq 2 ]; then
            # SIGINT (Ctrl+C) - user may have exited early
            print_warning "Wizard was interrupted (Ctrl+C)."
            if [ -f "$WIZARD_FLAG" ]; then
                print_info "However, wizard appears to be completed. Starting in background..."
                $COMPOSE_CMD up -d --build witral
                sleep 2
                $COMPOSE_CMD ps witral
            else
                print_info "To complete setup, run: ./scripts/start.sh"
            fi
        else
            print_warning "Wizard may not have completed. Exit code: $WIZARD_EXIT_CODE"
            print_info "To retry setup, run: ./scripts/start.sh"
        fi
        exit $WIZARD_EXIT_CODE
    fi
else
    # Background mode
    print_info "Building and starting Witral in background..."
    $COMPOSE_CMD up -d --build witral
    
    # Wait for container to start
    sleep 3
    
    # Show status
    echo ""
    print_info "Service status:"
    $COMPOSE_CMD ps witral
    
    echo ""
    print_success "Witral is running in background (24/7 mode)"
    echo ""
    print_info "Useful commands:"
    echo "  Access CLI:       docker exec -it witral node dist/index.js"
    echo "  View logs:        $COMPOSE_CMD logs -f witral"
    echo "  Stop service:     $COMPOSE_CMD down"
    echo "  Restart service:  $COMPOSE_CMD restart witral"
    echo "  View status:      $COMPOSE_CMD ps witral"
fi
