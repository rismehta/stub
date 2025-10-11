# Mock API Platform

A powerful, production-ready platform for creating and managing mock APIs using Mountebank. Perfect for development, testing, and API virtualization.

## ✨ Features

- 🎨 **Beautiful Web UI** - Create and manage mocks with an intuitive interface
- 🔄 **Dynamic Predicates** - Match requests by path, body, and headers
- 📝 **CRUD Operations** - List, create, edit, and delete mocks
- 🚀 **Production Ready** - Deployed on Render with MongoDB Atlas
- 🐳 **Docker Support** - Run locally with Docker Compose
- 🔐 **Header Matching** - Support for Authorization, API keys, custom headers
- 🎯 **Drop-in Replacement** - Use same API paths as your production API

---

## 🚀 Quick Start

### Option 1: Try the Live Demo

**Create Mocks:** https://mockapi-backend.onrender.com  
**Use Mocks:** https://mockapi-proxy.onrender.com

**Example:**
```bash
# 1. Create a mock in the UI with API name "test/hello"
# 2. Test it:
curl -X POST https://mockapi-proxy.onrender.com/test/hello \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### Option 2: Run Locally with Docker

```bash
# Clone the repository
git clone https://github.com/rismehta/stub.git
cd stub

# Quick start (recommended)
./start.sh

# Or manually
docker-compose up -d

# Access the UI
open http://localhost:3000

# Use mocks at
curl http://localhost:8080/your-api-name

# Stop services
./stop.sh
# Or manually
docker-compose down
```

---

## 📋 Architecture

### Production (Render)

```
┌──────────┐     ┌─────────────────────────┐
│  Proxy   │────▶│ Backend + Mountebank    │
│ (Public) │     │  (Internal MB :2525)    │
└──────────┘     └─────────────────────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │ MongoDB Atlas│
                   └──────────────┘
```

### Local (Docker Compose)

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


---

## 💻 Usage

### Creating Mocks

**1. Open the UI**
- Production: https://mockapi-backend.onrender.com
- Local: http://localhost:3000

**2. Fill in the form:**

| Field | Description | Required |
|-------|-------------|----------|
| API Name | The path for your mock (e.g., `users/login`) | ✅ Yes |
| Request Body Matching | JSON to match in request body | ❌ Optional |
| Request Headers Matching | Headers to match (e.g., `Authorization`) | ❌ Optional |
| Response Body | JSON response to return | ✅ Yes |
| Response Headers | Custom response headers | ❌ Optional |

**3. Save the mock**

---

### Using Mocks in Your App

**Change your API base URL:**

```javascript
// Before
const API_BASE_URL = 'https://api.production.com';

// After (use mocks)
const API_BASE_URL = 'https://mockapi-proxy.onrender.com';

