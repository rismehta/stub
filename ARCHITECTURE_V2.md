# Architecture V2 - Single Port, Simplified Design

## Summary of Changes

We've refactored the application to remove dynamic port allocation. This makes deployment on cloud platforms (like Render) much simpler and more reliable.

---

## What Changed?

### **Before (V1):**
```
Mock API "users"  → Mountebank Imposter on port 4000
Mock API "orders" → Mountebank Imposter on port 4001  
Mock API "test10" → Mountebank Imposter on port 4003
...

Proxy maintains a map: {users: 4000, orders: 4001, test10: 4003}
Proxy routes requests to different ports
```

### **After (V2):**
```
All Mock APIs → Single Mountebank Imposter on one port (2525 local, 10000 Render)
  ├─ Stub 1: path contains "/users" → response A
  ├─ Stub 2: path contains "/orders" → response B
  └─ Stub 3: path contains "/test10" → response C

Proxy forwards everything to mountebank:2525 (or :10000)
```

---

## Key Benefits

✅ **Single Port** - Perfect for cloud platforms (Render, Railway, etc.)  
✅ **Simpler Networking** - No need to track dynamic port mappings  
✅ **Easier Debugging** - All mocks in one place  
✅ **Same Mountebank Power** - Still uses predicates, injection, etc.  
✅ **Cloud-Ready** - Works on any platform without modification

---

## Files Modified

### 1. **models/ApiMock.js**
- ❌ Removed `port` field
- ✅ Mocks no longer store port numbers

### 2. **routes/Api.js** (Major Refactor)
- ❌ Removed `getNextPort()` function
- ❌ Removed `Counter` model usage
- ❌ Removed proxy map updates
- ✅ Now creates **one imposter** with **multiple stubs**
- ✅ Each stub matches based on path (API name)
- ✅ All stubs reload into single imposter when any mock changes

### 3. **ReverseProxy.simple.js** (New File)
- ✅ Simplified proxy that forwards everything to Mountebank
- ✅ No more routing logic - Mountebank handles path matching
- ✅ Uses environment variables for Mountebank host/port

### 4. **docker-compose.yml**
- ✅ Updated environment variables
- ✅ Proxy uses `ReverseProxy.simple.js`
- ✅ Removed unnecessary env vars (CONTROL_API_PORT, PORT_COUNTER_START)

### 5. **render.yaml**
- ✅ Simplified configuration
- ✅ All services use port 10000
- ✅ Removed proxy control API complexity

---

## How It Works Now

### Creating a Mock:

1. **User fills UI form:**
   - API Name: `test10`
   - Response Body: `{"message": "Hello!"}`

2. **Backend (`routes/Api.js`):**
   - Saves mock to MongoDB
   - Fetches ALL mocks from database
   - Builds stubs array with predicates for each mock
   - Deletes existing Mountebank imposter (if any)
   - Creates NEW imposter with ALL stubs

3. **Mountebank:**
   - Receives single imposter on port 2525 (local) or 10000 (Render)
   - Imposter contains multiple stubs
   - Each stub has predicate: `path contains "/test10"`

4. **User calls API:**
   ```bash
   curl -X POST http://localhost:8080/test10 -d '{}'
   ```

5. **Proxy (`ReverseProxy.simple.js`):**
   - Receives request for `/test10`
   - Forwards entire request to `mountebank:2525/test10`

6. **Mountebank:**
   - Matches path `/test10` against stub predicates
   - Finds matching stub
   - Executes injection function
   - Returns mock response: `{"message": "Hello!"}`

---

## Environment Variables

### Local (Docker Compose):
```bash
MB_URL=http://mountebank:2525
MB_PORT=2525
BACKEND_PORT=3000
PROXY_PORT=8080
MB_PROXY_HOST=mountebank
```

### Render (Cloud):
```bash
MB_URL=http://mockapi-mountebank:10000
MB_PORT=10000
BACKEND_PORT=10000
PROXY_PORT=10000
MB_PROXY_HOST=mockapi-mountebank
PORT=10000  # Render's expected port
```

---

## Migration from V1 to V2

If you have existing data in MongoDB from V1:

### Option 1: Fresh Start (Recommended)
1. Drop existing database or use new database name
2. Deploy V2 code
3. Recreate mocks via UI

### Option 2: Migrate Data
Run this MongoDB script to remove port fields:
```javascript
db.apimocks.updateMany({}, { $unset: { port: "" } })
```

Then redeploy and call `/api/reloadAllImposters` to rebuild.

---

## Testing Locally

### 1. **Start Services:**
```bash
docker-compose down -v  # Clean start
docker-compose up --build
```

### 2. **Create Test Mock:**
Open `http://localhost:3000` and create:
- API Name: `test`
- Response Body: `{"message": "V2 works!", "version": 2}`

### 3. **Call Mock API:**
```bash
curl -X POST http://localhost:8080/test \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"message": "V2 works!", "version": 2}`

### 4. **Check Mountebank:**
```bash
curl http://localhost:2525/imposters
```

Should show ONE imposter on port 2525 with multiple stubs.

---

## Deploying to Render

### 1. **Push Changes:**
```bash
git add .
git commit -m "Architecture V2: Single port, simplified design"
git push origin main
```

### 2. **Redeploy Services:**
- Render will auto-deploy if auto-deploy is enabled
- Or manually trigger deployment for each service

### 3. **Add MongoDB URI:**
If not already set:
- Go to `mockapi-backend` → Environment
- Set `MONGODB_URI` to your MongoDB Atlas connection string

### 4. **Test:**
```bash
# Create mock via UI
open https://mockapi-backend.onrender.com

# Call mock API
curl -X POST https://mockapi-proxy.onrender.com/test \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Troubleshooting

### "Cannot find module 'ReverseProxy.simple.js'"
- Make sure file was committed and pushed to GitHub
- Check Render is pulling latest code

### "No mocks showing up"
- Check backend logs for "Reloading X mocks into single imposter"
- Check Mountebank logs for "Open for business"
- Call `/api/reloadAllImposters` endpoint manually

### "Mountebank not responding"
- Verify Mountebank service is "Live" in Render
- Check it's listening on port 10000
- Verify backend's `MB_URL` environment variable

### "API returns 404"
- The stub predicate might not match
- Check path matching: stub looks for `/test10` in the path
- Make sure you're calling the right API name

---

## Advanced: Direct Mountebank Access

Since we use a single imposter now, you could even skip the proxy:

**Local:**
```bash
curl -X POST http://localhost:2525/test -d '{}'
```

**Render:**
```bash
curl -X POST https://mockapi-mountebank.onrender.com/test -d '{}'
```

The proxy is optional but provides a cleaner abstraction.

---

## What Didn't Change

- ✅ UI still works the same way
- ✅ Mountebank predicates and injection still work
- ✅ MongoDB storage still works
- ✅ Authorization header passthrough still works
- ✅ Local Docker development still works

---

## Performance Considerations

### Before:
- Each mock = separate imposter = separate process
- More memory usage with many mocks

### After:
- Single imposter with many stubs
- Lower memory footprint
- Faster reloads (one imposter vs many)

---

## Future Enhancements

Possible improvements:
1. **Remove proxy entirely** - access Mountebank directly
2. **Add stub priority** - control which stub matches first
3. **Batch operations** - update multiple mocks at once
4. **Stub grouping** - organize stubs by tag/category

---

## Summary

**Architecture V2 is simpler, more reliable, and cloud-native** while maintaining all the functionality of V1.

**Key Takeaway:** One port, one imposter, many stubs = Easy cloud deployment! 🚀


