/**
 * Chronological Event Audit Stream Service
 * Maintains a bounded in-memory ring buffer (up to 50 entries)
 */

function formatTime() {
  const now = new Date();
  return now.toTimeString().split(' ')[0]; // HH:MM:SS format
}

class EventService {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.events = [];
    this.counter = 0;
  }

  addEvent(message, eventType = 'info', details = '') {
    this.counter += 1;
    const event = {
      id: this.counter,
      timestamp: formatTime(),
      type: eventType, // 'info' | 'warning' | 'danger' | 'success'
      message,
      details
    };

    this.events.unshift(event);
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(0, this.maxSize);
    }

    return event;
  }

  getEvents() {
    return [...this.events];
  }

  getCount() {
    return this.events.length;
  }

  clear() {
    this.events = [];
    this.counter = 0;
  }
}

export const eventService = new EventService();

// Initial startup log
eventService.addEvent(
  'CLOUD-05 Node.js Progressive Delivery Controller started',
  'info',
  'Controller initialized with stable release v1.0 on Node.js/Express engine'
);
