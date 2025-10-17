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

**Create Mocks:** https://mockapi-backend-09lz.onrender.com  
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
- Production: https://mockapi-backend-09lz.onrender.com
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

**4. Managing Mocks**
- **Edit**: Modify an existing mock
- **Clone**: Create a new mock based on an existing one (great for creating variations!)
- **Delete**: Remove a mock

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

## 🎯 Dynamic Matching & Smart Defaults

The platform uses **intelligent predicate matching** to handle real-world scenarios like dynamic IDs, tokens, and extra fields automatically.

### Smart Matching Rules

#### 1. **Path Matching** 🛣️
- **Plain paths** → Exact match (no regex chars detected)
- **Regex patterns** → Full path regex match with anchors `^...$`
- **Auto-detection** - System detects regex characters and switches mode

**Plain Path Examples:**
```javascript
API Path: users/login
✅ Matches ONLY: /users/login
❌ Doesn't match: /abc/users/login (extra prefix)
❌ Doesn't match: /users/login/extra (extra suffix)

API Path: api/v1/orders
✅ Matches ONLY: /api/v1/orders
❌ Doesn't match: /api/v1/orders/123
```

**Regex Pattern Examples:**

Auto-detected regex characters: `. * + ? ^ $ { } ( ) | [ ] \`

```javascript
// .*  - Match any characters (wildcard)
API Path: orders/.*
✅ Matches: /orders/123, /orders/abc/details, /orders/anything
❌ Doesn't match: /api/orders/123 (extra prefix)

// \d+  - Match one or more digits
API Path: users/\d+/profile
✅ Matches: /users/123/profile, /users/456/profile
❌ Doesn't match: /users/abc/profile (non-numeric)

// [0-9a-f]  - Character class (brackets)
API Path: users/[0-9a-f]{24}
✅ Matches: /users/507f1f77bcf86cd799439011 (MongoDB ObjectId)
❌ Doesn't match: /users/123 (too short)

// ?  - Optional (zero or one)
API Path: products(/\d+)?
✅ Matches: /products, /products/123
❌ Doesn't match: /products/123/456 (too many segments)

// +  - One or more
API Path: files/.+\\.pdf
✅ Matches: /files/document.pdf, /files/report_2024.pdf
❌ Doesn't match: /files/.pdf (nothing before .pdf)

// {n,m}  - Repetition (curly braces)
API Path: posts/\\d{1,5}
✅ Matches: /posts/1, /posts/12, /posts/12345
❌ Doesn't match: /posts/123456 (too many digits)

// |  - Alternation (OR)
API Path: (users|customers)/\\d+
✅ Matches: /users/123, /customers/456
❌ Doesn't match: /admins/789 (different prefix)

// ()  - Grouping (parentheses)
API Path: (api|v1)/orders
✅ Matches: /api/orders, /v1/orders
❌ Doesn't match: /api/v1/orders

// ^$  - Anchors (auto-added by system, don't include in path)
// System adds these automatically for full path matching
// Input: users/\d+  →  System uses: ^/users/\d+$

// .  - Match any single character (dot)
API Path: files/test.
✅ Matches: /files/test1, /files/testA, /files/test_
❌ Doesn't match: /files/test (no character after test)

// \\  - Escape character (backslash)
API Path: docs/\\d+\\.txt
✅ Matches: /docs/123.txt (escaped dot matches literal dot)
❌ Doesn't match: /docs/123Xtxt (dot must be present)
```

#### 2. **Body Matching** 📦
- **Uses `contains`** - Partial match only
- **Ignores extra fields** - Dynamic UUIDs, timestamps, extra data allowed

**Examples:**
```javascript
// Your predicate: { "amount": 100 }
✅ Matches: { "amount": 100 }
✅ Matches: { "amount": 100, "txnId": "uuid-123", "timestamp": "..." }
✅ Matches: { "amount": 100, "currency": "USD", "extra": "fields" }
❌ Doesn't match: { "amount": 200 }
```

#### 2.1 **Multiple Stubs with Overlapping Predicates** 🔄

When multiple stubs have overlapping predicates, **the platform automatically sorts them by specificity**.

**Specificity = Total number of predicate fields (body + headers + query)**

**Automatic Sorting:**
- ✅ More specific stubs checked first
- ✅ Less specific stubs checked later
- ✅ Same specificity → newer stubs first
- ✅ No manual ordering needed!

**Example Scenario:**

You create 3 stubs for the same path `users`:

**Stub 1: Premium Admin (created Day 1)**
```javascript
{
  apiName: "users",
  predicate: {
    request: { "role": "admin", "tier": "premium" }  // 2 fields
  },
  responseBody: { "plan": "premium-admin" }
}
// Specificity = 2
```

**Stub 2: Any Admin (created Day 2)**
```javascript
{
  apiName: "users",
  predicate: {
    request: { "role": "admin" }  // 1 field
  },
  responseBody: { "plan": "standard-admin" }
}
// Specificity = 1
```

**Stub 3: Admin with API Key (created Day 3)**
```javascript
{
  apiName: "users",
  predicate: {
    request: { "role": "admin" },  // 1 field
    headers: { "x-api-key": "*" }  // 1 field
  },
  responseBody: { "plan": "api-admin" }
}
// Specificity = 2
```

**Automatic Order (most specific first):**
```
1. Stub 3 (specificity 2, newest)
2. Stub 1 (specificity 2, older)
3. Stub 2 (specificity 1)
```

**Request Test Cases:**

```javascript
// Request 1: Admin with API key and premium tier
POST /users
Headers: { "x-api-key": "abc123" }
Body: { "role": "admin", "tier": "premium", "name": "Alice" }

