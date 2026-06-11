const Alarm = require('../models/Alarm');
const Device = require('../models/Device');
const SensorData = require('../models/SensorData');
const Zone = require('../models/Zone');
const {
  ALARM_TYPES,
  ALARM_SEVERITY,
  THRESHOLDS,
  RESTRICTED_ZONES
} = require('../constants');
const logger = require('../utils/logger');

// Zone cache — 60 saniyede bir tazele
let _zonesCache = null;
let _zonesCacheAt = 0;

async function getActiveZones() {
  if (_zonesCache && Date.now() - _zonesCacheAt < 60_000) return _zonesCache;
  try {
    const dbZones = await Zone.find();
    _zonesCache = [...RESTRICTED_ZONES, ...dbZones];
  } catch {
    _zonesCache = RESTRICTED_ZONES;
  }
  _zonesCacheAt = Date.now();
  return _zonesCache;
}

// Dışarıdan çağrılabilir — admin yeni zone ekleyince cache'i sıfırla
function invalidateZoneCache() {
  _zonesCache = null;
}

// Per-device in-memory state for rolling analysis
const deviceState = new Map();

function getState(deviceId) {
  const key = deviceId.toString();
  if (!deviceState.has(key)) {
    deviceState.set(key, {
      noiseBuffer: [],       // consecutive high-noise readings
      movementBuffer: [],    // consecutive high-movement readings
      audioHistory: [],      // rolling window for z-score
      lastAlarms: {}         // cooldown tracker per alarm type
    });
  }
  return deviceState.get(key);
}

// ----- Math helpers -----

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Algorithm 7: Z-score on rolling window
function calculateZScore(values) {
  if (values.length < 5) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (values[values.length - 1] - mean) / std;
}

// Algorithm 6: Composite risk score 0-100
function calculateRiskScore(sensors, zones = RESTRICTED_ZONES) {
  const { accelerometer, audioLevel, gps, networkStrength } = sensors;
  let score = 0;

  // Audio: 35% weight
  if (typeof audioLevel === 'number') {
    score += Math.min(audioLevel / 130, 1) * 35;
  }

  // Movement magnitude: 30% weight
  if (accelerometer) {
    const mag = Math.sqrt(
      (accelerometer.x || 0) ** 2 +
      (accelerometer.y || 0) ** 2 +
      (accelerometer.z || 0) ** 2
    );
    score += Math.min(mag / 30, 1) * 30;
  }

  // Restricted zone: 25% weight (sadece safe olmayan zone'lar)
  if (gps && gps.lat != null && gps.lng != null) {
    const inZone = zones.some((zone) =>
      zone.type !== 'safe' && pointInPolygon(gps.lat, gps.lng, zone.polygon)
    );
    if (inZone) score += 25;
  }

  // Weak network signal: 10% weight (inverted)
  if (typeof networkStrength === 'number') {
    score += (1 - Math.min(networkStrength / 100, 1)) * 10;
  }

  return Math.round(Math.min(score, 100));
}

// Cooldown guard to prevent alarm spam
async function canCreateAlarm(deviceId, type, cooldownMs) {
  const state = getState(deviceId);
  const now = Date.now();
  const last = state.lastAlarms[type] || 0;
  if (now - last < cooldownMs) return false;
  state.lastAlarms[type] = now;
  return true;
}

async function persistAlarm(deviceId, type, severity, message) {
  const alarm = new Alarm({ deviceId, type, severity, message });
  await alarm.save();
  return alarm.populate('deviceId', 'name deviceId');
}

