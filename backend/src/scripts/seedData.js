'use strict';

const bcrypt = require('bcrypt');
const User = require('../models/User');
const Device = require('../models/Device');
const SensorData = require('../models/SensorData');
const Alarm = require('../models/Alarm');
const { ALARM_TYPES, ALARM_SEVERITY } = require('../constants');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;
const CAMPUS_LAT = 40.2167;
const CAMPUS_LNG = 29.0833;

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

function campusGPS(r = 0.003) {
  return {
    lat: parseFloat((CAMPUS_LAT + rand(-r / 111, r / 111)).toFixed(6)),
    lng: parseFloat((CAMPUS_LNG + rand(-r / 85,  r / 85)).toFixed(6))
  };
}

function makeSensors(scenario = 'normal') {
  let audio, mag;
  switch (scenario) {
    case 'noisy':    audio = rand(88, 105); mag = rand(1, 5);   break;
    case 'movement': audio = rand(40,  65); mag = rand(22, 35); break;
    case 'highrisk': audio = rand(80, 100); mag = rand(18, 28); break;
    default:         audio = rand(35,  65); mag = rand(0.5, 4); break;
  }
  const angle = Math.random() * 2 * Math.PI;
  return {
    accelerometer: { x: +(mag * Math.cos(angle)).toFixed(2), y: +(mag * Math.sin(angle)).toFixed(2), z: +rand(0.8, 1.2).toFixed(2) },
    gyroscope: { x: +rand(-1, 1).toFixed(3), y: +rand(-1, 1).toFixed(3), z: +rand(-1, 1).toFixed(3) },
    gps: { ...campusGPS(), accuracy: randInt(3, 15) },
    audioLevel: +audio.toFixed(1),
    networkStrength: randInt(40, 100)
  };
}

// Eski İngilizce isimleri Yapay Kaynak X ile güncelle
const DEVICE_RENAMES = {
  'Campus Gate North':   'Yapay Kaynak 1',
  'Library Entrance':    'Yapay Kaynak 2',
  'Engineering Block A': 'Yapay Kaynak 3',
  'Engineering Block B': 'Yapay Kaynak 4',
  'Student Cafeteria':   'Yapay Kaynak 5',
  'Sports Complex':      'Yapay Kaynak 6',
  'Parking Lot West':    'Yapay Kaynak 7',
  'Research Center':     'Yapay Kaynak 8'
};

