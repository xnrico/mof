# Ministry of Finance - Phase 1 Testing Plan

## Test Environment Setup

### 1. Start Services
```bash
cd /home/ricox/mof/mof-webapp
./setup.sh
```

Expected output:
- ✓ Docker and Docker Compose are installed
- ✓ Created backend/.env
- ✓ Services are running
- Access URLs displayed

### 2. Verify Services
```bash
# Check all containers are up
docker-compose ps

# Should show:
# mof-postgres   Up (healthy)
# mof-backend    Up
# mof-frontend   Up
```

### 3. Initialize Database
```bash
docker-compose exec backend python init_db.py
```

Expected:
- Tables created
- Sample users created (Babu, Mamu)
- Sample accounts created
- Income sources added

## API Integration Tests

### Test 1: Plaid (US Banking)

**Setup:**
1. Get sandbox credentials from https://dashboard.plaid.com
2. Add to `backend/.env`:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   ```
3. Restart: `docker-compose restart backend`

**Test Steps:**
```bash
# 1. Configure Plaid integration for account
curl -X POST "http://localhost:8000/api/accounts/2/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Plaid",
    "access_token": "access-sandbox-xxx",
    "item_id": "item-sandbox-xxx",
    "config_data": "{}"
  }'

# 2. Trigger sync
curl -X POST "http://localhost:8000/api/sync/account/2"

# 3. Check transactions
curl "http://localhost:8000/api/transactions?account_id=2"
```

**Expected Results:**
- ✓ Integration configured successfully
- ✓ Sync completes with transactions_added > 0
- ✓ Transactions visible in API response

### Test 2: GoCardless (UK Banking)

**Setup:**
1. Sign up at https://bankaccountdata.gocardless.com
2. Create requisition in sandbox
3. Add to `backend/.env`:
   ```
   GOCARDLESS_ACCESS_TOKEN=your_token
   GOCARDLESS_ENV=sandbox
   ```

**Test Steps:**
```bash
# Configure integration
curl -X POST "http://localhost:8000/api/accounts/1/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GoCardless",
    "access_token": "your_access_token",
    "item_id": "your_requisition_id"
  }'

# Sync and check
curl -X POST "http://localhost:8000/api/sync/account/1"
curl "http://localhost:8000/api/transactions?account_id=1"
```

### Test 3: IBKR (US Brokerage)

**Setup:**
1. Install IB Gateway or TWS
2. Enable API in settings
3. Start Gateway on port 7497
4. Add to `backend/.env`:
   ```
   IBKR_ACCOUNT_ID=your_account
   IBKR_HOST=127.0.0.1
   IBKR_PORT=7497
   ```

**Test Steps:**
```bash
# Note: IBKR requires Gateway to be running
# Configure integration
curl -X POST "http://localhost:8000/api/accounts/3/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "IBKR",
    "config_data": "{\"account_id\": \"your_account\"}"
  }'

# Sync
curl -X POST "http://localhost:8000/api/sync/account/3"
```

### Test 4: Trading 212 (UK Brokerage)

**Setup:**
1. Get demo API key from Trading 212 settings
2. Add to `backend/.env`:
   ```
   TRADING212_API_KEY=your_demo_key
   TRADING212_ENV=demo
   ```

**Test Steps:**
```bash
# Configure
curl -X POST "http://localhost:8000/api/accounts/5/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Trading212",
    "access_token": "your_api_key"
  }'

# Sync
curl -X POST "http://localhost:8000/api/sync/account/5"
```

## Functional Tests

### Test 5: User Management
```bash
# Create user
curl -X POST "http://localhost:8000/api/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}'

# List users
curl "http://localhost:8000/api/users"

# Add income
curl -X POST "http://localhost:8000/api/users/1/income" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Salary",
    "amount": 5000,
    "currency": "GBP",
    "frequency": "monthly"
  }'
```

### Test 6: Account Management
```bash
# Create account
curl -X POST "http://localhost:8000/api/accounts" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "name": "Test Account",
    "account_type": "Checking",
    "currency": "GBP",
    "provider": "Manual"
  }'

# List accounts
curl "http://localhost:8000/api/accounts"

# Filter by user
curl "http://localhost:8000/api/accounts?user_id=1"
```

### Test 7: Transaction Queries
```bash
# List all transactions
curl "http://localhost:8000/api/transactions"

