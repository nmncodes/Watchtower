import './probe-worker';
import './persistence-worker';
import './incident-worker';
import './notification-worker';
import './scheduler';

console.log('[workers] All background workers and scheduler started in a single process.');
