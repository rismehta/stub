# Local Development Setup

This guide explains how to run the Mock API platform locally using Docker Compose.

## Prerequisites

- Docker Desktop installed and running
- Git (to clone the repository)
- Port availability: 3000, 8080, 27017, 2525

---

## Quick Start

### Option 1: Standard Architecture (Recommended for Local Dev)

**Best for:** Local development with separate services for debugging

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Services Running:**
- **MongoDB**: `localhost:27017` - Database
- **Mountebank**: `localhost:2525` - Service virtualization (admin API)
- **Backend API**: `localhost:3000` - Mock management UI and API
- **Proxy**: `localhost:8080` - Mock API endpoint (use this in your app)

---

### Option 2: Combined Architecture (Matches Render)

**Best for:** Testing the exact same setup as production

```bash
# Start all services
docker-compose -f docker-compose.combined.yml up -d

# View logs
docker-compose -f docker-compose.combined.yml logs -f

# Stop all services
docker-compose -f docker-compose.combined.yml down
```

**Services Running:**
- **MongoDB**: `localhost:27017` - Database
- **Backend (with Mountebank inside)**: `localhost:3000` - Mock management + Mountebank
- **Proxy**: `localhost:8080` - Mock API endpoint

---

## Access Points

### 🎨 Mock Management UI
**URL:** http://localhost:3000

**Features:**
- Create new mocks
- Manage existing mocks (view, edit, delete)
- Set request body and header predicates
- Define response bodies and headers

### 🚀 Mock API Endpoint (Use in Your App)
**URL:** http://localhost:8080

**Example:**
```bash
# Create a mock in UI first with API name "users/login"
curl -X POST http://localhost:8080/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "secret"}'
```

### 🐘 MongoDB
**URL:** mongodb://localhost:27017/mock-api-db

**Connect via:**
- MongoDB Compass
- mongosh CLI
- Any MongoDB client

### 🔧 Mountebank Admin (Standard Architecture Only)
**URL:** http://localhost:2525

**Check imposters:**
```bash
# List all imposters
curl http://localhost:2525/imposters

# Get specific imposter details
curl http://localhost:2525/imposters/4000
```

---

## Development Workflow

### 1. Start Services

```bash
docker-compose up -d
```

### 2. Create Your First Mock

1. Open http://localhost:3000
2. Fill in the form:
   - **API Name**: `test/api`
   - **Response Body**: `{"message": "Hello World!"}`
3. Click **Save Mock**

### 3. Test Your Mock

```bash
curl -X POST http://localhost:8080/test/api \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{"message": "Hello World!"}
```

### 4. Use in Your Application

**Change your API base URL:**
```javascript
// Before
const API_BASE_URL = 'https://api.production.com';

// After (for local testing)
const API_BASE_URL = 'http://localhost:8080';
```

**All your API calls now use mocks!** No code changes needed.

---

## Advanced Examples

### Example 1: Mock with Body Predicate

**In UI:**
- **API Name**: `users/login`
- **Request Body Matching Criteria**:
  ```json
  {
    "username": "admin"
  }
  ```
- **Response Body**:
  ```json
  {
    "token": "admin-token-123",
    "role": "admin"
  }
  ```

**Test:**
```bash
# ✅ Matches (has username: admin)
curl -X POST http://localhost:8080/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "any"}'

# ❌ Doesn't match (different username)
curl -X POST http://localhost:8080/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "guest", "password": "any"}'
```

---

### Example 2: Mock with Header Predicate

**In UI:**
- **API Name**: `secure/data`
- **Request Headers Matching Criteria**:
  ```json
  {
    "authorization": "Bearer secret123"
  }
  ```
- **Response Body**:
  ```json
  {
    "data": "sensitive information"
  }
  ```

**Test:**
```bash
# ✅ Matches (has correct header)
curl -X POST http://localhost:8080/secure/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secret123" \
  -d '{}'

# ❌ Doesn't match (missing header)
curl -X POST http://localhost:8080/secure/data \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### Example 3: Combined Body + Header Matching

**In UI:**
- **API Name**: `admin/delete`
- **Request Body Matching Criteria**:
  ```json
  {
    "action": "delete"
  }
  ```
- **Request Headers Matching Criteria**:
  ```json
  {
    "x-api-key": "admin-key"
  }
  ```
- **Response Body**:
  ```json
  {
    "status": "deleted"
  }
  ```

**Test (BOTH must match):**
```bash
# ✅ Matches (has both body and header)
curl -X POST http://localhost:8080/admin/delete \
  -H "Content-Type: application/json" \
  -H "x-api-key: admin-key" \
  -d '{"action": "delete", "id": 123}'
