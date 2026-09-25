// ============================================================================
// VEHICLE ROUTES — /api/vehicles/*
// ============================================================================

import express from 'express';
import { linkVehicle, getMyVehicles, unlinkVehicle, createVehicle } from '../controllers/vehicleController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Tất cả routes cần JWT
router.use(authenticateToken);

// User routes
router.post('/link', linkVehicle);
router.get('/my', getMyVehicles);
router.delete('/unlink/:id', unlinkVehicle);

// Admin-only routes
router.post('/create', requireAdmin, createVehicle);

export default router;
