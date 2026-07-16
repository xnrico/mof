#!/bin/bash

# Ministry of Finance - Setup Script
# This script sets up the development environment

set -e

echo "🏦 Ministry of Finance - Setup Script"
echo "======================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# Create .env file if it doesn't exist
if [ ! -f backend/.env ]; then
    echo -e "${BLUE}📝 Creating backend/.env file...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✓ Created backend/.env - Please edit with your API credentials${NC}"
else
    echo -e "${GREEN}✓ backend/.env already exists${NC}"
fi

# Create data directory
mkdir -p backend/data
echo -e "${GREEN}✓ Created data directory${NC}"

# Build and start containers
echo -e "${BLUE}🐳 Building Docker containers...${NC}"
docker-compose build

echo -e "${BLUE}🚀 Starting services...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Services are running${NC}"
    echo ""
    echo -e "${GREEN}======================================"
    echo "✅ Setup Complete!"
    echo "======================================"
    echo ""
    echo "Access the application:"
    echo "  Frontend:  http://localhost:3000"
    echo "  Backend:   http://localhost:8000"
    echo "  API Docs:  http://localhost:8000/docs"
    echo ""
    echo "Next steps:"
    echo "  1. Edit backend/.env with your API credentials"
    echo "  2. Restart services: docker-compose restart backend"
    echo "  3. Access http://localhost:3000 to start using the app"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose logs -f"
    echo "  Stop:         docker-compose down"
    echo "  Restart:      docker-compose restart"
    echo -e "${NC}"
else
    echo -e "${RED}❌ Some services failed to start. Check logs with: docker-compose logs${NC}"
    exit 1
fi
