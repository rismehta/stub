# Render Deployment with MongoDB Atlas

## Step 1: Update render.yaml

Open `render.yaml` and replace `YOUR_USERNAME/YOUR_REPO_NAME` with your actual GitHub repository path.

Example:
```yaml
repo: https://github.com/yourusername/stub-generator.git
```

## Step 2: Push to GitHub

```bash
git add .
git commit -m "Add Render configuration"
git push origin main
```

## Step 3: Deploy to Render

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Blueprint"**
3. Click **"Connect a repository"**
4. Select your `stub-generator` repository
5. Render will detect `render.yaml`
6. Click **"Apply"**

Render will create 3 services:
- `mockapi-mountebank`
- `mockapi-backend`
- `mockapi-proxy`

## Step 4: Add MongoDB Connection String

Since `MONGODB_URI` is set to `sync: false`, you need to add it manually:

1. After deployment starts, click on **mockapi-backend** service
2. Go to **"Environment"** tab on the left
3. Click **"Add Environment Variable"**
4. **Key**: `MONGODB_URI`
5. **Value**: Paste your MongoDB Atlas connection string
   ```
   mongodb+srv://username:password@cluster.mongodb.net/mock-api-db?retryWrites=true&w=majority
   ```
6. Click **"Save Changes"**
7. Service will automatically redeploy

## Step 5: Wait for Deployment (5-10 minutes)

All 3 services will build and start. Wait for all to show "Live" status.

## Step 6: Get Your URLs

After deployment:

1. Click on **mockapi-backend** service
   - Copy the URL (e.g., `https://mockapi-backend.onrender.com`)
   - This is your **UI URL**

2. Click on **mockapi-proxy** service
   - Copy the URL (e.g., `https://mockapi-proxy.onrender.com`)
   - This is your **API URL**

## Step 7: Update Backend URL (Important!)

1. Go back to **mockapi-backend** service
2. Click **"Environment"** tab
3. Find `BACKEND_BASE_URL` variable
4. Click edit and update to your actual backend URL:
   ```
   https://mockapi-backend.onrender.com
   ```
   (Use your actual URL from Step 6)
5. Save - service will redeploy

## Step 8: Test

1. Open backend URL in browser
2. Create a test mock:
   - API Name: `test`
   - Response Body: `{"message": "Hello!"}`
3. Click "Save Mock"
4. Test the API:
   ```bash
   curl -X POST https://mockapi-proxy.onrender.com/test \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

Expected response: `{"message": "Hello!"}`

## Done! 🎉

Your URLs:
- **UI**: `https://mockapi-backend.onrender.com`
- **API**: `https://mockapi-proxy.onrender.com/<api-name>`

## Troubleshooting

**Backend won't start:**
- Check `MONGODB_URI` is set correctly in backend environment variables
- Verify MongoDB Atlas allows connections from `0.0.0.0/0`

**502 Bad Gateway:**
- Wait 2-3 minutes for all services to fully start
- Check Mountebank service is "Live"

**Services not found:**
- Make sure all 3 services deployed successfully
- Check logs for each service

## Free Tier Notes

- Services spin down after 15 minutes of inactivity
- First request after inactivity takes 30-60 seconds
- 750 hours/month free per service
- Total cost: **$0/month**

