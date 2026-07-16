# Ministry of Finance - Automated Budget Tracker WebApp

Modern, automated budget tracking web application with multi-provider financial API integrations.

## Features

- 🏦 **Multi-Provider Support**: Plaid (US), GoCardless (UK), IBKR, Trading 212
- 👥 **Multi-User**: Support for family members with multiple accounts
- 🔄 **Automatic Sync**: Scheduled transaction syncing from financial APIs
- 📊 **Real-time Dashboard**: View balances, spending, and category breakdowns
- 💱 **Multi-Currency**: GBP and USD support with exchange rates
- 🐳 **Docker Ready**: Easy deployment with Docker Compose

## Architecture

### Backend
- **FastAPI**: High-performance async API
- **PostgreSQL**: Reliable data storage
- **SQLAlchemy 2.0**: Async ORM
- **APScheduler**: Background task scheduling

### Frontend
- **React 18**: Modern UI framework
- **TypeScript**: Type-safe development
- **TailwindCSS**: Utility-first styling
- **React Query**: Efficient data fetching

### Integrations
- **Plaid**: US bank accounts
- **GoCardless**: UK/EU bank accounts via Open Banking
- **Interactive Brokers**: US brokerage accounts
- **Trading 212**: UK brokerage accounts

## Quick Start

### Prerequisites
- Docker & Docker Compose
- API credentials for your financial providers

### Setup

1. **Clone and navigate to the webapp directory**
```bash
cd mof-webapp
```

2. **Configure environment variables**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API credentials
```

3. **Start the services**
```bash
docker-compose up -d
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Initial Setup

1. **Create users** (Babu, Mamu, etc.)
2. **Add accounts** for each user
3. **Configure integrations** with API credentials
4. **Trigger initial sync** to pull transactions

## API Credentials Setup

### Plaid (US Banking)
1. Sign up at https://plaid.com
2. Get `client_id` and `secret` from dashboard
3. Use sandbox environment for testing
4. Link accounts using Plaid Link flow

### GoCardless (UK Banking)
1. Sign up at https://gocardless.com/bank-account-data/
2. Create requisition and get access token
3. Use sandbox for testing
4. Complete bank authorization flow

### Interactive Brokers
1. Install IB Gateway or TWS
2. Enable API access in settings
3. Configure host, port, and client ID
4. Ensure IB Gateway is running

### Trading 212
1. Get API key from Trading 212 settings
2. Use demo account for testing
3. Configure in integration settings

## Development

### Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Database Migrations
```bash
cd backend
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## Configuration

### Environment Variables

See `backend/.env.example` for all available configuration options:

- **Database**: PostgreSQL connection string
- **Security**: JWT secret key and algorithm
- **API Keys**: Credentials for each provider
- **Sync Schedule**: Cron expression for automatic syncing

### Sync Schedule

Default: Every 6 hours (`0 */6 * * *`)

Customize in `.env`:
```bash
SYNC_SCHEDULE=0 */4 * * *  # Every 4 hours
```

## API Documentation

Once running, visit http://localhost:8000/docs for interactive API documentation.

### Key Endpoints

- `POST /api/users` - Create user
- `POST /api/accounts` - Add account
- `POST /api/accounts/{id}/integration` - Configure integration
- `POST /api/sync/account/{id}` - Trigger account sync
- `GET /api/transactions` - List transactions
- `GET /api/transactions/summary/by-category` - Category breakdown

## Data Models

### User
- Family member with multiple accounts and income sources

### Account
- Financial account linked to a provider
- Tracks balance and sync status

### Transaction
- Financial transaction with automatic categorization
- Support for manual category overrides

### Integration Config
- Stores encrypted API credentials per account
- Tracks sync status and errors

## Security Notes

⚠️ **Important**: This is a development setup. For production:

1. **Encrypt credentials** in the database
2. **Use HTTPS** for all connections
3. **Set strong SECRET_KEY** in environment
4. **Configure CORS** properly for your domain
5. **Enable PostgreSQL SSL**
6. **Use secrets management** (e.g., AWS Secrets Manager)
7. **Regular security audits**

## Roadmap

### Phase 1 (Current)
- [x] Backend API structure
- [x] All provider integrations
- [x] Basic frontend UI
- [ ] Docker deployment testing
- [ ] Initial data sync verification

### Phase 2 (Next)
- [ ] Budget goals and alerts
- [ ] Recurring transaction detection
- [ ] Bill payment tracking
- [ ] Export to CSV/Excel
- [ ] Mobile-responsive improvements

### Phase 3 (Future)
- [ ] Machine learning categorization
- [ ] Spending predictions
- [ ] Investment portfolio tracking
- [ ] Tax reporting features
- [ ] Multi-language support

## Troubleshooting

### Connection Issues

**Plaid connection fails**
- Verify credentials are correct
- Check environment (sandbox/production)
- Ensure access token is valid

**GoCardless errors**
- Verify requisition is active
- Check access token hasn't expired
- Confirm bank authorization is complete

**IBKR not connecting**
- Ensure IB Gateway/TWS is running
- Verify port configuration (7497 for live, 7496 for paper)
- Check API settings are enabled

### Database Issues

**Migration errors**
```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
docker-compose exec backend alembic upgrade head
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

See LICENSE file for details.

## Support

For issues and questions, please open a GitHub issue.

---

Built for Daixu's family budget management 💰
