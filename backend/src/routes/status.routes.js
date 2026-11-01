import express from 'express';
import { stateService } from '../services/state.service.js';
import { eventService } from './../services/event.service.js';

const router = express.Router();

router.get('/status', (req, res) => {
  const state = stateService.getState();
  res.json({
    ...state,
    events_count: eventService.getCount()
  });
});

export default router;
