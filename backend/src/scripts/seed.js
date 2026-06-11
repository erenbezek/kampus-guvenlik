require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Device = require('../models/Device');
const SensorData = require('../models/SensorData');
const Alarm = require('../models/Alarm');
const { ALARM_TYPES, ALARM_SEVERITY } = require('../constants');

const SALT_ROUNDS = 12;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_safety';

// Bursa Technical University campus area (~40.2167, 29.0833)
const CAMPUS_LAT = 40.2167;
const CAMPUS_LNG = 29.0833;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function campusGPS(radiusKm = 0.3) {
  const lat = CAMPUS_LAT + randomBetween(-radiusKm / 111, radiusKm / 111);
  const lng = CAMPUS_LNG + randomBetween(-radiusKm / 85, radiusKm / 85);
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

function generateSensorReading(scenario = 'normal') {
  const gps = campusGPS();
  let audioLevel, accelMag;

  switch (scenario) {
    case 'noisy':
      audioLevel = randomBetween(88, 105);
      accelMag = randomBetween(2, 8);
      break;
    case 'movement':
      audioLevel = randomBetween(40, 60);
      accelMag = randomBetween(22, 35);
      break;
    case 'high_risk':
      audioLevel = randomBetween(80, 100);
      accelMag = randomBetween(18, 30);
      break;
    default:
      audioLevel = randomBetween(35, 65);
      accelMag = randomBetween(0.5, 5);
  }

  const accelDir = Math.random() * 2 * Math.PI;
  const x = parseFloat((accelMag * Math.cos(accelDir)).toFixed(2));
  const y = parseFloat((accelMag * Math.sin(accelDir)).toFixed(2));
  const z = parseFloat(randomBetween(0.5, 2).toFixed(2));

  return {
    accelerometer: { x, y, z },
    gyroscope: {
      x: parseFloat(randomBetween(-2, 2).toFixed(3)),
      y: parseFloat(randomBetween(-2, 2).toFixed(3)),
      z: parseFloat(randomBetween(-2, 2).toFixed(3))
    },
    gps: { ...gps, accuracy: randomInt(3, 15) },
    audioLevel: parseFloat(audioLevel.toFixed(1)),
    networkStrength: randomInt(40, 100)
  };
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Device.deleteMany({}),
    SensorData.deleteMany({}),
    Alarm.deleteMany({})
  ]);
  console.log('Cleared existing data');

  // ── Users ──────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  const opHash = await bcrypt.hash('operator123', SALT_ROUNDS);
  const viewHash = await bcrypt.hash('viewer123', SALT_ROUNDS);

  const [admin, op1, op2, viewer] = await User.insertMany([
    { username: 'admin', email: 'admin@btu.edu.tr', passwordHash: adminHash, role: 'admin' },
    { username: 'operator1', email: 'operator1@btu.edu.tr', passwordHash: opHash, role: 'operator' },
    { username: 'operator2', email: 'operator2@btu.edu.tr', passwordHash: opHash, role: 'operator' },
    { username: 'viewer', email: 'viewer@btu.edu.tr', passwordHash: viewHash, role: 'viewer' }
  ]);
  console.log(`Created ${4} users`);

  // ── Devices ────────────────────────────────────────────────────────────
  const deviceDefs = [
    { deviceId: 'BTU-001', name: 'Yapay Kaynak 1', owner: admin._id },
    { deviceId: 'BTU-002', name: 'Yapay Kaynak 2', owner: admin._id },
    { deviceId: 'BTU-003', name: 'Yapay Kaynak 3', owner: op1._id },
    { deviceId: 'BTU-004', name: 'Yapay Kaynak 4', owner: op1._id },
    { deviceId: 'BTU-005', name: 'Yapay Kaynak 5', owner: op2._id },
    { deviceId: 'BTU-006', name: 'Yapay Kaynak 6', owner: op2._id },
    { deviceId: 'BTU-007', name: 'Yapay Kaynak 7', owner: admin._id },
    { deviceId: 'BTU-008', name: 'Yapay Kaynak 8', owner: op1._id }
  ];

  const devices = await Device.insertMany(
    deviceDefs.map((d) => ({
      ...d,
      location: campusGPS(),
      status: 'active',
      lastSeen: new Date(Date.now() - randomInt(0, 5) * 60 * 1000),
      batteryLevel: randomInt(30, 100)
    }))
  );
  console.log(`Created ${devices.length} devices`);

  // ── Sensor Data (500 records, last 24h) ────────────────────────────────
  const now = Date.now();
  const sensorDocs = [];
  const scenarios = ['normal', 'normal', 'normal', 'noisy', 'movement', 'high_risk'];

  for (let i = 0; i < 500; i++) {
    const device = devices[i % devices.length];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    const sensors = generateSensorReading(scenario);
    const mag = Math.sqrt(sensors.accelerometer.x ** 2 + sensors.accelerometer.y ** 2 + sensors.accelerometer.z ** 2);
    const riskScore = Math.round(
      Math.min(
        (sensors.audioLevel / 130) * 35 +
        Math.min(mag / 30, 1) * 30 +
        (1 - sensors.networkStrength / 100) * 10,
        100
      )
    );
    sensorDocs.push({
      deviceId: device._id,
      timestamp: new Date(now - randomInt(0, 24 * 60 * 60 * 1000)),
      sensors,
      riskScore
    });
  }

  await SensorData.insertMany(sensorDocs);
  console.log(`Created ${sensorDocs.length} sensor records`);

  // ── Alarms (20 sample) ─────────────────────────────────────────────────
  const alarmTemplates = [
    { type: ALARM_TYPES.NOISE_ANOMALY, severity: ALARM_SEVERITY.HIGH, message: 'Sustained noise above 85dB at Library Entrance' },
    { type: ALARM_TYPES.NOISE_ANOMALY, severity: ALARM_SEVERITY.MEDIUM, message: 'Statistically anomalous audio spike detected (z-score: 3.1)' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.MEDIUM, message: 'Unusual movement pattern near Engineering Building A' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.HIGH, message: 'High acceleration burst detected at Campus Gate North' },
    { type: ALARM_TYPES.CROWD_DENSITY, severity: ALARM_SEVERITY.HIGH, message: 'Crowd density alert: 18 devices within 50m at Student Cafeteria' },
    { type: ALARM_TYPES.CROWD_DENSITY, severity: ALARM_SEVERITY.CRITICAL, message: 'Extreme crowd density: 25 devices within 50m near Sports Complex' },
    { type: ALARM_TYPES.RESTRICTED_ZONE, severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered restricted zone: "Server Room"' },
    { type: ALARM_TYPES.RESTRICTED_ZONE, severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered restricted zone: "Research Lab"' },
    { type: ALARM_TYPES.DEVICE_OFFLINE, severity: ALARM_SEVERITY.MEDIUM, message: 'Device "Parking Lot West" offline for >10 minutes' },
    { type: ALARM_TYPES.DEVICE_OFFLINE, severity: ALARM_SEVERITY.MEDIUM, message: 'Device "Research Center" offline for >10 minutes' },
    { type: ALARM_TYPES.NOISE_ANOMALY, severity: ALARM_SEVERITY.LOW, message: 'Elevated noise level at Sports Complex (78dB avg)' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.MEDIUM, message: 'Sudden movement spike at Research Center' },
    { type: ALARM_TYPES.CROWD_DENSITY, severity: ALARM_SEVERITY.MEDIUM, message: '16 devices detected near Library Entrance' },
    { type: ALARM_TYPES.NOISE_ANOMALY, severity: ALARM_SEVERITY.HIGH, message: 'Audio z-score 2.8 — anomalous at Engineering Building B' },
    { type: ALARM_TYPES.RESTRICTED_ZONE, severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered restricted zone: "Administrative Building"' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.LOW, message: 'Minor movement anomaly at Parking Lot West' },
    { type: ALARM_TYPES.NOISE_ANOMALY, severity: ALARM_SEVERITY.MEDIUM, message: 'Noise burst at Student Cafeteria — 12 consecutive readings' },
    { type: ALARM_TYPES.CROWD_DENSITY, severity: ALARM_SEVERITY.HIGH, message: '20 devices clustered near Campus Gate North' },
    { type: ALARM_TYPES.DEVICE_OFFLINE, severity: ALARM_SEVERITY.LOW, message: 'Device "BTU-006" went offline briefly' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.HIGH, message: 'Rapid movement sequence — possible emergency at Engineering A' }
  ];

  const alarmDocs = alarmTemplates.map((tmpl, i) => ({
    ...tmpl,
    deviceId: devices[i % devices.length]._id,
    timestamp: new Date(now - randomInt(0, 24 * 60 * 60 * 1000)),
    resolved: i % 3 === 0,
    resolvedBy: i % 3 === 0 ? admin._id : null,
    resolvedAt: i % 3 === 0 ? new Date(now - randomInt(0, 12 * 60 * 60 * 1000)) : null
  }));

  await Alarm.insertMany(alarmDocs);
  console.log(`Created ${alarmDocs.length} alarms`);

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────');
  console.log('Login credentials:');
  console.log('  Admin:    admin@btu.edu.tr    / admin123');
  console.log('  Operator: operator1@btu.edu.tr / operator123');
  console.log('  Viewer:   viewer@btu.edu.tr    / viewer123');
  console.log('─────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
