export const WRITE_ONLY_ON_CHANGE = 
  process.env.MONITOR_WRITE_ONLY_ON_CHANGE === 'true';

export const FORCE_WRITE_INTERVAL = 
  parseInt(process.env.MONITOR_FORCE_WRITE_INTERVAL || '6', 10); // default interval // by claude