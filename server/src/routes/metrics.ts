import express from 'express';

import { getMetrics, getSources } from '../controllers/metrics';

const router = express.Router();

// Get all available sources/devices
router.get('/sources', getSources);

// Get metrics by type
router.get('/:selected_metric', getMetrics);

export default router;
