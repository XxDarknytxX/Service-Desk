/**
 * AI Chat Controller
 * Handles communication with AnythingLLM API
 */

import axios from 'axios';

const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY;
const ANYTHINGLLM_BASE_URL = process.env.ANYTHINGLLM_URL || 'http://localhost:3001/api/v1';
const ANYTHINGLLM_WORKSPACE = process.env.ANYTHINGLLM_WORKSPACE || 'my-workspace';

/**
 * Send message to AI and get response
 * POST /api/ai-chat/message
 */
async function sendMessage(req, res) {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required and must be a non-empty string'
      });
    }

    if (!ANYTHINGLLM_API_KEY) {
      return res.status(500).json({
        error: 'AI service is not configured. Please contact support.',
        details: 'Missing API key'
      });
    }

    // Format conversation history for AnythingLLM
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.role, // 'user' or 'assistant'
      content: msg.content
    }));

    // Call AnythingLLM API
    const response = await axios.post(
      `${ANYTHINGLLM_BASE_URL}/workspace/${ANYTHINGLLM_WORKSPACE}/chat`,
      {
        message: message.trim(),
        mode: 'chat',
        history: formattedHistory
      },
      {
        headers: {
          'Authorization': `Bearer ${ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 0 // No timeout - allow AI to take as long as needed
      }
    );

    // Extract the AI response
    const aiResponse = response.data?.textResponse || response.data?.response || 'I apologize, but I could not generate a response. Please try again.';

    return res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AnythingLLM API Error:', error.response?.data || error.message);

    // Handle specific error cases
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please try again later.',
        details: 'Connection refused'
      });
    }

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'AI service authentication failed. Please contact support.',
        details: 'Invalid API key'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'AI workspace not found. Please contact support.',
        details: 'Workspace not configured'
      });
    }

    return res.status(500).json({
      error: 'Failed to get AI response. Please try again.',
      details: error.message
    });
  }
}

/**
 * Clear conversation history (if needed for session management)
 * POST /api/ai-chat/clear
 */
async function clearConversation(req, res) {
  try {
    // This is a client-side operation, just acknowledge
    return res.json({
      success: true,
      message: 'Conversation cleared'
    });
  } catch (error) {
    console.error('Clear conversation error:', error);
    return res.status(500).json({
      error: 'Failed to clear conversation'
    });
  }
}

export function makeAiChatController(pool) {
  return {
    sendMessage,
    clearConversation
  };
}