// ----- Algorithm 1: Noise anomaly (>85dB for >10 consecutive readings) -----
async function analyzeNoise(deviceId, audioLevel) {
  if (typeof audioLevel !== 'number') return [];
  const state = getState(deviceId);
  const results = [];

  if (audioLevel > THRESHOLDS.NOISE_DB) {
    state.noiseBuffer.push(audioLevel);
  } else {
    state.noiseBuffer = [];
  }

  if (state.noiseBuffer.length >= THRESHOLDS.NOISE_CONSECUTIVE) {
    if (await canCreateAlarm(deviceId, ALARM_TYPES.NOISE_ANOMALY, THRESHOLDS.ALARM_COOLDOWN_MS)) {
      const avg = (state.noiseBuffer.reduce((a, b) => a + b, 0) / state.noiseBuffer.length).toFixed(1);
      results.push(
        await persistAlarm(
          deviceId,
          ALARM_TYPES.NOISE_ANOMALY,
          ALARM_SEVERITY.HIGH,
          `Sustained noise level avg ${avg}dB detected for ${state.noiseBuffer.length} consecutive readings (threshold: ${THRESHOLDS.NOISE_DB}dB)`
        )
      );
    }
  }

  // Algorithm 7: Z-score anomaly detection on audio
  state.audioHistory.push(audioLevel);
  if (state.audioHistory.length > THRESHOLDS.ROLLING_WINDOW) {
    state.audioHistory.shift();
  }

  if (state.audioHistory.length >= 10) {
    const z = calculateZScore(state.audioHistory);
    if (Math.abs(z) > THRESHOLDS.ZSCORE_THRESHOLD) {
      const key = `ZSCORE_${ALARM_TYPES.NOISE_ANOMALY}`;
      if (await canCreateAlarm(deviceId, key, 2 * 60 * 1000)) {
        results.push(
          await persistAlarm(
            deviceId,
            ALARM_TYPES.NOISE_ANOMALY,
            ALARM_SEVERITY.MEDIUM,
            `Statistically anomalous audio spike detected (z-score: ${z.toFixed(2)}, current: ${audioLevel}dB)`
          )
        );
      }
    }
  }

  return results;
}

// ----- Algorithm 2: Unusual movement (accel magnitude > 20 for 3+ readings ≈ 5s) -----
async function analyzeMovement(deviceId, accelerometer) {
  if (!accelerometer) return [];
  const state = getState(deviceId);

  const mag = Math.sqrt(
    (accelerometer.x || 0) ** 2 +
    (accelerometer.y || 0) ** 2 +
    (accelerometer.z || 0) ** 2
  );

  if (mag > THRESHOLDS.ACCEL_MAGNITUDE) {
    state.movementBuffer.push(mag);
  } else {
    state.movementBuffer = [];
  }

  if (state.movementBuffer.length >= THRESHOLDS.MOVEMENT_CONSECUTIVE) {
    if (await canCreateAlarm(deviceId, ALARM_TYPES.UNUSUAL_MOVEMENT, THRESHOLDS.ALARM_COOLDOWN_MS)) {
      return [
        await persistAlarm(
          deviceId,
          ALARM_TYPES.UNUSUAL_MOVEMENT,
          ALARM_SEVERITY.MEDIUM,
          `Unusual movement: acceleration magnitude ${mag.toFixed(2)} m/s² sustained for ${state.movementBuffer.length} readings (~${state.movementBuffer.length * 2}s)`
        )
      ];
    }
  }

  return [];
}

// ----- Algorithm 3: Crowd density (>15 devices within 50m) -----
async function analyzeCrowdDensity(deviceId, gps) {
  if (!gps || gps.lat == null || gps.lng == null) return [];

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Get distinct devices that reported recently (excluding self)
  const recentDeviceIds = await SensorData.find({
    timestamp: { $gte: fiveMinAgo },
    deviceId: { $ne: deviceId }
  }).distinct('deviceId');

  let nearbyCount = 0;

  // Check each device's latest GPS reading
  await Promise.all(
    recentDeviceIds.map(async (otherId) => {
      const latest = await SensorData.findOne({ deviceId: otherId })
        .sort({ timestamp: -1 })
        .select('sensors.gps');
      if (latest?.sensors?.gps?.lat != null) {
        const dist = haversineDistance(
          gps.lat,
          gps.lng,
          latest.sensors.gps.lat,
          latest.sensors.gps.lng
        );
        if (dist <= THRESHOLDS.CROWD_RADIUS_M) nearbyCount++;
      }
    })
  );

  if (nearbyCount > THRESHOLDS.CROWD_COUNT) {
    if (await canCreateAlarm(deviceId, ALARM_TYPES.CROWD_DENSITY, THRESHOLDS.CROWD_COOLDOWN_MS)) {
      return [
        await persistAlarm(
          deviceId,
          ALARM_TYPES.CROWD_DENSITY,
          ALARM_SEVERITY.HIGH,
          `Crowd density alert: ${nearbyCount} active devices within ${THRESHOLDS.CROWD_RADIUS_M}m radius (threshold: ${THRESHOLDS.CROWD_COUNT})`
        )
      ];
    }
  }

  return [];
}

