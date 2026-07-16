# Ministry of Finance - Deployment Guide

## 🚀 Quick Deployment (Docker Compose)

### Prerequisites
- Docker installed
- Docker Compose v2 (use `docker compose` instead of `docker-compose`)

### Step 1: Setup
```bash
cd /home/ricox/mof/mof-webapp

# Create environment file
cp backend/.env.example backend/.env

# Edit with your API credentials
nano backend/.env
```

### Step 2: Start Services

Using Docker Compose v2 (recommended):
```bash
docker compose up -d
```

Or if you have the older docker-compose:
```bash
docker-compose up -d
```

### Step 3: Check Status
```bash
docker compose ps

# Expected output:
# NAME              STATUS            PORTS
# mof-postgres      Up (healthy)      5432
# mof-backend       Up                8000
# mof-frontend      Up                3000, 80
```

### Step 4: Initialize Database
```bash
docker compose exec backend python init_db.py
```

Answer `y` when prompted to seed sample data.

### Step 5: Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## 🐳 Docker Commands Reference

### Starting & Stopping
```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart specific service
docker compose restart backend

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v
```

### Logs
```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f frontend
```

### Accessing Containers
```bash
# Backend shell
docker compose exec backend bash

# PostgreSQL shell
docker compose exec postgres psql -U mof -d mof

# Run Python commands
docker compose exec backend python -c "print('Hello')"
```

### Rebuilding
```bash
# Rebuild after code changes
docker compose build

# Rebuild and restart
docker compose up -d --build

# Rebuild specific service
docker compose build backend
```

---

## 🔧 Manual Deployment (Development)

### Backend Only
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://mof:mof@localhost:5432/mof"
export PLAID_CLIENT_ID="your_client_id"
# ... other variables

# Run server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Only
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### PostgreSQL Setup
```bash
# Install PostgreSQL
sudo apt-get install postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE mof;
CREATE USER mof WITH PASSWORD 'mof';
GRANT ALL PRIVILEGES ON DATABASE mof TO mof;
\q

# Update DATABASE_URL in .env
DATABASE_URL=postgresql+asyncpg://mof:mof@localhost:5432/mof
```

---

## 🔑 API Credentials Setup

### 1. Plaid (US Banking)

**Sign Up:**
1. Go to https://dashboard.plaid.com
2. Create account (free sandbox)
3. Get credentials from Keys page

**Configure:**
```bash
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox
```

**Test:**
```bash
curl -X POST http://localhost:8000/api/accounts/2/integration \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Plaid",
    "access_token": "access-sandbox-xxx",
    "item_id": "item-sandbox-xxx"
  }'
```

### 2. GoCardless (UK Banking)

**Sign Up:**
1. Go to https://bankaccountdata.gocardless.com
2. Create account
3. Create requisition in sandbox
4. Get access token

**Configure:**
```bash
GOCARDLESS_ACCESS_TOKEN=your_token_here
GOCARDLESS_ENV=sandbox
```

**Test:**
```bash
curl -X POST http://localhost:8000/api/accounts/1/integration \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GoCardless",
    "access_token": "your_token",
    "item_id": "requisition_id"
  }'
```

### 3. Interactive Brokers (US Brokerage)

**Setup:**
1. Download IB Gateway or TWS
2. Enable API in settings: Configure > API > Settings
3. Add trusted IP: 127.0.0.1
4. Set port: 7497 (live) or 7496 (paper)

**Configure:**
```bash
IBKR_ACCOUNT_ID=your_account_number
IBKR_HOST=127.0.0.1
IBKR_PORT=7497
IBKR_CLIENT_ID=1
```

**Run:**
Start IB Gateway before running backend.

### 4. Trading 212 (UK Brokerage)

**Setup:**
1. Login to Trading 212
2. Go to Settings > API (Beta)
3. Generate API key
4. Use demo account for testing

**Configure:**
```bash
TRADING212_API_KEY=your_api_key_here
TRADING212_ENV=demo
```

---

## 🧪 Testing the Deployment

### Health Check
```bash
# Backend health
curl http://localhost:8000/health
# Expected: {"status":"healthy"}

# Frontend (should return HTML)
curl http://localhost:3000
```

### API Tests
```bash
# Create user
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# List users
curl http://localhost:8000/api/users

# List accounts
curl http://localhost:8000/api/accounts

# Get transactions
curl http://localhost:8000/api/transactions
```

### Database Check
```bash
docker compose exec postgres psql -U mof -d mof -c "\dt"

# Expected tables:
# - users
# - accounts
# - transactions
# - integration_configs
# - income_sources
# - exchange_rates
```

---

## 🔍 Troubleshooting

### Services Won't Start

**Check Docker status:**
```bash
docker ps -a
docker compose logs
```

**Common issues:**
- Port already in use: Change ports in docker-compose.yml
- Docker daemon not running: `sudo systemctl start docker`
- Permission denied: Add user to docker group

### Database Connection Errors

**Check PostgreSQL:**
```bash
docker compose exec postgres pg_isready -U mof
```

**Reset database:**
```bash
docker compose down -v
docker compose up -d postgres
docker compose exec backend python init_db.py
```

### Backend API Not Responding

**Check logs:**
```bash
docker compose logs -f backend
```

**Common issues:**
- Missing dependencies: Rebuild container
- Database not ready: Wait for health check
- Port conflict: Check if 8000 is in use

### Frontend Can't Reach Backend

**Check proxy configuration:**
```bash
# In frontend/vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:8000'
  }
}
```

**Test backend directly:**
```bash
curl http://localhost:8000/health
```

### API Integration Failures

**Check credentials:**
```bash
docker compose exec backend cat .env
```

**Test connectivity:**
```bash
# For Plaid
curl https://sandbox.plaid.com/institutions/get

# For GoCardless
curl https://ob.nordigen.com/api/v2/institutions/
```

**View integration status:**
```bash
curl http://localhost:8000/api/sync/status/1
```

---

## 📊 Monitoring

### Check Resource Usage
```bash
docker stats

# Expected usage:
# - postgres: ~50-100MB
# - backend: ~100-200MB
# - frontend: ~20-50MB
```

### Database Size
```bash
docker compose exec postgres psql -U mof -d mof -c "
SELECT pg_size_pretty(pg_database_size('mof'));
"
```

### Transaction Count
```bash
curl http://localhost:8000/api/transactions | jq 'length'
```

---

## 🔐 Production Checklist

Before deploying to production:

- [ ] Change SECRET_KEY to strong random value
- [ ] Use production API credentials (not sandbox)
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS origins
- [ ] Enable PostgreSQL SSL
- [ ] Implement authentication (JWT)
- [ ] Add rate limiting
- [ ] Set up backups
- [ ] Configure monitoring/alerting
- [ ] Enable audit logging
- [ ] Review security best practices
- [ ] Set up CI/CD pipeline
- [ ] Configure domain and DNS
- [ ] Add SSL certificate (Let's Encrypt)
- [ ] Set resource limits (Docker)

---

## 🔄 Updates & Maintenance

### Update Code
```bash
cd /home/ricox/mof/mof-webapp
git pull  # if using version control
docker compose down
docker compose build
docker compose up -d
```

### Backup Database
```bash
docker compose exec postgres pg_dump -U mof mof > backup.sql

# Restore
docker compose exec -T postgres psql -U mof mof < backup.sql
```

### View Running Services
```bash
docker compose ps
docker compose top
```

---

## 📞 Support

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Review TEST_PLAN.md for test cases
3. Check FRAMEWORK_SUMMARY.md for architecture
4. See README.md for detailed documentation

---

*Last Updated: July 16, 2026*
