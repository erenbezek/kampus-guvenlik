'use strict';
/**
 * CLI seed wrapper — `npm run seed`
 * FORCE_RESEED=true npm run seed  →  DB'yi sıfırlayıp yeniden doldurur
 * Tüm mantık seedData.js içinde; bu dosya bağımsız CLI çalışmasını sağlar.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const runSeed = require('./seedData');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_safety';

async function main() {
  await mongoose.connect(MONGO_URI);
  logger.info('MongoDB bağlandı — seed başlatılıyor...');

  if (process.env.FORCE_RESEED === 'true') {
    await mongoose.connection.dropDatabase();
    logger.info('Veritabanı temizlendi (FORCE_RESEED=true)');
  }

  await runSeed();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed hatası:', err.message);
  process.exit(1);
});
