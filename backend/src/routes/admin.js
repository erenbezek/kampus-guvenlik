const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const InviteCode = require('../models/InviteCode');
const Zone = require('../models/Zone');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants');
const { invalidateZoneCache } = require('../services/anomalyDetector');

router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

// Yeni davet kodu oluştur
router.post('/invite-codes', async (req, res) => {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // Örn: A3F7B2C1
    const invite = new InviteCode({ code, createdBy: req.user._id });
    await invite.save();
    return res.status(201).json({ success: true, data: { code } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Kod oluşturulamadı' });
  }
});

// Tüm davet kodlarını listele
router.get('/invite-codes', async (req, res) => {
  try {
    const codes = await InviteCode.find()
      .sort({ createdAt: -1 })
      .populate('usedBy', 'username email');
    return res.json({ success: true, data: codes });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Kodlar alınamadı' });
  }
});

// Kodu sil/iptal et
router.delete('/invite-codes/:code', async (req, res) => {
  try {
    const invite = await InviteCode.findOneAndDelete({ code: req.params.code, isUsed: false });
    if (!invite) return res.status(404).json({ success: false, error: 'Kod bulunamadı veya zaten kullanılmış' });
    return res.json({ success: true, data: { message: 'Kod iptal edildi' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Kod silinemedi' });
  }
});

// ── Kullanıcı Listesi ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ role: 1, username: 1 });
    return res.json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Kullanıcılar yüklenemedi' });
  }
});

// ── Zone Yönetimi ──────────────────────────────────────────────────────────

const ZONE_COLORS = {
  critical: '#dc2626',
  restricted: '#ea580c',
  lab: '#d97706',
  safe: '#16a34a',
  emergency: '#9333ea'
};

router.get('/zones', async (req, res) => {
  try {
    const zones = await Zone.find().sort({ createdAt: -1 }).populate('createdBy', 'username');
    return res.json({ success: true, data: zones });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Bölgeler alınamadı' });
  }
});

router.post('/zones', async (req, res) => {
  try {
    const { name, type, description, polygon } = req.body;
    if (!name || !polygon || polygon.length < 3) {
      return res.status(400).json({ success: false, error: 'Ad ve en az 3 noktalı polygon gerekli' });
    }
    const color = ZONE_COLORS[type] || '#ef4444';
    const zone = new Zone({ name, type: type || 'restricted', color, description, polygon, createdBy: req.user._id });
    await zone.save();
    invalidateZoneCache();
    return res.status(201).json({ success: true, data: zone });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Bölge oluşturulamadı' });
  }
});

router.put('/zones/:id', async (req, res) => {
  try {
    const { name, type, description, polygon } = req.body;
    const color = ZONE_COLORS[type] || '#ef4444';
    const zone = await Zone.findByIdAndUpdate(
      req.params.id,
      { name, type, color, description, polygon },
      { new: true }
    );
    if (!zone) return res.status(404).json({ success: false, error: 'Bölge bulunamadı' });
    return res.json({ success: true, data: zone });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Bölge güncellenemedi' });
  }
});

router.delete('/zones/:id', async (req, res) => {
  try {
    const zone = await Zone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ success: false, error: 'Bölge bulunamadı' });
    invalidateZoneCache();
    return res.json({ success: true, data: { message: 'Bölge silindi' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Bölge silinemedi' });
  }
});

module.exports = router;