// ----- Algorithm 4: Restricted zone check (DB + sabit zone'lar) -----
async function analyzeRestrictedZone(deviceId, gps, zones) {
  if (!gps || gps.lat == null || gps.lng == null) return [];
  const results = [];

  // 'safe' türündeki zone'lar alarm tetiklemez
  const alarmZones = zones.filter(z => z.type !== 'safe');

  const SEVERITY_MAP = {
    critical: ALARM_SEVERITY.CRITICAL,
    restricted: ALARM_SEVERITY.CRITICAL,
    lab: ALARM_SEVERITY.HIGH,
    emergency: ALARM_SEVERITY.HIGH
  };

  for (const zone of alarmZones) {
    if (pointInPolygon(gps.lat, gps.lng, zone.polygon)) {
      const key = `${ALARM_TYPES.RESTRICTED_ZONE}_${zone.name}`;
      if (await canCreateAlarm(deviceId, key, THRESHOLDS.RESTRICTED_COOLDOWN_MS)) {
        const severity = SEVERITY_MAP[zone.type] || ALARM_SEVERITY.HIGH;
        const typeLabel = zone.type === 'critical' ? 'kritik alan' : zone.type === 'lab' ? 'laboratuvar' : zone.type === 'emergency' ? 'acil toplanma noktası' : 'yasak bölge';
        results.push(
          await persistAlarm(
            deviceId,
            ALARM_TYPES.RESTRICTED_ZONE,
            severity,
            `Cihaz "${zone.name}" ${typeLabel}na girdi — GPS: (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`
          )
        );
      }
    }
  }

  return results;
}

// ----- Algorithm 5: Device offline check (run periodically) -----
async function checkOfflineDevices() {
  const cutoff = new Date(Date.now() - THRESHOLDS.OFFLINE_MINUTES * 60 * 1000);

  const offlineDevices = await Device.find({
    status: 'active',
    lastSeen: { $lt: cutoff }
  });

  const alarms = [];

  for (const device of offlineDevices) {
    await Device.findByIdAndUpdate(device._id, { status: 'inactive' });

    const alarm = new Alarm({
      deviceId: device._id,
      type: ALARM_TYPES.DEVICE_OFFLINE,
      severity: ALARM_SEVERITY.MEDIUM,
      message: `Device "${device.name}" has been offline for more than ${THRESHOLDS.OFFLINE_MINUTES} minutes`
    });
    await alarm.save();
    alarms.push(alarm);
    logger.warn(`Device ${device.deviceId} marked offline`);
  }

  return alarms;
}

// ----- Main entry point: analyze incoming sensor data -----
async function analyzeData(deviceId, sensors) {
  try {
    const zones = await getActiveZones();

    const [noiseAlarms, movementAlarms, crowdAlarms, restrictedAlarms] = await Promise.all([
      analyzeNoise(deviceId, sensors.audioLevel),
      analyzeMovement(deviceId, sensors.accelerometer),
      analyzeCrowdDensity(deviceId, sensors.gps),
      analyzeRestrictedZone(deviceId, sensors.gps, zones)
    ]);

    const alarms = [
      ...noiseAlarms,
      ...movementAlarms,
      ...crowdAlarms,
      ...restrictedAlarms
    ];

    const riskScore = calculateRiskScore(sensors, zones);

    return { alarms, riskScore };
  } catch (err) {
    logger.error('Anomaly analysis error:', err);
    return { alarms: [], riskScore: 0 };
  }
}

module.exports = {
  analyzeData,
  checkOfflineDevices,
  calculateRiskScore,
  invalidateZoneCache
};