```

---

## Debugging

### View Logs

**All services:**
```bash
docker-compose logs -f
```

**Specific service:**
```bash
docker-compose logs -f backend
docker-compose logs -f proxy
docker-compose logs -f mountebank
```

### Check Service Health

```bash
# Backend health
curl http://localhost:3000

# Proxy health
curl http://localhost:8080

# Mountebank health (standard architecture only)
curl http://localhost:2525
```

### Inspect Mountebank State

**Via Backend API (works in both architectures):**
```bash
curl http://localhost:3000/api/debug/imposters
```

**Direct to Mountebank (standard architecture only):**
```bash
curl http://localhost:2525/imposters/4000
```

### Reset Everything

```bash
# Stop and remove containers, volumes, networks
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build
```

---

## Troubleshooting

### Port Already in Use

**Error:** `bind: address already in use`

**Solution:**
```bash
# Check what's using the port
lsof -i :3000
lsof -i :8080

# Kill the process or change port in docker-compose.yml
```

### MongoDB Connection Error

**Error:** `MongoNetworkError: failed to connect`

**Solution:**
```bash
# Restart MongoDB
docker-compose restart mongo

# Check MongoDB logs
docker-compose logs mongo
```

### Mountebank Not Responding

**Standard Architecture:**
```bash
docker-compose restart mountebank
docker-compose logs mountebank
```

**Combined Architecture:**
```bash
# Mountebank runs inside backend container
docker-compose -f docker-compose.combined.yml restart backend
docker-compose -f docker-compose.combined.yml logs backend
```

### Mock Not Matching

1. **Check mock exists:**
   ```bash
   curl http://localhost:3000/api/mocks
   ```

2. **Check Mountebank stubs:**
   ```bash
   curl http://localhost:3000/api/debug/imposters
   ```

3. **Test direct to Mountebank:**
   ```bash
   curl -X POST http://localhost:3000/api/debug/testMock/your-api-name \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. **Check logs:**
   ```bash
   docker-compose logs -f backend
   ```

---

## Architecture Comparison

### Standard (docker-compose.yml)
```
┌──────────┐     ┌──────────┐     ┌────────────┐
│  Proxy   │────▶│ Backend  │────▶│ Mountebank │
│  :8080   │     │  :3000   │     │   :2525    │
└──────────┘     └──────────┘     └────────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ MongoDB  │
                 │  :27017  │
                 └──────────┘
```

**Pros:**
- Easier debugging (separate logs)
- Can inspect Mountebank directly
- Faster rebuild (no Mountebank in backend)

**Cons:**
- More containers to manage
- Different from production (Render)

---

### Combined (docker-compose.combined.yml)
```
┌──────────┐     ┌─────────────────────────┐
│  Proxy   │────▶│ Backend + Mountebank    │
│  :8080   │     │  :3000 (MB on :2525)    │
└──────────┘     └─────────────────────────┘
                           │
                           ▼
                     ┌──────────┐
                     │ MongoDB  │
                     │  :27017  │
                     └──────────┘
```

**Pros:**
- Identical to production (Render)
- Fewer containers
- Tests actual deployment setup

**Cons:**
- Single container logs (backend + MB)
- Can't access Mountebank admin directly from host

---

## Production Parity

The **combined architecture** (`docker-compose.combined.yml`) exactly matches the Render deployment:

| Component | Local Combined | Render |
|-----------|---------------|--------|
| Backend + MB | 1 container | 1 web service |
| Proxy | 1 container | 1 web service |
| MongoDB | 1 container | MongoDB Atlas |
| Mountebank Port | 2525 (internal) | 2525 (internal) |
| Backend Port | 3000 | 10000 |
| Proxy Port | 8080 | 10000 |

**Use this setup to:**
- Test before deploying to Render
- Debug production issues locally
- Ensure local/prod consistency

---

## Next Steps

1. ✅ Start services with `docker-compose up -d`
2. ✅ Open http://localhost:3000 and create mocks
3. ✅ Test mocks via http://localhost:8080
4. ✅ Switch your app's API base URL to `http://localhost:8080`
5. ✅ Develop without needing real backend!

**Happy mocking!** 🚀

