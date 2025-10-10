# Combined Architecture for Render Free Tier

## The Problem

Render's free tier doesn't support:
- ❌ Private networking between services
- ❌ Multiple ports per service
- ❌ Internal service communication

This broke our 3-service architecture (Backend, Mountebank, Proxy).

## The Solution: Combined Architecture

Run **Mountebank inside the Backend container** so they communicate via localhost.

---

## New Architecture

### Services (2 instead of 3):

```
Service 1: Backend + Mountebank (Combined)
  ├─ Mountebank runs on localhost:2525 (internal)
  ├─ Backend Node.js app runs on port 10000 (public)
  ├─ Backend forwards mock requests to localhost:4000 (Mountebank imposter)
  └─ Exposes: UI at / and mock API at /mock/*

Service 2: Proxy (Optional)
  └─ Forwards all requests to Backend's /mock/* endpoint
```

### Request Flow:

```
1. User calls: https://mockapi-proxy.onrender.com/test
                    ↓
2. Proxy forwards to: https://mockapi-backend.onrender.com/mock/test
                    ↓
3. Backend forwards to: localhost:4000/test (Mountebank imposter)
                    ↓
4. Mountebank matches stub, returns mock response
                    ↓
5. Response flows back to user
```

**Key:** Everything communicates via public HTTPS URLs (no internal networking needed!)

---

## Files Created

### 1. **Dockerfile.combined**
- Installs Mountebank globally
- Installs Node.js dependencies
- Runs both Mountebank and Backend in same container
- Startup script starts Mountebank first, then Backend

### 2. **server.js** (Updated)
- Added `/mock/*` route that forwards to local Mountebank
- Backend now acts as both management UI and mock API gateway

### 3. **ReverseProxy.render-combined.js**
- Simple proxy that forwards to backend's public URL
- Prepends `/mock` to all requests

### 4. **docker-compose.combined.yml**
- For testing the combined architecture locally
- Mimics how it works on Render

### 5. **render.yaml** (Updated)
- Backend uses `Dockerfile.combined`
- Only 2 services defined
- Uses public URLs for communication

---

## How It Works

### Backend Container Startup:

```bash
1. Start Mountebank: mb --allowInjection --port 2525 &
2. Wait 3 seconds for Mountebank to initialize
3. Start Backend: node server.js
4. Backend creates imposters in localhost:2525
5. Backend listens on port 10000 for:
   - / → UI
   - /api/* → Management API
   - /mock/* → Forwards to localhost:4000 (Mountebank imposter)
```

### Creating a Mock:

```
1. User opens: https://mockapi-backend.onrender.com
2. Creates mock "test" via UI
3. Backend calls: POST localhost:2525/imposters
4. Mountebank creates imposter on localhost:4000
5. User can now call: https://mockapi-proxy.onrender.com/test
6. Proxy forwards to: https://mockapi-backend.onrender.com/mock/test
7. Backend forwards to: localhost:4000/test
8. Mountebank returns mock response
```

---

## Deployment Steps

### Step 1: Test Locally (Optional)

```bash
# Test combined architecture
docker-compose -f docker-compose.combined.yml up --build

# UI: http://localhost:3000
# Mock API: http://localhost:8080/YOUR_API_NAME
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Combined architecture for Render free tier"
git push origin main
```

### Step 3: Update Render Dashboard

The `render.yaml` will create/update services, but you need to manually:

1. **Go to mockapi-backend service**
   - Environment → Add `MONGODB_URI` (your MongoDB Atlas connection string)

2. **Go to mockapi-proxy service** 
   - Environment → Update `BACKEND_URL`:
     - Change from: `https://mockapi-backend.onrender.com`
     - To: Your actual backend URL (copy from backend service)

### Step 4: Wait for Deployment

Both services will build and deploy (5-10 minutes).

### Step 5: Test

```bash
# 1. Open UI
open https://mockapi-backend.onrender.com

# 2. Create test mock
API Name: test
Response Body: {"message": "Combined architecture works!"}

# 3. Test via proxy
curl -X POST https://mockapi-proxy.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"message": "Combined architecture works!"}
```

