# Mock API Proxy Server with Mountebank and MongoDB

---

## 1. Introduction

This project provides a full-featured mock API platform leveraging Mountebank for service virtualization, MongoDB for persistence of mock data, and a Node.js-based reverse proxy and backend API management system. It enables developers and testers to easily create, manage, and test API mocks dynamically through a modern UI and API interface.

The system works by allowing users to create mock API definitions saved in MongoDB, which the backend converts into Mountebank imposters running on dynamic ports. The reverse proxy dynamically routes API requests to the appropriate stubbed services by mapping API names to running Mountebank imposter ports.

---


## Design

![Design](image/Design.jpeg)

### Architecture Overview

- **Backend API Server:**  
  - Node.js/Express app managing mock API CRUD operations and MongoDB storage.  
  - Dynamically creates or updates Mountebank imposters via its admin API.  
  - Maintains an API-to-imposter port map and pushes it to the proxy for routing.

- **Reverse Proxy Server:**  
  - Node.js custom proxy server intercepting incoming API requests.  
  - Routes requests to the correct Mountebank imposter based on the API name and port map.  
  - Exposes a control API (`/update-map`) to receive real-time routing map updates from backend.

- **Mountebank Imposters:**  
  - Each mock API is represented as a Mountebank imposter running on an assigned port.  
  - Supports flexible predicates and expected responses.  
  - UI and backend interact to create/delete imposters dynamically.

- **MongoDB Database:**  
  - Persists mock API definitions and configuration.

  ### Data Flow

1. User creates or updates a mock API via the UI or API.  
2. Backend saves the mock in MongoDB, creates/updates a Mountebank imposter on a dynamic port.  
3. Backend updates the routing map (API name → {host, port}) and pushes it to the proxy `/update-map` endpoint.  
4. Proxy uses this map to forward HTTP requests to the correct Mountebank port transparently.  
5. Responses from Mountebank imposters return to the client.

---

## 3. Tech Stack

| Component        | Technology                | Purpose                                  |
|------------------|---------------------------|------------------------------------------|
| Backend Server   | Node.js + Express         | API management, imposter lifecycle       |
| Reverse Proxy    | Node.js + http-proxy      | Dynamic routing of API requests           |
| Mock Server      | Mountebank                | Service virtualization and mocking        |
| Database        | MongoDB                   | Persisting mock API definitions           |
| UI              | React / Static frontend (served from backend) | User interface for mock API creation |

---

## 4. Installation Steps (with Docker)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- Docker Compose installed

### Steps

1. Clone the repository
2. cd your-project-folder
3. Build and start all containers (MongoDB, Mountebank, backend, proxy):docker-compose up --build

### URLs

1. Access the UI at:  
`http://localhost:3000`

2. Backend APIs run at:  
`http://localhost:3000/api/...`  

3. Proxy listens on port 8080 for forwarded API requests:  
`http://localhost:8080/<api-name>/...`


## 5. Debugging Guidelines

### Checking Logs

- Show all service logs combined: docker-compose logs -f
- Show logs for a specific service:
docker-compose logs -f backend
docker-compose logs -f proxy
docker-compose logs -f mountebank
docker-compose logs -f mongo


### Common Troubleshooting Steps

- **Bad Gateway / 502 Errors:**  
- Confirm `apiPortMap` includes both host (`mountebank`) and correct port.  
- Check proxy code uses host and port correctly to forward requests.  
- Verify Mountebank imposters exist on the ports (`http://localhost:2525/imposters`).

- **Connection Refused Errors:**  
- Confirm backend uses Docker service names (e.g., `proxy`, `mountebank`) instead of `localhost` or IPs when calling internal services.  
- Confirm all relevant containers are running (`docker ps`) and healthy.

- **API Not Found (404):**  
- Check if the incoming API name exists in the proxy `apiPortMap`.  
- Confirm the mock API was saved and backend pushed updated map to the proxy.

- To test connectivity inside containers:
docker exec -it <container_name> sh
wget -qO- http://mountebank:4000


- Restart services to refresh environment:
docker-compose restart


---

## 6. Instructions to Add APIs and Manage Mocks

### Using the UI

1. Navigate to the UI at `http://localhost:3000`.
2. Use the provided forms to create new mock API definitions including request predicates and stub responses.
3. Upon saving, the backend will create an imposter in Mountebank and update the proxy routing map.
4. Access your mocked API via `http://localhost:8080/<api-name>/...`.

### Using API

- Create or update mocks via backend API endpoints (`POST /api/mocks`).
- Backend automatically creates imposters and updates routing.
- Proxy routes incoming requests by API name in URL.

### Workflow

- Each API mock is assigned a unique port internally.
- Requests made to proxy on port 8080 will be routed to the corresponding imposter automatically.
- Mock responses will reflect the predicates and stubs defined in your mock.

### Tips

- Ensure API names in URLs match exactly those defined in the map.
- Use `contains` predicates in mocks for flexible matching.
- Use Mountebank admin UI (`http://localhost:2525`) for monitoring imposters directly if needed.


