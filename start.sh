#!/bin/bash

# Mock API Platform - Quick Start Script

echo "🚀 Starting Mock API Platform..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Start services
echo "Starting services with Docker Compose..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check service health
echo ""
echo "✅ Checking service health..."

# Check backend
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Backend: http://localhost:3000 (UP)"
else
    echo "❌ Backend: http://localhost:3000 (DOWN)"
fi

# Check proxy
if curl -s http://localhost:8080 > /dev/null; then
    echo "✅ Proxy: http://localhost:8080 (UP)"
else
    echo "❌ Proxy: http://localhost:8080 (DOWN)"
fi

# Check MongoDB
if docker-compose ps | grep -q "mockapi-mongo.*Up"; then
    echo "✅ MongoDB: localhost:27017 (UP)"
else
    echo "❌ MongoDB: localhost:27017 (DOWN)"
fi

# Check Mountebank
if curl -s http://localhost:2525 > /dev/null; then
    echo "✅ Mountebank: http://localhost:2525 (UP)"
else
    echo "❌ Mountebank: http://localhost:2525 (DOWN)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Mock API Platform is ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Access Points:"
echo "   🎨 Management UI:  http://localhost:3000"
echo "   🚀 Mock API:       http://localhost:8080"
echo "   🐘 MongoDB:        mongodb://localhost:27017"
echo "   🔧 Mountebank:     http://localhost:2525"
echo ""
echo "📚 Quick Guide:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Create a mock (e.g., API name: 'test/hello')"
echo "   3. Test it: curl -X POST http://localhost:8080/test/hello -H 'Content-Type: application/json' -d '{}'"
echo ""
echo "📖 Documentation:"
echo "   Local Setup:    LOCAL_SETUP.md"
echo "   Architecture:   COMBINED_ARCHITECTURE.md"
echo ""
echo "🛠️  Useful Commands:"
echo "   View logs:      docker-compose logs -f"
echo "   Stop services:  docker-compose down"
echo "   Restart:        docker-compose restart"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