---

## Key Differences from V2

| Aspect | V2 (Separate Services) | Combined (Render Free) |
|--------|----------------------|------------------------|
| **Services** | 3 (Backend, Mountebank, Proxy) | 2 (Backend+MB, Proxy) |
| **Communication** | Internal networking | Public HTTPS URLs |
| **Mountebank Location** | Separate container | Inside backend container |
| **Backend Role** | Management only | Management + Mock gateway |
| **Works on Render Free** | ❌ No | ✅ Yes |

---

## Environment Variables

### Backend (mockapi-backend):

| Variable | Value | Purpose |
|----------|-------|---------|
| `PORT` | `10000` | Public port |
| `MONGODB_URI` | (your connection string) | Database |
| `MB_URL` | `http://localhost:2525` | Mountebank admin API |
| `MB_IMPOSTER_PORT` | `4000` | Mountebank imposter port |
| `BACKEND_PORT` | `10000` | Backend listening port |

### Proxy (mockapi-proxy):

| Variable | Value | Purpose |
|----------|-------|---------|
| `PORT` | `10000` | Public port |
| `BACKEND_URL` | `https://mockapi-backend.onrender.com` | Backend public URL |

---

## Expected Logs

### Backend Logs:
```
Starting Mountebank...
Waiting for Mountebank to start...
Starting Backend...
mountebank v2.x now taking orders
Backend server running on port 10000
MongoDB connected
info: [http:4000] Open for business...  ← Imposter created
Imposter updated on port 4000 with X stubs
```

### Proxy Logs:
```
Proxy listening on port 10000
Forwarding all requests to https://mockapi-backend.onrender.com/mock/*
Proxying POST /test to https://mockapi-backend.onrender.com/mock/test
```

---

## Troubleshooting

### "Mountebank not starting"

Check backend logs for:
```
Starting Mountebank...
mountebank v2.x now taking orders
```

If missing, the startup script might have failed. Check Dockerfile.combined.

### "502 Bad Gateway" when calling mock

1. Check backend logs for "Forwarding mock request"
2. Verify imposter was created: logs should show "Open for business"
3. Try calling directly: `https://mockapi-backend.onrender.com/mock/test`

### "Cannot connect to MongoDB"

Add `MONGODB_URI` environment variable in Render dashboard.

### Proxy can't reach backend

Update `BACKEND_URL` in proxy service to actual backend public URL.

---

## Benefits of Combined Architecture

✅ **Works on Render Free Tier** - No internal networking needed  
✅ **Simpler** - 2 services instead of 3  
✅ **Lower Memory** - One container instead of two  
✅ **Easier Debug** - All logs in one place  
✅ **Cost Effective** - $0/month on free tier

---

## Limitations

⚠️ **Public URLs** - Communication happens over public internet (slightly slower)  
⚠️ **Cold Starts** - Both Mountebank and Backend sleep together (30-60s wake time)  
⚠️ **Single Container** - If backend crashes, Mountebank also goes down

**For production**, consider:
- Upgrading to Render paid tier ($7/month with internal networking)
- OR switching to DigitalOcean/Fly.io where original architecture works

---

## Local Development

**Option 1:** Use combined setup (matches Render)
```bash
docker-compose -f docker-compose.combined.yml up
```

**Option 2:** Use original setup (separate services)
```bash
docker-compose up
```

Both work! Use combined to test Render deployment locally.

---

## Migration from Previous Versions

If you deployed V1 or V2 already:

1. **Delete old services** in Render dashboard
2. **Deploy combined architecture** via render.yaml
3. **Recreate mocks** via UI

Your MongoDB data is preserved (if using MongoDB Atlas).

---

## Summary

**Combined architecture solves Render free tier limitations by:**
- Running Mountebank inside Backend container (localhost communication)
- Using public HTTPS URLs for service-to-service calls
- Reducing from 3 services to 2 services

**Result:** Full functionality on Render's free tier! 🎉

---

**Next:** Follow deployment steps above and test your deployment!


