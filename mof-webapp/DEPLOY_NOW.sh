#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║    Ministry of Finance - Ready to Deploy (Issues Fixed)       ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd /home/ricox/mof/mof-webapp

echo "✅ Fixes Applied:"
echo "   • Trading 212: Changed to version 0.1.6"
echo "   • Frontend Docker: Changed npm ci to npm install"
echo ""

echo "📋 Prerequisites Check:"
echo ""

# Check Docker
if command -v docker &> /dev/null; then
    echo "   ✓ Docker is installed"
else
    echo "   ✗ Docker is NOT installed"
    exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    echo "   ✓ Docker Compose v2 is available"
elif command -v docker-compose &> /dev/null; then
    echo "   ✓ Docker Compose v1 is available"
else
    echo "   ✗ Docker Compose is NOT installed"
    exit 1
fi

# Check if .env exists
if [ -f "backend/.env" ]; then
    echo "   ✓ backend/.env exists"
else
    echo "   ⚠ backend/.env not found (will use defaults)"
fi

echo ""
echo "🚀 Deployment Steps:"
echo ""

echo "Step 1: Building containers..."
docker compose build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Check errors above."
    exit 1
fi

echo ""
echo "Step 2: Starting services..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start services. Check errors above."
    exit 1
fi

echo ""
echo "Step 3: Waiting for services to be ready..."
sleep 15

echo ""
echo "Step 4: Checking service status..."
docker compose ps

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ DEPLOYMENT COMPLETE                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Access Points:"
echo "   • Frontend:  http://localhost:3000"
echo "   • Backend:   http://localhost:8000"
echo "   • API Docs:  http://localhost:8000/docs"
echo ""
echo "📝 Next Steps:"
echo "   1. Initialize database:"
echo "      docker compose exec backend python init_db.py"
echo ""
echo "   2. Configure API credentials:"
echo "      nano backend/.env"
echo "      # Add your Plaid, GoCardless, IBKR, Trading212 credentials"
echo ""
echo "   3. Restart backend after config:"
echo "      docker compose restart backend"
echo ""
echo "   4. Test the API:"
echo "      curl http://localhost:8000/health"
echo ""
echo "   5. View logs:"
echo "      docker compose logs -f"
echo ""
echo "Built for Daixu's family budget management 💰"
echo "════════════════════════════════════════════════════════════════"
