#!/bin/bash

# Mock API Platform - Stop Script

echo "🛑 Stopping Mock API Platform..."
echo ""

# Stop services
docker-compose down

echo ""
echo "✅ All services stopped."
echo ""
echo "💡 Tip: To remove all data (MongoDB volumes), run:"
echo "   docker-compose down -v"
echo ""

