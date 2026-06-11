# AI FAQ Chat Integration

## Overview
This document describes the integration of the AI FAQ chatbot powered by AnythingLLM into the Service Desk application.

## Components

### Backend

#### 1. AI Chat Controller
**File**: `backend/src/controllers/aiChatController.js`

Handles communication with the AnythingLLM API:
- **sendMessage**: Sends user messages to AnythingLLM and returns AI responses
- **clearConversation**: Clears conversation history (client-side operation)

**API Key**: `YOUR_ANYTHINGLLM_API_KEY` (embedded in controller)

**AnythingLLM Endpoint**:
```
POST {ANYTHINGLLM_URL}/workspace/service-desk/chat
```

**Request Format**:
```json
{
  "message": "User question here",
  "mode": "chat",
  "history": [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"}
  ]
}
```

**Response Format**:
```json
{
  "textResponse": "AI generated response"
}
```

#### 2. AI Chat Routes
**File**: `backend/src/routes/aiChat.js`

Provides REST endpoints:
- `POST /api/ai-chat/message` - Send a message to the AI
- `POST /api/ai-chat/clear` - Clear conversation history

Both routes require authentication via JWT token.

#### 3. Server Integration
**File**: `backend/src/server.js`

The AI chat routes are registered in the main Express server alongside other routes.

### Frontend

#### FAQ Chat Bar Component
**File**: `frontend/src/components/FaqChatBar.jsx`

A floating chat interface at the bottom-right of the screen that provides:

**Features**:
- Expandable chat modal with full conversation history
- Auto-scrolling messages
- Loading indicators with animated dots
- Example question buttons for quick access
- Clear chat functionality
- Responsive design (mobile-friendly)
- Auto-focus on input when opened
- Enter key to send (Shift+Enter for new line)

**UI Elements**:
- Fixed button: Bottom-right corner with gradient purple-to-blue styling
- Modal: Expands from bottom-right (max height 600px)
- Message bubbles: User messages (right, gradient) vs AI messages (left, bordered)
- Input: Auto-expanding textarea with send button

**State Management**:
- `messages`: Array of {role, content} objects
- `inputValue`: Current user input
- `isLoading`: Whether AI is processing
- `isExpanded`: Modal visibility

**Integration**:
- Uses `useAuth()` context to get JWT token
- Makes authenticated API calls to `/api/ai-chat/message`
- Maintains conversation history for context

## Setup Instructions

### 1. Install Dependencies

In the backend directory:
```bash
npm install
```

This will install axios (required for AnythingLLM API calls).

### 2. Configure AnythingLLM

**Default Configuration**:
- Base URL: `http://localhost:3001/api/v1`
- API Key: `YOUR_ANYTHINGLLM_API_KEY`
- Workspace: `service-desk`

**Environment Variables** (optional override in `.env`):
```env
ANYTHINGLLM_URL=http://localhost:3001/api/v1
```

### 3. Prepare AnythingLLM Workspace

1. Create a workspace named `service-desk` in AnythingLLM
2. Upload the `AI_FAQ_KNOWLEDGE_BASE.md` document to the workspace
3. Configure the workspace to use your preferred LLM model
4. Enable RAG (Retrieval-Augmented Generation) mode
5. Set appropriate context limits and similarity thresholds

### 4. Start the Application

**Backend**:
```bash
cd backend
npm run dev
```

**Frontend**:
```bash
cd frontend
npm run dev
```

### 5. Test the Integration

1. Log into the Service Desk application
2. Click the "Have a question?" button at the bottom-right
3. Try asking one of the example questions or type your own
4. Verify that the AI responds with relevant information

## Knowledge Base

The AI assistant uses the comprehensive knowledge base located at:
**File**: `AI_FAQ_KNOWLEDGE_BASE.md`

This document contains:
- Complete system documentation (tickets, approvals, SLA, etc.)
- All workflows and processes
- Troubleshooting guides
- FAQ sections
- **Critical guardrails** that restrict the AI from:
  - Answering questions outside the Service Desk scope
  - Providing passwords, API keys, or credentials
  - Making system changes or data modifications
  - Giving financial, legal, or HR advice

## API Endpoints

### Send Message to AI
```
POST /api/ai-chat/message
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

Request Body:
{
  "message": "How do I create a ticket?",
  "conversationHistory": [
    {"role": "user", "content": "Previous question"},
    {"role": "assistant", "content": "Previous answer"}
  ]
}

Response:
{
  "success": true,
  "response": "To create a ticket, click the 'New Ticket' button...",
  "timestamp": "2026-02-05T12:34:56.789Z"
}
```

### Error Handling

**Common Errors**:

1. **503 Service Unavailable**: AnythingLLM is not running
   ```json
   {
     "error": "AI service is currently unavailable. Please try again later.",
     "details": "Connection refused"
   }
   ```

2. **401 Unauthorized**: Invalid API key
   ```json
   {
     "error": "AI service authentication failed. Please contact support.",
     "details": "Invalid API key"
   }
   ```

3. **404 Not Found**: Workspace doesn't exist
   ```json
   {
     "error": "AI workspace not found. Please contact support.",
     "details": "Workspace not configured"
   }
   ```

## Architecture Flow

```
User Input (Frontend)
    ↓
FaqChatBar Component
    ↓
POST /api/ai-chat/message (with JWT)
    ↓
Auth Middleware (validates token)
    ↓
AI Chat Controller
    ↓
AnythingLLM API (with API key)
    ↓
RAG System (searches knowledge base)
    ↓
LLM Response Generation
    ↓
Response sent back through chain
    ↓
Display in Chat UI
```

## Security Considerations

1. **Authentication**: All API calls require valid JWT authentication
2. **API Key**: Stored in controller (can be moved to env for better security)
3. **Knowledge Base Guardrails**: Prevents AI from answering out-of-scope questions
4. **No Direct Data Access**: AI cannot query or modify database directly
5. **Rate Limiting**: Consider adding rate limiting for production use

## Future Enhancements

Potential improvements:
- Add conversation persistence (save chat history to database)
- Implement rate limiting per user
- Add feedback buttons (thumbs up/down) for responses
- Track popular questions for analytics
- Add conversation export functionality
- Implement conversation search/history
- Add typing indicators
- Support file attachments for context

## Troubleshooting

### Chat button not visible
- Ensure `FaqChatBar` is imported in `AppLayout.jsx`
- Check that user is authenticated

### "AI service is currently unavailable"
- Verify AnythingLLM is running at the configured URL
- Check `ANYTHINGLLM_URL` environment variable
- Ensure the AnythingLLM server is accessible from backend

### "AI workspace not found"
- Create a workspace named `service-desk` in AnythingLLM
- Verify the workspace name in the API endpoint matches

### Poor AI responses
- Upload the latest `AI_FAQ_KNOWLEDGE_BASE.md` to the workspace
- Increase the similarity threshold in AnythingLLM settings
- Adjust context window size for the workspace
- Use a more capable LLM model

### Authentication errors
- Verify the API key matches the one in AnythingLLM settings
- Check that the API key has proper permissions
- Ensure the workspace allows API access

## Maintenance

**Regular Tasks**:
1. Update `AI_FAQ_KNOWLEDGE_BASE.md` when features change
2. Re-upload knowledge base to AnythingLLM workspace
3. Monitor API response times and error rates
4. Review user conversations for improvement opportunities
5. Update example questions based on common queries
