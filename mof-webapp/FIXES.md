# Ministry of Finance - Issue Fixes

## Issues Fixed

### 1. Trading 212 Package Version
**Problem:** `trading212==0.2.1` not available
**Solution:** Changed to `trading212==0.1.6` in `backend/requirements.txt`

### 2. Frontend Docker Build - Missing package-lock.json
**Problem:** `npm ci` requires package-lock.json
**Solution:** Changed Dockerfile to use `npm install` instead of `npm ci`

## Files Modified

1. `backend/requirements.txt` - Updated trading212 version
2. `frontend/Dockerfile` - Changed npm ci to npm install

## Rebuild Instructions

```bash
cd /home/ricox/mof/mof-webapp

# Rebuild containers
docker compose build

# Start services
docker compose up -d

# Check status
docker compose ps

# Initialize database
docker compose exec backend python init_db.py
```

## Alternative: Generate package-lock.json

If you prefer to use `npm ci` (faster, more reliable):

```bash
cd frontend
npm install
# This generates package-lock.json

# Then rebuild
docker compose build frontend
docker compose up -d
```

## Verify Fix

```bash
# Check backend requirements
grep trading212 backend/requirements.txt
# Should show: trading212==0.1.6

# Check frontend Dockerfile
grep "npm install" frontend/Dockerfile
# Should show: RUN npm install
```

---

*Fixed: July 16, 2026*
