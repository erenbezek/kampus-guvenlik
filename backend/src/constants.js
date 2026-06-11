const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer'
};

const DEVICE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

const ALARM_TYPES = {
  CROWD_DENSITY: 'CROWD_DENSITY',
  NOISE_ANOMALY: 'NOISE_ANOMALY',
  RESTRICTED_ZONE: 'RESTRICTED_ZONE',
  UNUSUAL_MOVEMENT: 'UNUSUAL_MOVEMENT',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE'
};

const ALARM_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const THRESHOLDS = {
  NOISE_DB: 85,
  NOISE_CONSECUTIVE: 3,       // 3 ardışık okuma (~15 saniye)
  ACCEL_MAGNITUDE: 2.5,       // G-force: normal=1.0, sallama=2-4
  MOVEMENT_CONSECUTIVE: 1,    // Tek okuma yeterli
  CROWD_RADIUS_M: 50,
  CROWD_COUNT: 0,             // Demo: 2 cihaz yeterli (nearbyCount > 0)
  OFFLINE_MINUTES: 10,
  ZSCORE_THRESHOLD: 2.5,
  ROLLING_WINDOW: 30,
  ALARM_COOLDOWN_MS: 60 * 1000,        // 1 dakika cooldown
  CROWD_COOLDOWN_MS: 2 * 60 * 1000,
  RESTRICTED_COOLDOWN_MS: 2 * 60 * 1000
};

const SOCKET_EVENTS = {
  SENSOR_UPDATE: 'sensor:update',
  ALARM_NEW: 'alarm:new',
  DEVICE_STATUS: 'device:status',
  JOIN_DASHBOARD: 'join:dashboard'
};

// Sabit zone yok — admin panelinden çizilir
const RESTRICTED_ZONES = [];

module.exports = {
  ROLES,
  DEVICE_STATUS,
  ALARM_TYPES,
  ALARM_SEVERITY,
  THRESHOLDS,
  SOCKET_EVENTS,
  RESTRICTED_ZONES
};
