# Deployment Guide

## ⭐ Recommended: Deploy to Render.com (Easiest)

Render has the best support for Docker Compose applications and offers a free tier.

### Prerequisites
- GitHub account with your code pushed
- Render account (sign up at https://render.com)

### Steps

1. **Ensure Code is on GitHub**
   ```bash
   git add .
   git commit -m "Add Render configuration"
   git push origin main
   ```

2. **Deploy Using Render Blueprint**
   - Go to https://render.com/dashboard
   - Click **"New +"** button
   - Select **"Blueprint"**
   - Click **"Connect a repository"**
   - Authorize GitHub if needed
   - Select your `stub-generator` repository
   - Render will automatically detect `render.yaml`
   - Click **"Apply"**

3. **Wait for Deployment** (5-10 minutes)
   Render will create 4 services:
   - ✅ `mockapi-backend` - Your UI and API
   - ✅ `mockapi-proxy` - Routes mock API requests
   - ✅ `mockapi-mountebank` - Mocking engine
   - ✅ `mockapi-mongo` - MongoDB database

4. **Get Your URLs**
   After deployment completes:
   - Click on **mockapi-backend** service
   - Copy the URL (e.g., `https://mockapi-backend.onrender.com`)
   - This is your **UI URL** - open in browser to create mocks
   
   - Click on **mockapi-proxy** service  
   - Copy the URL (e.g., `https://mockapi-proxy.onrender.com`)
   - This is your **API URL** - use to call mock endpoints

5. **Test Your Deployment**
   - Open backend URL in browser
   - Create a test mock API
   - Call it via: `https://mockapi-proxy.onrender.com/<api-name>`

### Important Notes

⚠️ **Free Tier Limitations:**
- Services **spin down after 15 minutes** of inactivity
- First request after sleep takes **30-60 seconds** (cold start)
- Best for development/testing, not production

💡 **For Always-On:**
- Upgrade to paid plan ($7/month per service)
- Or keep browser tab open to prevent sleep

### Cost
- **Free Tier:** 750 hours/month per service
- **Paid:** $7/month per service for always-on

---

## Alternative: Deploy to Railway.app

Railway works but requires manual service setup (doesn't auto-detect docker-compose).

### Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Create Railway Project**
   - Go to https://railway.app/dashboard
   - Click "New Project"
   - Connect your GitHub repository

3. **Manually Add Each Service**
   - Click "+ New" → "Database" → "MongoDB"
   - Click "+ New" → "GitHub Repo" → Select your repo (for backend)
   - Set start command: `node server.js`
   - Click "+ New" → "GitHub Repo" → Same repo (for proxy)
   - Set start command: `node ReverseProxy.js`
   - Configure environment variables for each service

4. **Generate Public Domains**
   - For backend: Settings → Networking → Generate Domain
   - For proxy: Settings → Networking → Generate Domain

### Cost
- **Free Tier:** 500 hours/month
- **Paid:** $5/month after free tier

---

## Alternative: Deploy to Fly.io (Best for Production)

Best Docker Compose support and production-grade infrastructure.

### Prerequisites
- Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
- Sign up: `fly auth signup`

### Steps

1. **Launch App**
   ```bash
   fly launch --no-deploy
   ```

2. **Deploy**
   ```bash
   fly deploy
   ```

3. **Get URL**
   ```bash
   fly status
   ```

### Cost
- **Free Tier:** 3 VMs with 256MB RAM, 3GB storage
- **Paid:** ~$5-10/month for full stack

---

## Troubleshooting

### Render Issues

**Services won't start:**
- Check service logs in Render dashboard
- Ensure all environment variables are set
- Verify MongoDB connection string is correct

**502 Bad Gateway:**
- Check if all services are running
- Verify internal networking (services should use service names)
- Wait for initial deployment to complete

**Connection refused:**
- Services may still be starting (wait 2-3 minutes)
- Check that Mountebank service is running

### General Docker Issues

**Check logs:**
```bash
# Local testing
docker-compose logs -f

# On platform
Check service logs in dashboard
```

**Verify services communicate:**
- Use service names for internal URLs
- Example: `http://mockapi-mountebank:2525` (not localhost)

---

## Recommended Deployment Strategy

1. ✅ **Start with Render** - Easiest setup, works immediately
2. ✅ Test your mocks on free tier
3. ✅ If you need always-on, upgrade Render services
4. ✅ For production scale, migrate to Fly.io or AWS ECS

