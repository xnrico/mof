#!/bin/bash

echo "🔧 Rebuilding Ministry of Finance with fixes..."
echo ""

cd /home/ricox/mof/mof-webapp

echo "1. Stopping existing containers..."
docker compose down

echo ""
echo "2. Rebuilding containers with fixes..."
docker compose build

echo ""
echo "3. Starting services..."
docker compose up -d

echo ""
echo "4. Waiting for services to be ready..."
sleep 10

echo ""
echo "5. Checking service status..."
docker compose ps

echo ""
echo "✅ Rebuild complete!"
echo ""
echo "Next steps:"
echo "  - Initialize database: docker compose exec backend python init_db.py"
echo "  - Check logs: docker compose logs -f"
echo "  - Access frontend: http://localhost:3000"
echo "  - Access API: http://localhost:8000/docs"
