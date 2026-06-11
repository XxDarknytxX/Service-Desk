# AI Chat Integration Test Guide

## Prerequisites Checklist

✅ **Backend Setup Complete**:
- [x] axios package installed (`npm install` in backend)
- [x] AI chat controller created
- [x] AI chat routes registered
- [x] Server starts without errors

✅ **Frontend Setup Complete**:
- [x] FaqChatBar component updated with chat interface
- [x] Component integrated in AppLayout

## Testing Steps

### Step 1: Configure AnythingLLM

Before testing the chat, you need to set up AnythingLLM:

1. **Start AnythingLLM** (if not already running):
   ```bash
   # Default port: 3001
   # Access at: http://localhost:3001
   ```

2. **Create Workspace**:
   - Open AnythingLLM dashboard
   - Create a new workspace named: `service-desk`
   - Note: The workspace name must match exactly (case-sensitive)

3. **Upload Knowledge Base**:
   - In the `service-desk` workspace
   - Upload the file: `AI_FAQ_KNOWLEDGE_BASE.md`
   - Wait for the document to be processed

4. **Configure Workspace Settings**:
   - Set your preferred LLM model (e.g., GPT-4, Claude, etc.)
   - Enable RAG (Retrieval-Augmented Generation)
   - Adjust similarity threshold (recommended: 0.7 or higher)
   - Set context window appropriately

5. **Verify API Key**:
   - Go to Settings → API Keys
   - Verify that the API key `YOUR_ANYTHINGLLM_API_KEY` exists and is active
   - If not, update the API key in `backend/src/controllers/aiChatController.js`

### Step 2: Start the Backend

```bash
cd backend
npm run dev
```

**Expected Output**:
```
API listening on http://localhost:5000
```

**Verify**:
- No errors in console
- Server is accessible at http://localhost:5000/health
- Should return: `{"status":"ok"}`

### Step 3: Start the Frontend

```bash
cd frontend
npm run dev
```

**Expected Output**:
```
Local:   http://localhost:3000/
```

### Step 4: Test the Chat Interface

1. **Login to Service Desk**:
   - Open http://localhost:3000
   - Login with your credentials

2. **Locate the Chat Button**:
   - Look at the **bottom-right corner** of the screen
   - You should see a purple-to-blue gradient button
   - Button text: "Have a question?"
   - Has a green pulsing indicator

3. **Open the Chat**:
   - Click the "Have a question?" button
   - Modal should slide up from bottom-right
   - Should show welcome screen with example questions

4. **Test Example Questions**:
   Click one of the example question buttons:
   - "How do I create a ticket?"
   - "What's the SLA policy?"
   - "How to escalate urgent issues?"
   - "Team assignment process"

   **Expected Behavior**:
   - Question appears as user message (right side, gradient bubble)
   - Loading indicator appears (3 bouncing dots)
   - AI response appears (left side, bordered bubble)
   - Response should be relevant to the question

5. **Test Custom Questions**:
   Type your own questions in the input field:
   - "What is the approval workflow?"
   - "How do I assign a ticket to a team?"
   - "What are the different ticket priorities?"
   - "How do agents claim tickets from the queue?"

   **Expected Behavior**:
   - Press Enter to send (or click send button)
   - Same flow as example questions
   - AI should answer based on the knowledge base

6. **Test Conversation Context**:
   Ask follow-up questions:
   - First: "How do I create a ticket?"
   - Then: "Can you explain more about priorities?"
   - Then: "What happens after I submit it?"

   **Expected Behavior**:
   - AI should maintain context from previous messages
   - Follow-up answers should be relevant to the conversation

7. **Test Clear Chat**:
   - Look for trash icon in header (appears when messages exist)
   - Click the trash icon
   - All messages should be cleared
   - Welcome screen should reappear

8. **Test UI Features**:
   - **Auto-scroll**: Send multiple messages, verify auto-scroll to latest
   - **Input expansion**: Type multiple lines, verify textarea expands
   - **Enter key**: Press Enter to send, Shift+Enter for new line
   - **Loading state**: Verify send button is disabled while loading
   - **Close modal**: Click X button or backdrop to close
   - **Reopen**: Click button again to reopen with conversation history

