# Deploy Combined Architecture - Quick Guide

## ✅ What Was Done

Combined Backend + Mountebank into ONE container to work on Render free tier!

**Why:** Render free tier doesn't support internal networking between services.

**Solution:** Run Mountebank inside Backend container, communicate via localhost.

---

## 🚀 Deploy Now

### Step 1: Test Locally (Optional)

```bash
# Test the combined architecture
docker-compose -f docker-compose.combined.yml down -v
docker-compose -f docker-compose.combined.yml up --build

# UI: http://localhost:3000
# Create a mock and test: http://localhost:8080/YOUR_API_NAME
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Combined architecture for Render free tier"
git push origin main
```

### Step 3: Deploy to Render

**Render will auto-deploy** (if enabled) or manually trigger deployment.

**Services created:**
1. `mockapi-backend` - Backend + Mountebank combined
2. `mockapi-proxy` - Forwards to backend's /mock endpoint

### Step 4: Configure Environment Variables

#### Backend Service:
1. Go to `mockapi-backend` service in Render
2. Environment tab → Add/update:
   - `MONGODB_URI` = Your MongoDB Atlas connection string
   
#### Proxy Service:
1. Go to `mockapi-proxy` service in Render
2. Environment tab → Update:
   - `BACKEND_URL` = Your backend's actual public URL
   - Example: `https://mockapi-backend-abc123.onrender.com`

### Step 5: Wait for Deployment

Both services will build and deploy (5-10 minutes).

Watch logs to see:
- **Backend**: "Starting Mountebank..." → "mountebank v2.x now taking orders" → "Backend server running"
- **Proxy**: "Forwarding all requests to..."

### Step 6: Test Deployment

```bash
# 1. Open UI
open https://mockapi-backend.onrender.com

# 2. Create test mock
API Name: test
Response Body: {"message": "Works on Render!", "status": "success"}

# 3. Test API call
curl -X POST https://mockapi-proxy.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"message": "Works on Render!", "status": "success"}
```

---

## ✅ Success Criteria

- ✅ Backend UI loads
- ✅ Can create mocks via UI
- ✅ Proxy returns mock responses
- ✅ Backend logs show "mountebank now taking orders"
- ✅ No ENOTFOUND or networking errors

---

## 🎯 Your URLs

After deployment:

**UI (Create Mocks):**
```
https://mockapi-backend.onrender.com
```

**API (Call Mocks):**
```
https://mockapi-proxy.onrender.com/YOUR_API_NAME
```

---

## 🐛 Troubleshooting

### Backend won't start

**Check logs for:**
- "Starting Mountebank..."
- "mountebank v2.x now taking orders"

**If missing:**
- Dockerfile.combined might have issues
- Try "Clear build cache & deploy"

### "502 Bad Gateway"

**Proxy can't reach backend:**
1. Verify `BACKEND_URL` in proxy service
2. Should be backend's actual public URL
3. Must include `https://`

### Can't create mocks

**MongoDB connection issue:**
- Check `MONGODB_URI` is set in backend
- Verify MongoDB Atlas allows connections from 0.0.0.0/0

### Mountebank not responding

**Check backend logs:**
```
info: [http:4000] Open for business...
```

If missing, imposter wasn't created. Check `/api/reloadAllImposters`.

---

## 📊 Architecture Summary

```
┌─────────────────────────────────┐
│  Backend Container              │
│  ┌─────────────────────────┐   │
│  │  Mountebank (localhost) │   │
│  │  Port 2525 (admin)      │   │
│  │  Port 4000 (imposter)   │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │  Node.js Backend        │   │
│  │  Port 10000 (public)    │   │
│  │  - UI at /              │   │
│  │  - API at /api/*        │   │
│  │  - Mocks at /mock/*     │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
           ↑
           │ HTTPS (public)
           │
┌─────────────────────────────────┐
│  Proxy Container                │
│  Forwards to /mock/*            │
└─────────────────────────────────┘
```

**Key:** No internal networking needed! Everything via public HTTPS.

---

## 💰 Cost

**Render Free Tier:**
- 2 services × 750 hours/month = **$0**
- Services sleep after 15 minutes
- First request after sleep: 30-60 seconds

**MongoDB Atlas:**
- M0 Free tier = **$0**

**Total: $0/month** 🎉

---

## 📚 Documentation

- **Full Details**: `COMBINED_ARCHITECTURE.md`
- **Troubleshooting**: Check service logs in Render
- **Architecture V2**: Previous version (for reference)

---

## 🎯 Next Steps After Deployment

1. ✅ Create your production mocks
2. ✅ Share proxy URL with team
3. ✅ Test with real API calls
4. ✅ Monitor in Render dashboard

**If you need always-on (no cold starts):**
- Upgrade services to paid: $7/month × 2 = $14/month

---

**You're all set! Combined architecture is deployed! 🚀**


