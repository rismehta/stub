# Deployment Guide

## Deploy to Railway.app

### Prerequisites
- GitHub account
- Railway account (sign up at railway.app)

### Steps

1. **Push Your Code to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Deploy on Railway**
   - Go to https://railway.app
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose this repository
   - Railway will auto-detect docker-compose.yml

3. **Configure Environment Variables** (Railway auto-sets most)
   - Railway will create internal networking automatically
   - Services will communicate using Railway's internal DNS

4. **Get Your URLs**
   - Railway assigns public URLs like: `your-app.railway.app`
   - Backend UI: `https://backend-production.up.railway.app`
   - Proxy: `https://proxy-production.up.railway.app`

5. **Update CORS if Needed**
   - May need to add Railway domains to CORS config

### Cost
- **Free Tier:** 500 hours/month (enough for hobby projects)
- **Paid:** $5/month after free tier


