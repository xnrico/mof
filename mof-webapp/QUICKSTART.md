# Quick Start Guide

## Prerequisites
- Docker & Docker Compose installed
- API credentials for your financial providers

## Setup in 3 Steps

### 1. Run Setup Script
```bash
cd /home/ricox/mof/mof-webapp
./setup.sh
```

This will:
- Create the `.env` file from template
- Build Docker containers
- Start all services (PostgreSQL, Backend, Frontend)

### 2. Configure API Credentials

Edit `backend/.env` with your actual API credentials:
```bash
nano backend/.env
```

Add your credentials for:
- **Plaid**: `PLAID_CLIENT_ID`, `PLAID_SECRET`
- **GoCardless**: `GOCARDLESS_ACCESS_TOKEN`
- **IBKR**: `IBKR_ACCOUNT_ID`, `IBKR_HOST`, `IBKR_PORT`
- **Trading 212**: `TRADING212_API_KEY`

### 3. Initialize Database

```bash
# Enter backend container
docker-compose exec backend bash

# Run database initialization
python init_db.py
```

This creates:
- Database tables
- Sample users (Babu, Mamu)
- Sample accounts for each provider
- Income sources

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Configure Integrations

### Via API (Recommended)

Use the API documentation at http://localhost:8000/docs

1. Create users: `POST /api/users`
2. Create accounts: `POST /api/accounts`
3. Configure integrations: `POST /api/accounts/{id}/integration`
4. Sync transactions: `POST /api/sync/account/{id}`

### Example: Configure Plaid Integration

```bash
curl -X POST "http://localhost:8000/api/accounts/1/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Plaid",
    "access_token": "your-plaid-access-token",
    "item_id": "your-plaid-item-id",
    "config_data": "{\"client_id\": \"your_client_id\", \"secret\": \"your_secret\"}"
  }'
```

### Example: Sync Account

```bash
curl -X POST "http://localhost:8000/api/sync/account/1"
```

## Common Commands

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild containers
docker-compose build
docker-compose up -d
```

## Development Mode

### Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Troubleshooting

### Services won't start
```bash
docker-compose down
docker-compose up -d
docker-compose logs
```

### Database connection errors
```bash
# Check if PostgreSQL is ready
docker-compose exec postgres pg_isready -U mof

# Restart PostgreSQL
docker-compose restart postgres
```

### Frontend can't reach backend
- Check backend is running: `curl http://localhost:8000/health`
- Check CORS settings in `backend/main.py`
- Verify proxy settings in `frontend/vite.config.ts`

## Testing API Integrations

### Test Plaid (Sandbox)
- Use sandbox credentials
- Test with Plaid's test accounts
- See: https://plaid.com/docs/sandbox/

### Test GoCardless (Sandbox)
- Create sandbox requisition
- Use test bank credentials
- See: https://developer.gocardless.com/bank-account-data/testing

### Test IBKR
- Install IB Gateway or TWS
- Enable API connections in settings
- Use paper trading account for testing

### Test Trading 212
- Use demo account
- Get API key from account settings
- Test with demo funds

## Next Steps

1. **Configure all your accounts** with real or test credentials
2. **Run initial sync** to pull transactions
3. **Set up sync schedule** (default: every 6 hours)
4. **Customize categories** in `backend/models/models.py`
5. **Add budgets and goals** (Phase 2 feature)

## Support

For issues:
- Check logs: `docker-compose logs`
- Review API docs: http://localhost:8000/docs
- See README.md for detailed documentation
