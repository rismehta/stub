# Deploy V2 - Quick Checklist

## ✅ What Was Done

- ✅ Removed dynamic port allocation
- ✅ Single Mountebank imposter handles all mocks
- ✅ Simplified proxy forwards everything to one port
- ✅ Updated all configuration files
- ✅ Removed Counter model dependency
- ✅ Works on Render without networking issues

---

## 🚀 Deploy Now

### Step 1: Test Locally (Optional but Recommended)

```bash
# Clean start
docker-compose down -v

# Build and start
docker-compose up --build

# In another terminal, test
curl http://localhost:3000  # Should show UI

# Create a test mock via UI
# Then test it:
curl -X POST http://localhost:8080/YOUR_API_NAME -d '{}'
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Architecture V2: Single port design for cloud deployment"
git push origin main
```

### Step 3: Deploy to Render

**Option A: Automatic (if auto-deploy enabled)**
- Render will detect the push and redeploy automatically
- Wait 5-10 minutes for all services to be "Live"

**Option B: Manual**
1. Go to Render dashboard
2. For each service (mountebank, backend, proxy):
   - Click "Manual Deploy"
   - Click "Deploy latest commit"
3. Wait for all to show "Live"

### Step 4: Verify MongoDB Connection

```bash
# In Render dashboard, go to mockapi-backend
# Environment tab → Verify MONGODB_URI is set
# If not, add it now
```

### Step 5: Test on Render

```bash
# 1. Open UI
open https://mockapi-backend.onrender.com

# 2. Create test mock
API Name: test
Response Body: {"message": "V2 deployed!", "status": "success"}

# 3. Test API call
curl -X POST https://mockapi-proxy.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"message": "V2 deployed!", "status": "success"}
```

---

## 🎉 Success Criteria

✅ Backend UI loads  
✅ Can create mock via UI  
✅ Mock API responds via proxy  
✅ No ENOTFOUND errors in logs  
✅ Mountebank logs show "Open for business"

---

## 📊 Check Service Logs

### Mountebank Logs (mockapi-mountebank)
Expected:
```
mountebank v2.x now taking orders
info: [http:10000] Open for business...
```

### Backend Logs (mockapi-backend)
Expected:
```
Backend server running on port 10000
MongoDB connected
Reloading X mocks into single imposter
Imposter updated on port 10000 with X stubs
```

### Proxy Logs (mockapi-proxy)
Expected:
```
Simple reverse proxy listening on port 10000
Forwarding all requests to http://mockapi-mountebank:10000
Proxying POST /YOUR_API_NAME to http://mockapi-mountebank:10000
```

---

## 🐛 If Something Fails

### Backend won't start
- Check MongoDB connection string is correct
- Verify MONGODB_URI environment variable is set
- Check logs for specific error

### "Cannot find module ReverseProxy.simple.js"
- Verify file was pushed to GitHub
- Check Render pulled latest code
- Try "Clear build cache & deploy"

### API returns 404
- Check mock was created successfully
- Verify backend logs show "Imposter updated"
- Try calling reload endpoint manually:
  ```bash
  curl -X POST https://mockapi-backend.onrender.com/api/reloadAllImposters
  ```

### Mountebank errors
- Check Mountebank service is "Live"
- Verify it's listening on port 10000
- Check MB_URL environment variable in backend

---

## 📝 Post-Deployment

### Clean Up Old Data (if migrating from V1)

If you have old mocks with port fields, remove them:

```javascript
// Connect to your MongoDB
db.apimocks.updateMany({}, { $unset: { port: "" } })
```

Or just start fresh with new mocks!

---

## 🔄 Rollback Plan

If V2 has issues, rollback to V1:

```bash
git revert HEAD
git push origin main
```

Render will redeploy the previous version.

---

## 📚 Documentation

- **Architecture Details**: See `ARCHITECTURE_V2.md`
- **Render Setup**: See `RENDER_SETUP.md`
- **Troubleshooting**: See `RENDER_FIX.md`

---

## ✨ What's Better in V2

| Feature | V1 | V2 |
|---------|----|----|
| **Ports per Mock** | One per API (4000, 4001...) | One for all (2525 or 10000) |
| **Cloud Deployment** | Complex networking issues | Simple, just works |
| **Port Management** | MongoDB counter | Not needed |
| **Proxy Complexity** | Dynamic routing map | Simple forwarding |
| **Debugging** | Check multiple ports | Check one port |
| **Memory Usage** | Higher (many imposters) | Lower (one imposter) |

---

## 🎯 Next Steps After Deployment

1. ✅ Create your production mocks
2. ✅ Share proxy URL with your team
3. ✅ Integrate into test suites
4. ✅ Monitor performance in Render dashboard
5. ✅ Consider upgrading to paid tier if you need always-on ($7/month per service)

---

**You're all set! V2 is simpler, faster, and cloud-ready! 🚀**