✅ Checks Stub 3 first: Has role=admin ✓ + Has x-api-key ✓ → MATCHES
Returns: { "plan": "api-admin" }

// Request 2: Admin with premium tier (no API key)
POST /users
Body: { "role": "admin", "tier": "premium", "userId": "123" }

❌ Checks Stub 3 first: No x-api-key header → DOESN'T MATCH
✅ Checks Stub 1 next: Has role=admin ✓ + Has tier=premium ✓ → MATCHES
Returns: { "plan": "premium-admin" }

// Request 3: Basic admin (no tier, no API key)
POST /users
Body: { "role": "admin", "email": "admin@example.com" }

❌ Checks Stub 3 first: No x-api-key header → DOESN'T MATCH
❌ Checks Stub 1 next: No tier field → DOESN'T MATCH
✅ Checks Stub 2 last: Has role=admin ✓ → MATCHES
Returns: { "plan": "standard-admin" }
```

**Why This Matters:**

Without automatic sorting, the order would be insertion order (Day 1, Day 2, Day 3). This could cause issues:
- Stub 2 (Any Admin) might match first and return wrong response
- More specific stubs would never be reached
- Users would need to manually manage stub order

**With automatic sorting:**
- ✅ Create stubs in any order
- ✅ Most specific always wins
- ✅ Predictable behavior
- ✅ No manual management

**Console Log Example:**
```
Stub order (most specific first):
  1. users (Admin with API Key) - specificity: 2
  2. users (Premium Admin) - specificity: 2
  3. users (Any Admin) - specificity: 1
```

#### 3. **Header Matching** 🔑
- **Use `*` for flexible matching** - Matches any value
- **Otherwise uses exact match**

**Examples:**
```javascript
// Flexible matching (any value accepted)
In UI: { "authorization": "*" }
     or { "x-session-id": "*" }
✅ Matches ANY value:
  Authorization: Bearer abc123
  Authorization: Bearer xyz789-different-token
  x-session-id: any-session-value
  x-api-key: any-key-works

// Exact match (specific value required)
In UI: { "content-type": "application/json" }
     or { "authorization": "Bearer token123" }
✅ Must match exactly: Content-Type: application/json
❌ Doesn't match: Content-Type: text/plain
✅ Must match exactly: Authorization: Bearer token123
❌ Doesn't match: Authorization: Bearer different-token
```

**💡 Pro Tip:** For tokenized APIs, use `"*"` as the value!

#### 4. **Query Parameter Matching** 🔍
- **Use `*` for flexible matching** - Matches any value
- **Otherwise uses exact match**

**Examples:**
```javascript
// Mix exact and flexible matching
In UI: { "page": "*", "limit": "*", "status": "active" }

✅ Matches: ?page=1&limit=10&status=active
✅ Matches: ?page=2&limit=50&status=active    (page/limit any value)
✅ Matches: ?page=999&limit=100&status=active&extra=param
❌ Doesn't match: ?page=1&limit=10&status=pending  (status must be 'active')
❌ Doesn't match: ?limit=10&status=active  (missing 'page')

// Exact match only
In UI: { "page": "1", "limit": "10" }
✅ Matches: ?page=1&limit=10
❌ Doesn't match: ?page=2&limit=10  (wrong page value)
❌ Doesn't match: ?page=1&limit=20  (wrong limit value)

// Flexible match only (for pagination)
In UI: { "page": "*", "limit": "*" }
✅ Matches: ?page=1&limit=10
✅ Matches: ?page=2&limit=50
✅ Matches: ?page=999&limit=100
```

### Real-World Use Cases

#### ✅ Tokenized APIs
```javascript
// Create mock with flexible auth header
Headers: { "authorization": "*" }

// Matches ALL these requests:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Authorization: Bearer any-token-works
Authorization: Bearer user-123-session-xyz

