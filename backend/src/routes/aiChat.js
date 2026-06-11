/**
 * AI Chat Routes
 * Routes for FAQ AI assistant powered by AnythingLLM
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';

export function makeAiChatRouter(aiChatController) {
  const router = express.Router();

  // All routes require authentication
  router.use(requireAuth);

  // Send message to AI
  router.post('/ai-chat/message', aiChatController.sendMessage);

  // Clear conversation history
  router.post('/ai-chat/clear', aiChatController.clearConversation);

  return router;
}
