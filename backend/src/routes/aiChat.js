/**
 * AI Chat Routes
 * Routes for FAQ AI assistant powered by AnythingLLM
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';

export function makeAiChatRouter(aiChatController) {
  const router = express.Router();

  // All AI chat routes require authentication.
  // Scoped to /ai-chat so this router never intercepts unrelated /api paths
  // (a bare router.use(requireAuth) would 401 every request that flows
  // through this router, including public form links).
  router.use('/ai-chat', requireAuth);

  // Send message to AI
  router.post('/ai-chat/message', aiChatController.sendMessage);

  // Clear conversation history
  router.post('/ai-chat/clear', aiChatController.clearConversation);

  return router;
}
