# Render Deployment Fix - Summary of Changes

## Problem
Render's web services only expose ONE port per service, but your architecture had:
- Proxy with 2 servers (port 8080 for proxy, port 3001 for control API)
- Backend couldn't reach proxy's control API on port 3001

## Solution
Merged the control API into the main proxy server on a single port.

## Changes Made

### 1. Created `ReverseProxy.render.js`
- Single HTTP server on port 10000
- Handles both proxy traffic AND control API (`/update-map`) on same port
- Render-compatible version of ReverseProxy.js

### 2. Updated `render.yaml`
- **All services now use port 10000** (Render's expected port)
- Proxy uses `ReverseProxy.render.js` instead of `ReverseProxy.js`
- Backend's `CONTROL_API_PORT` set to 10000 (same as proxy)
- All internal URLs updated to use port 10000

## Next Steps

### 1. Push Changes to GitHub
```bash
git add ReverseProxy.render.js render.yaml
git commit -m "Fix Render networking - merge proxy control API to single port"
git push origin main
```

### 2. Redeploy on Render
- Render will auto-deploy all 3 services
- Or manually trigger deployment

### 3. Add MongoDB Connection String
If you haven't already:
1. Go to `mockapi-backend` service in Render
2. Environment tab → Add variable:
   - Key: `MONGODB_URI`
   - Value: Your MongoDB Atlas connection string

### 4. Create Test Mock
1. Open: `https://mockapi-backend.onrender.com`
2. Fill form:
   - API Name: `test`
   - Response Body: `{"message": "It works!", "status": "success"}`
3. Click "Save Mock"
4. Should see success message

### 5. Test API Call
```bash
curl -X POST https://mockapi-proxy.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:
```json
{"message": "It works!", "status": "success"}
```

## What to Watch in Logs

### Backend Logs (mockapi-backend)
```
Backend server running on port 10000
MongoDB connected
Updated proxy map for API test: { host: 'mockapi-mountebank', port: XXXX }
```

### Proxy Logs (mockapi-proxy)
```
Reverse proxy and control API listening on port 10000
Proxy map updated: { test: { host: '...', port: ... } }
```

### Mountebank Logs (mockapi-mountebank)
```
mountebank v2.x now taking orders
[mb:10000] Imposters created
```

## If Still Getting Errors

### "Cannot POST /test"
- You haven't created the mock yet - use the UI first
- Check backend logs for "Updated proxy map"

### "API Not Found"
- Mock was created but proxy didn't receive the update
- Check proxy logs for "Proxy map updated"
- Verify backend can reach proxy (no ECONNREFUSED errors)

### "Bad Gateway"
- Backend can't reach Mountebank
- Check all services are "Live" in Render
- Verify Mountebank is running on port 10000

### "ENOTFOUND mockapi-mountebank"
- Services aren't on same private network
- Wait 2-3 minutes after deployment
- Check all services deployed from same Blueprint

## Architecture Summary

```
User Request → Proxy (port 10000)
                ↓
           Mountebank (port 10000)
                ↓
           Returns Mock Response

Backend (port 10000) → MongoDB Atlas
      ↓
Creates Imposters in Mountebank
      ↓
Updates Proxy via /update-map endpoint (same port 10000)
```

## Key Differences from Local Docker Setup

| Aspect | Local (Docker) | Render (Cloud) |
|--------|---------------|----------------|
| Proxy Server | 2 servers (8080, 3001) | 1 server (10000) |
| Mountebank Port | 2525 | 10000 |
| Backend Port | 3000 | 10000 |
| MongoDB | Local container | Atlas (external) |
| Networking | Docker bridge | Render private network |