# Filter by account
curl "http://localhost:8000/api/transactions?account_id=1"

# Filter by date range
curl "http://localhost:8000/api/transactions?start_date=2024-01-01&end_date=2024-12-31"

# Filter by category
curl "http://localhost:8000/api/transactions?category=Food"

# Get category summary
curl "http://localhost:8000/api/transactions/summary/by-category?user_id=1&currency=GBP"
```

### Test 8: Transaction Updates
```bash
# Update transaction category
curl -X PATCH "http://localhost:8000/api/transactions/1" \
  -H "Content-Type: application/json" \
  -d '{
    "category_override": "Food",
    "notes": "Grocery shopping"
  }'

# Hide transaction
curl -X PATCH "http://localhost:8000/api/transactions/1" \
  -H "Content-Type: application/json" \
  -d '{"is_hidden": true}'
```

### Test 9: Sync Status
```bash
# Check sync status
curl "http://localhost:8000/api/sync/status/1"

# Sync all accounts
curl -X POST "http://localhost:8000/api/sync/all"
```

## Frontend Tests

### Test 10: Frontend Access
1. Open http://localhost:3000
2. Verify page loads
3. Check navigation works
4. Verify API calls to backend

### Test 11: API Documentation
1. Open http://localhost:8000/docs
2. Verify all endpoints are listed
3. Test "Try it out" functionality
4. Verify schemas are correct

## Performance Tests

### Test 12: Bulk Sync
```bash
# Time sync for all accounts
time curl -X POST "http://localhost:8000/api/sync/all"
```

Expected: < 30 seconds for 5 accounts with sandbox data

### Test 13: Transaction Queries
```bash
# Test pagination
curl "http://localhost:8000/api/transactions?limit=100&offset=0"
curl "http://localhost:8000/api/transactions?limit=100&offset=100"
```

Expected: < 1 second per query

## Integration Tests

### Test 14: End-to-End Flow
1. Create user
2. Create account
3. Configure integration
4. Trigger sync
5. Query transactions
6. Update transaction category
7. Get category summary
8. Verify total matches

## Error Handling Tests

### Test 15: Invalid Credentials
```bash
# Test with invalid API key
curl -X POST "http://localhost:8000/api/accounts/1/integration" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "Plaid",
    "access_token": "invalid_token"
  }'

# Try to sync
curl -X POST "http://localhost:8000/api/sync/account/1"

# Check error status
curl "http://localhost:8000/api/sync/status/1"
```

Expected: Error logged, sync_status = "failed"

### Test 16: Missing Configuration
```bash
# Try to sync account without integration
curl -X POST "http://localhost:8000/api/sync/account/1"
```

Expected: Error message about missing configuration

## Success Criteria

Phase 1 testing passes when:

- [ ] All services start successfully
- [ ] Database initializes without errors
- [ ] At least 2 API integrations authenticate successfully
- [ ] At least 1 account syncs transactions (>0 transactions)
- [ ] All CRUD operations work (Create, Read, Update, Delete)
- [ ] Category summary calculates correctly
- [ ] Frontend loads and displays data
- [ ] API documentation is accessible and accurate
- [ ] Error handling works correctly
- [ ] No memory leaks or crashes during testing

## Test Results Log

```
Date: ___________
Tester: ___________

Service Startup:         [ ] PASS [ ] FAIL
Database Init:           [ ] PASS [ ] FAIL
Plaid Integration:       [ ] PASS [ ] FAIL [ ] SKIP
GoCardless Integration:  [ ] PASS [ ] FAIL [ ] SKIP
IBKR Integration:        [ ] PASS [ ] FAIL [ ] SKIP
Trading212 Integration:  [ ] PASS [ ] FAIL [ ] SKIP
User Management:         [ ] PASS [ ] FAIL
Account Management:      [ ] PASS [ ] FAIL
Transaction Queries:     [ ] PASS [ ] FAIL
Transaction Updates:     [ ] PASS [ ] FAIL
Sync Operations:         [ ] PASS [ ] FAIL
Frontend Access:         [ ] PASS [ ] FAIL
API Documentation:       [ ] PASS [ ] FAIL
Performance:             [ ] PASS [ ] FAIL
Error Handling:          [ ] PASS [ ] FAIL

Overall Result: [ ] PASS [ ] FAIL

Notes:
___________________________________________
___________________________________________
___________________________________________
```
