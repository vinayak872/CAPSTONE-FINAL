import express from 'express';
import { eventService } from '../services/event.service.js';

const router = express.Router();

router.get('/events', (req, res) => {
  res.json({
    events: eventService.getEvents()
  });
});

export default router;
