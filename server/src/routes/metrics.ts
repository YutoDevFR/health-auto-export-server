import express from 'express';

import { getMetrics, getSources, getAvailableMetrics } from '../controllers/metrics';

const router = express.Router();

// Get all available metrics (collections with data)
router.get('/available', getAvailableMetrics);

// Get all available sources/devices
router.get('/sources', getSources);

// Get metrics by type
router.get('/:selected_metric', getMetrics);

export default router;