// Or for any custom auth header:
Headers: { "x-session-id": "*", "x-api-key": "*" }
```

#### ✅ UUID in Request Body
```javascript
// Create mock matching only 'action' field
Body: { "action": "process" }

// Matches ALL these requests:
{ "action": "process", "requestId": "550e8400-e29b-41d4-a716-446655440000" }
{ "action": "process", "timestamp": "2025-10-15T10:30:00Z", "user": "123" }
{ "action": "process", "uuid": "any-uuid", "extra": "data" }
```

#### ✅ Dynamic User IDs
```javascript
// Create mock with regex path
API Path: users/\d+/orders

// Matches ALL these:
GET /users/123/orders
GET /users/456/orders
GET /users/999999/orders
```

#### ✅ Pagination (Flexible)
```javascript
// Create mock with flexible query params
Query: { "page": "*", "limit": "*" }

// Matches ALL these (any page/limit values):
GET /users?page=1&limit=10
GET /users?page=2&limit=50
GET /users?page=999&limit=100
```

#### ✅ Pagination (Exact Match)
```javascript
// Create mock with exact query params
Query: { "page": "1", "limit": "10" }

// Matches ONLY this:
GET /users?page=1&limit=10

// Does NOT match:
GET /users?page=2&limit=10  ❌ (wrong page)
GET /users?page=1&limit=20  ❌ (wrong limit)
```

### How to Control Matching Behavior

**Default Behavior:**
- ✅ Path: `equals` for plain paths, `matches` with anchors for regex patterns (auto-detected)
- ✅ Body: `contains` (partial match, ignores extra fields)  
- ✅ Headers: `equals` (exact match by default)
- ✅ Query: `equals` (exact match by default)

**Make Headers/Query Flexible:**
Use `*` as the value

```javascript
// Exact match (default)
Headers: { "authorization": "Bearer token123" }
Query: { "page": "1" }

// Flexible match (use * wildcard)
Headers: { "authorization": "*" }      // Any token works
Query: { "page": "*", "limit": "*" }  // Any page/limit works
```

---

## 🎭 Dynamic Mocks & External Functions

For advanced scenarios requiring conditional logic, random data, or stateful behavior, use **dynamic mocks with external functions**.

### Static vs Dynamic Mocks

| Type | When to Use | Example |
|------|-------------|---------|
| **Static** | Fixed response, no logic | Return same JSON every time |
| **Dynamic** | Conditional logic, randomness, state | Different response based on input |

### Why External Functions?

✅ **Maintainable** - Proper `.js` file with syntax highlighting  
✅ **Reusable** - Share functions across multiple mocks  
✅ **Testable** - Easier to debug and test  
✅ **Clean** - No inline code cluttering JSON

### Setting Up External Functions

**1. Create `functions.js` in GitHub Repository**

```javascript
// functions.js in api-virtualization repo
module.exports = {
  // Example: Dynamic loan status
  dynamicLoanStatus: function(request) {
    const body = JSON.parse(request.body);
    const loanId = body.loanId || 'UNKNOWN';
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId: loanId,
        status: 'APPROVED',
        amount: Math.floor(Math.random() * 100000) + 50000,
        timestamp: new Date().toISOString()
      })
    };
  },

  // Example: Conditional auth
  conditionalAuth: function(request) {
    const token = request.headers['authorization'];
    
    if (!token || token === 'Bearer invalid') {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: 'authenticated',
        timestamp: new Date().toISOString()
      })
    };
  },

  // Example: Simulate failures
  unreliableService: function(request) {
    const random = Math.random();
    
    // 10% chance of error
    if (random < 0.1) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Service unavailable' })
      };
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'success' })
    };
  }
};
```

**2. Reference Function in `mocks.json`**

```json
{
  "businessName": "Dynamic Loan Status",
  "apiName": "loans/status",
  "method": "POST",
  "responseFunction": "dynamicLoanStatus",
  "predicate": {
    "request": {},
    "headers": {},
    "query": {}
  },
  "responseHeaders": {},
  "responseBody": {}
}
```

**Note:** 
- Simply add `responseFunction` - system automatically detects it's dynamic (no need for `responseType`) ✨
- `responseFunction` can be either:
  - **Function name** (e.g., `"dynamicLoanStatus"`) - References function in `functions.js` ✅ **Recommended**
  - **Inline code** (e.g., `"function(request){...}"`) - Legacy support ⚠️ Not recommended

**3. System Automatically:**
- Fetches `functions.js` from GitHub
- Parses and loads all exported functions
- Detects if `responseFunction` is a function name or inline code
- Injects function code into Mountebank

### Function Signature

All response functions receive a `request` object and must return a response object:

```javascript
function myResponseFunction(request) {
  // Available request properties:
  // - request.method    : HTTP method (GET, POST, etc.)
  // - request.path      : Request path
  // - request.query     : Query parameters (object)
  // - request.headers   : Request headers (object)
  // - request.body      : Request body (string, parse if JSON)
  
  return {
    statusCode: 200,              // HTTP status code
    headers: {                    // Response headers
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({...})   // Response body (MUST be string)
  };
}
```

### Configuration

Set environment variables to configure external sources:

```bash
# URL to mocks.json in GitHub
EXTERNAL_MOCKS_URL=https://raw.githubusercontent.com/rismehta/api-virtualization/main/mocks.json

# URL to functions.js in GitHub
EXTERNAL_FUNCTIONS_URL=https://raw.githubusercontent.com/rismehta/api-virtualization/main/functions.js

# Auto-load from external on startup (ephemeral mode)
LOAD_FROM_EXTERNAL=true
```

### Use Cases

#### 1. Conditional Responses Based on Input

```javascript
function userByRole(request) {
  const body = JSON.parse(request.body);
  
  if (body.role === 'admin') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: ['read', 'write', 'delete'],
        level: 'superuser'
      })
    };
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: ['read'],
      level: 'basic'
    })
  };
}
```

#### 2. Random/Variable Data

```javascript
function randomOrderStatus(request) {
  const statuses = ['pending', 'processing', 'shipped', 'delivered'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: JSON.parse(request.body).orderId,
      status: randomStatus,
      timestamp: new Date().toISOString()
    })
  };
}
```

#### 3. Stateful Behavior

```javascript
let requestCount = 0;

