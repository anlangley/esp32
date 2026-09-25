// ============================================================================
// AUTH ROUTES — /api/auth/*
// ============================================================================

import express from 'express';
import { register, login, getMe, changePassword } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public routes (không cần JWT)
router.post('/register', register);
router.post('/login', login);

// Protected routes (cần JWT)
router.get('/me', authenticateToken, getMe);
router.put('/password', authenticateToken, changePassword);

export default router;