async function runSeed() {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    // Cihaz isimlerini güncelle (eski isimler varsa)
    for (const [oldName, newName] of Object.entries(DEVICE_RENAMES)) {
      await Device.updateOne({ name: oldName }, { $set: { name: newName } });
    }
    logger.info('Seed skipped — data already exists');
    return;
  }

  logger.info('Seeding database...');

  const [adminHash, opHash, viewHash] = await Promise.all([
    bcrypt.hash('admin123', SALT_ROUNDS),
    bcrypt.hash('operator123', SALT_ROUNDS),
    bcrypt.hash('viewer123', SALT_ROUNDS)
  ]);

  const [admin, op1, op2] = await User.insertMany([
    { username: 'admin',     email: 'admin@btu.edu.tr',     passwordHash: adminHash, role: 'admin' },
    { username: 'operator1', email: 'operator1@btu.edu.tr', passwordHash: opHash,   role: 'operator' },
    { username: 'operator2', email: 'operator2@btu.edu.tr', passwordHash: opHash,   role: 'operator' },
    { username: 'viewer',    email: 'viewer@btu.edu.tr',    passwordHash: viewHash, role: 'viewer' }
  ]);

  const deviceDefs = [
    { deviceId: 'BTU-001', name: 'Campus Gate North',    owner: admin._id },
    { deviceId: 'BTU-002', name: 'Library Entrance',     owner: admin._id },
    { deviceId: 'BTU-003', name: 'Engineering Block A',  owner: op1._id },
    { deviceId: 'BTU-004', name: 'Engineering Block B',  owner: op1._id },
    { deviceId: 'BTU-005', name: 'Student Cafeteria',    owner: op2._id },
    { deviceId: 'BTU-006', name: 'Sports Complex',       owner: op2._id },
    { deviceId: 'BTU-007', name: 'Parking Lot West',     owner: admin._id },
    { deviceId: 'BTU-008', name: 'Research Center',      owner: op1._id }
  ];

  const devices = await Device.insertMany(
    deviceDefs.map((d) => ({
      ...d,
      location: campusGPS(),
      status: 'active',
      lastSeen: new Date(Date.now() - randInt(0, 5) * 60000),
      batteryLevel: randInt(30, 100)
    }))
  );

  const now = Date.now();
  const scenarios = ['normal', 'normal', 'normal', 'noisy', 'movement', 'highrisk'];
  const sensorDocs = Array.from({ length: 500 }, (_, i) => {
    const device = devices[i % devices.length];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    const sensors = makeSensors(scenario);
    const mag = Math.sqrt(sensors.accelerometer.x ** 2 + sensors.accelerometer.y ** 2 + sensors.accelerometer.z ** 2);
    const riskScore = Math.round(Math.min(
      (sensors.audioLevel / 130) * 35 + Math.min(mag / 30, 1) * 30 + (1 - sensors.networkStrength / 100) * 10,
      100
    ));
    return { deviceId: device._id, timestamp: new Date(now - randInt(0, 86400000)), sensors, riskScore };
  });
  await SensorData.insertMany(sensorDocs);

  const alarmTemplates = [
    { type: ALARM_TYPES.NOISE_ANOMALY,    severity: ALARM_SEVERITY.HIGH,     message: 'Sustained noise 92dB for 12 readings' },
    { type: ALARM_TYPES.NOISE_ANOMALY,    severity: ALARM_SEVERITY.MEDIUM,   message: 'Audio z-score anomaly (z=3.1)' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.MEDIUM,   message: 'Movement burst near Engineering A' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.HIGH,     message: 'High acceleration at Campus Gate' },
    { type: ALARM_TYPES.CROWD_DENSITY,    severity: ALARM_SEVERITY.HIGH,     message: '18 devices within 50m at Cafeteria' },
    { type: ALARM_TYPES.CROWD_DENSITY,    severity: ALARM_SEVERITY.CRITICAL, message: '25 devices clustered near Sports Complex' },
    { type: ALARM_TYPES.RESTRICTED_ZONE,  severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered "Server Room"' },
    { type: ALARM_TYPES.RESTRICTED_ZONE,  severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered "Research Lab"' },
    { type: ALARM_TYPES.DEVICE_OFFLINE,   severity: ALARM_SEVERITY.MEDIUM,   message: '"Parking Lot West" offline >10 min' },
    { type: ALARM_TYPES.DEVICE_OFFLINE,   severity: ALARM_SEVERITY.MEDIUM,   message: '"Research Center" offline >10 min' },
    { type: ALARM_TYPES.NOISE_ANOMALY,    severity: ALARM_SEVERITY.LOW,      message: 'Elevated noise at Sports Complex (78dB)' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.MEDIUM,   message: 'Sudden spike at Research Center' },
    { type: ALARM_TYPES.CROWD_DENSITY,    severity: ALARM_SEVERITY.MEDIUM,   message: '16 devices near Library Entrance' },
    { type: ALARM_TYPES.NOISE_ANOMALY,    severity: ALARM_SEVERITY.HIGH,     message: 'Audio z-score 2.8 at Engineering B' },
    { type: ALARM_TYPES.RESTRICTED_ZONE,  severity: ALARM_SEVERITY.CRITICAL, message: 'Device entered "Administrative Building"' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.LOW,      message: 'Minor anomaly at Parking Lot West' },
    { type: ALARM_TYPES.NOISE_ANOMALY,    severity: ALARM_SEVERITY.MEDIUM,   message: 'Noise burst at Cafeteria — 12 readings' },
    { type: ALARM_TYPES.CROWD_DENSITY,    severity: ALARM_SEVERITY.HIGH,     message: '20 devices near Campus Gate North' },
    { type: ALARM_TYPES.DEVICE_OFFLINE,   severity: ALARM_SEVERITY.LOW,      message: 'BTU-006 brief offline event' },
    { type: ALARM_TYPES.UNUSUAL_MOVEMENT, severity: ALARM_SEVERITY.HIGH,     message: 'Rapid movement — possible emergency at Eng A' }
  ];

  await Alarm.insertMany(
    alarmTemplates.map((t, i) => ({
      ...t,
      deviceId: devices[i % devices.length]._id,
      timestamp: new Date(now - randInt(0, 86400000)),
      resolved: i % 3 === 0,
      resolvedBy: i % 3 === 0 ? admin._id : null,
      resolvedAt: i % 3 === 0 ? new Date(now - randInt(0, 43200000)) : null
    }))
  );

  logger.info('Seed complete — 4 users, 8 devices, 500 sensor records, 20 alarms');
  logger.info('Login: admin@btu.edu.tr / admin123');
}

module.exports = runSeed;
