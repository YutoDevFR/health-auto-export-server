import express from 'express';

import { getWorkouts, getWorkout, getWorkoutTypes, getWorkoutSources } from '../controllers/workouts';

const router = express.Router();

router.get('/types', getWorkoutTypes);
router.get('/sources', getWorkoutSources);
router.get('/', getWorkouts);
router.get('/:id', getWorkout);
router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

export default router;