// Same API calls work!
fetch(`${API_BASE_URL}/users/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token123'
  },
  body: JSON.stringify({ username: 'admin' })
})
```

**That's it! No code changes needed.** 🎉

---

## 📚 Examples

### Example 1: Simple Mock

**Create in UI:**
- **API Name**: `hello/world`
- **Response Body**: `{"message": "Hello World!"}`

**Test:**
```bash
curl -X POST https://mockapi-proxy.onrender.com/hello/world \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{"message": "Hello World!"}
```

---

### Example 2: Body Predicate Matching

**Create in UI:**
- **API Name**: `users/login`
- **Request Body Matching**: `{"username": "admin"}`
- **Response Body**: `{"token": "admin-token-123", "role": "admin"}`

**Test (✅ Matches):**
```bash
curl -X POST https://mockapi-proxy.onrender.com/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "any"}'
```

**Response:**
```json
{"token": "admin-token-123", "role": "admin"}
```

**Test (❌ Doesn't Match):**
```bash
curl -X POST https://mockapi-proxy.onrender.com/users/login \
  -H "Content-Type: application/json" \
  -d '{"username": "guest"}'
```

---

### Example 3: Header Predicate Matching

**Create in UI:**
- **API Name**: `secure/data`
- **Request Headers Matching**: `{"authorization": "Bearer secret123"}`
- **Response Body**: `{"data": "sensitive information"}`

**Test (✅ Matches):**
```bash
curl -X POST https://mockapi-proxy.onrender.com/secure/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secret123" \
  -d '{}'
```

**Response:**
```json
{"data": "sensitive information"}
```

---

### Example 4: Combined Body + Header Matching

**Create in UI:**
- **API Name**: `admin/action`
- **Request Body Matching**: `{"action": "delete"}`
- **Request Headers Matching**: `{"x-api-key": "admin-key"}`
- **Response Body**: `{"status": "deleted"}`

**Test (BOTH must match):**
```bash
curl -X POST https://mockapi-proxy.onrender.com/admin/action \
  -H "Content-Type: application/json" \
  -H "x-api-key: admin-key" \
  -d '{"action": "delete", "id": 123}'
```

**Response:**
```json
{"status": "deleted"}
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Database | MongoDB (Atlas in prod, local for dev) |
| Service Virtualization | Mountebank |
| Proxy | http-proxy |
| Containerization | Docker + Docker Compose |
| Deployment | Render.com |
| Frontend | Vanilla JS (no framework!) |

---

## 🔧 API Endpoints

### Mock Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mocks` | List all mocks |
| GET | `/api/mocks/:id` | Get single mock |
| POST | `/api/saveOrUpdate` | Create or update mock |
| DELETE | `/api/mocks/:id` | Delete mock |
| POST | `/api/reloadAllImposters` | Reload all mocks into Mountebank |

### Debug Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/debug/imposters` | Check Mountebank state |
| POST | `/api/debug/testMock/:apiName` | Test direct Mountebank call |

### Mock Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mock/*` | Your mock API (via backend) |
| POST | `/*` | Your mock API (via proxy) |

---

## 📂 Project Structure

```
stub-generator/
├── server.js                      # Backend entry point
├── ReverseProxy.js                # Proxy service
├── routes/
│   └── Api.js                     # Mock CRUD + Mountebank integration
├── models/
│   ├── ApiMock.js                 # Mock schema
│   └── Counter.js                 # Auto-increment helper
├── public/
│   ├── index.html                 # Web UI
│   ├── script.js                  # Frontend logic
│   └── style.css                  # Styling
├── Dockerfile                     # Node.js container
├── Dockerfile.combined            # Backend + Mountebank container
├── docker-compose.yml             # Local development
├── render.yaml                    # Render deployment config
├── start.sh                       # Quick start script
├── stop.sh                        # Stop script
└── README.md                      # This file - complete documentation
```

---

## 🚀 Deployment

### Deploy to Render

1. **Fork this repository**

2. **Create MongoDB Atlas cluster** (free tier)

3. **Create Render services** from Blueprint:
   - Connect GitHub repo
   - Use `render.yaml`
   - Set `MONGODB_URI` in backend environment variables

4. **Set environment variable:**
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `BACKEND_URL`: Backend public URL (for proxy)


---

## 🧪 Local Development

### Prerequisites
- Docker Desktop
- Ports 3000, 8080, 27017, 2525 available

### Start Services

```bash
# Start all services
docker-compose up -d

# Or use quick-start script
./start.sh
```

### Access Points

- **UI**: http://localhost:3000
- **Mock API**: http://localhost:8080
- **MongoDB**: mongodb://localhost:27017
- **Mountebank**: http://localhost:2525 (standard only)

### View Logs

```bash
docker-compose logs -f
docker-compose logs -f backend
```

### Stop Services

```bash
docker-compose down
```


---

## 🎯 Use Cases

### 1. **Local Development**
No need for VPN, staging servers, or real API access. Develop offline!

### 2. **CI/CD Testing**
Consistent, reliable mock responses for automated tests.

### 3. **Demos & POCs**
Show features without backend dependencies or API keys.

### 4. **API Exploration**
Test different scenarios and edge cases safely.

### 5. **Rate Limit Avoidance**
Avoid hitting API rate limits during development.

### 6. **Parallel Development**
Frontend and backend teams work independently.

---

## 🐛 Troubleshooting

### Mock not matching?

1. **Check mock exists:**
   ```bash
   curl https://mockapi-backend.onrender.com/api/mocks
   ```

2. **Check Mountebank state:**
   ```bash
   curl https://mockapi-backend.onrender.com/api/debug/imposters
   ```

3. **Test direct call:**
   ```bash
   curl -X POST https://mockapi-backend.onrender.com/api/debug/testMock/your-api-name \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. **Check logs** in Render dashboard

### Empty response?

- Ensure headers are forwarded (especially Authorization, API keys)
- Check predicate matches (body AND headers must all match)
- Verify API name exactly matches the path you're calling

### Local Docker issues?

```bash
# Rebuild everything
docker-compose down -v
docker-compose up -d --build

# Check service health
docker-compose ps
docker-compose logs -f
```

---

## 📖 Documentation

All documentation is contained in this README. See sections above for:
- Architecture (production and local)
- Usage examples and API endpoints
- Local development setup
- Deployment guide
- Troubleshooting

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with Docker Compose
5. Submit a pull request

---

## 📝 License

MIT License - feel free to use this in your projects!

---

## 🙏 Credits

- **Mountebank** - Service virtualization tool
- **MongoDB** - Database
- **Render** - Hosting platform

---

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/rismehta/stub/issues)
- **Documentation**: See `/docs` folder
- **Live Demo**: https://mockapi-backend.onrender.com

---

**Built with ❤️ for developers who need reliable mock APIs**
