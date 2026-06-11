#!/bin/bash

# Test script for AI Chat API
# This helps diagnose connection issues

echo "=== AI Chat API Test ==="
echo ""

# Check if backend is running
echo "1. Checking if backend is running..."
if curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "✓ Backend is running on port 5000"
else
    echo "✗ Backend is NOT running on port 5000"
    echo "  Please start the backend: cd backend && npm run dev"
    exit 1
fi

echo ""

# Check if AnythingLLM is running
echo "2. Checking if AnythingLLM is running..."
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "✓ AnythingLLM appears to be running on port 3001"
else
    echo "✗ AnythingLLM is NOT running on port 3001"
    echo "  Please start AnythingLLM or update ANYTHINGLLM_URL in .env"
fi

echo ""
echo "3. To test the AI chat endpoint, you need a JWT token from logging in."
echo "   Then run:"
echo ""
echo "   curl -X POST http://localhost:5000/api/ai-chat/message \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Authorization: Bearer YOUR_JWT_TOKEN' \\"
echo "     -d '{\"message\": \"How do I create a ticket?\", \"conversationHistory\": []}'"
echo ""
echo "=== End of Test ==="