function rateLimiter(request) {
  requestCount++;
  
  if (requestCount > 100) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: 60
      })
    };
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      remaining: 100 - requestCount
    })
  };
}
```

#### 4. Header-Based Logic

```javascript
function apiVersionRouter(request) {
  const version = request.headers['api-version'] || '1.0';
  
  if (version === '2.0') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'v2',
        data: { newField: 'value' }
      })
    };
  }
  
  // Default to v1
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'v1',
      data: { oldField: 'value' }
    })
  };
}
```

### GitHub Webhook Integration

The system supports automatic reload when `functions.js` or `mocks.json` changes:

**1. Set up webhook in GitHub:**
- Go to repo Settings → Webhooks → Add webhook
- Payload URL: `https://your-backend.onrender.com/api/webhook/github-mocks-updated`
- Content type: `application/json`
- Events: `push`

**2. System automatically:**
- Receives webhook on push to `main`
- Checks if `mocks.json` or `functions.js` changed
- Reloads both files and updates Mountebank

### External vs Inline Functions

The `responseFunction` field supports both approaches:

| Approach | Value | Pros | Cons | Recommended |
|----------|-------|------|------|-------------|
| **External function** | Function name<br>(e.g., `"dynamicLoanStatus"`) | ✅ Maintainable<br>✅ Reusable<br>✅ Testable<br>✅ Syntax highlighting | - | ✅ **Use this** |
| **Inline code** | Full function code<br>(e.g., `"function(request){...}"`) | ✅ Legacy support | ❌ Hard to maintain<br>❌ No syntax highlighting<br>❌ Not reusable | ⚠️ Avoid |

### Debugging

**Check loaded functions:**
```bash
curl https://your-backend.onrender.com/api/externalFunctions
```

**Response:**
```json
{
  "url": "https://raw.githubusercontent.com/.../functions.js",
  "totalFunctions": 5,
  "functions": [
    { "name": "dynamicLoanStatus", "codePreview": "function(request) {...)" },
    { "name": "conditionalAuth", "codePreview": "function(request) {...)" }
  ]
}
```

**Reload manually:**
```bash
curl -X POST https://your-backend.onrender.com/api/reloadFromExternal
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
| POST | `/api/reloadFromExternal` | Reload mocks from external GitHub repository |
| GET | `/api/externalMocks` | Fetch mocks from external source (without loading) |
| GET | `/api/externalMocks/info` | Get info about external mocks |
| GET | `/api/externalFunctions` | Get info about loaded external functions |
| POST | `/api/webhook/github-mocks-updated` | GitHub webhook endpoint for auto-reload |

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
│   └── ApiMock.js                 # Mock schema
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
   curl https://mockapi-backend-09lz.onrender.com/api/mocks
   ```

2. **Check Mountebank state:**
   ```bash
   curl https://mockapi-backend-09lz.onrender.com/api/debug/imposters
   ```

3. **Test direct call:**
   ```bash
   curl -X POST https://mockapi-backend-09lz.onrender.com/api/debug/testMock/your-api-name \
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
- **Live Demo**: https://mockapi-backend-09lz.onrender.com

---

**Built with ❤️ for developers who need reliable mock APIs**
# api-virtualization
