#!/bin/bash

# Aletheia Rebalance Oracle Runner
# This script runs the rebalance oracle to monitor and rebalance liquidity across chains

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORACLE_DIR="$SCRIPT_DIR/workflows/rebalance_oracle"

echo -e "${BLUE}🔄 Aletheia Rebalance Oracle Runner${NC}"
echo -e "${YELLOW}======================================${NC}"

# Check if oracle directory exists
if [ ! -d "$ORACLE_DIR" ]; then
    echo -e "${RED}❌ Error: Rebalance oracle directory not found at $ORACLE_DIR${NC}"
    exit 1
fi

# Change to oracle directory
cd "$ORACLE_DIR"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    bun install
fi

# Check if config exists
if [ ! -f "config.staging.json" ]; then
    echo -e "${RED}❌ Error: config.staging.json not found${NC}"
    echo -e "${YELLOW}Please ensure the configuration file exists before running the oracle.${NC}"
    exit 1
fi

# Check if secrets file exists
if [ ! -f "secrets.yaml" ]; then
    echo -e "${YELLOW}⚠️  Warning: secrets.yaml not found. The oracle may not function properly.${NC}"
fi

echo -e "${GREEN}🚀 Starting Rebalance Oracle...${NC}"
echo -e "${BLUE}📍 Working directory: $(pwd)${NC}"
echo -e "${BLUE}⚙️  Config: config.staging.json${NC}"
echo ""

# Run the oracle
case "${1:-start}" in
    "start"|"run")
        echo -e "${GREEN}▶️  Running rebalance oracle...${NC}"
        bun run start
        ;;
    "dev")
        echo -e "${GREEN}▶️  Running rebalance oracle in development mode (watch mode)...${NC}"
        bun run dev
        ;;
    "build")
        echo -e "${GREEN}🔨 Building rebalance oracle...${NC}"
        bun run build
        ;;
    "install")
        echo -e "${GREEN}📦 Installing dependencies...${NC}"
        bun install
        ;;
    "help"|"-h"|"--help")
        echo -e "${BLUE}Usage: $0 [command]${NC}"
        echo ""
        echo -e "${YELLOW}Commands:${NC}"
        echo -e "  start, run    Run the rebalance oracle (default)"
        echo -e "  dev           Run in development mode with file watching"
        echo -e "  build         Build the oracle for production"
        echo -e "  install       Install dependencies"
        echo -e "  help          Show this help message"
        echo ""
        echo -e "${YELLOW}Examples:${NC}"
        echo -e "  $0            # Run the oracle"
        echo -e "  $0 dev        # Run in development mode"
        echo -e "  $0 build      # Build for production"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo -e "${YELLOW}Use '$0 help' for available commands.${NC}"
        exit 1
        ;;
esac