## Troubleshooting

### Issue: "AI service is currently unavailable"

**Possible Causes**:
1. AnythingLLM is not running
2. Wrong ANYTHINGLLM_URL in backend/.env
3. AnythingLLM is on a different port

**Solutions**:
```bash
# Check if AnythingLLM is running
curl http://localhost:3001/api/v1/health

# If different URL, update backend/.env:
ANYTHINGLLM_URL=http://localhost:YOUR_PORT/api/v1
```

### Issue: "AI workspace not found"

**Possible Causes**:
1. Workspace not created in AnythingLLM
2. Workspace name mismatch (case-sensitive)

**Solutions**:
- Create workspace named exactly: `service-desk`
- Check the workspace slug in AnythingLLM matches
- Update endpoint in `backend/src/controllers/aiChatController.js` line 23 if needed

### Issue: "AI service authentication failed"

**Possible Causes**:
1. API key mismatch
2. API key expired or disabled

**Solutions**:
1. Check AnythingLLM Settings → API Keys
2. Copy the correct API key
3. Update `ANYTHINGLLM_API_KEY` in `backend/src/controllers/aiChatController.js` line 8

### Issue: Chat button not visible

**Possible Causes**:
1. Not logged in
2. Component not imported in AppLayout

**Solutions**:
1. Ensure you're logged into the application
2. Check `frontend/src/components/AppLayout.jsx` imports FaqChatBar
3. Check browser console for React errors

### Issue: Poor AI responses

**Possible Causes**:
1. Knowledge base not uploaded
2. Low similarity threshold
3. Wrong LLM model selected

**Solutions**:
1. Re-upload `AI_FAQ_KNOWLEDGE_BASE.md` to workspace
2. Increase similarity threshold in AnythingLLM settings
3. Try a more capable LLM model
4. Increase context window size

### Issue: Backend errors in console

**Check Backend Logs**:
```bash
# Look for errors in the backend terminal
# Common errors:

# Connection timeout:
# - Check ANYTHINGLLM_URL
# - Verify AnythingLLM is running

# 404 errors:
# - Check workspace name
# - Verify endpoint path

# 401 errors:
# - Check API key
# - Verify API key is active in AnythingLLM
```

## API Endpoint Testing

You can also test the API directly using curl:

### Test Message Endpoint

```bash
# First, get a JWT token by logging in
# Then use it in the Authorization header

curl -X POST http://localhost:5000/api/ai-chat/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "How do I create a ticket?",
    "conversationHistory": []
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "response": "To create a ticket in the Service Desk...",
  "timestamp": "2026-02-05T12:34:56.789Z"
}
```

## Success Criteria

The integration is working correctly if:

✅ Chat button appears at bottom-right corner
✅ Modal opens/closes smoothly
✅ Example questions trigger AI responses
✅ Custom questions get relevant answers
✅ Conversation context is maintained
✅ Loading indicators work properly
✅ Clear chat function works
✅ No errors in browser or server console
✅ UI is responsive on mobile/desktop
✅ Auto-scroll works with new messages

## Performance Benchmarks

**Expected Response Times**:
- Initial message: 2-5 seconds (depends on LLM model)
- Follow-up messages: 2-5 seconds
- Modal open/close: Instant (<100ms)
- Message rendering: Instant (<100ms)

**If responses are slower**:
- Check AnythingLLM performance
- Consider using a faster LLM model
- Reduce context window size
- Check network latency to AnythingLLM server

## Next Steps After Successful Testing

1. **Monitor Usage**:
   - Watch backend logs for errors
   - Check AnythingLLM analytics
   - Gather user feedback

2. **Optimize**:
   - Fine-tune similarity threshold
   - Adjust context window
   - Update knowledge base with common questions

3. **Enhance** (optional):
   - Add conversation persistence
   - Implement feedback buttons
   - Add analytics tracking
   - Create admin dashboard for chat metrics
