const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const Device = require('../models/Device');
const { authenticate, authorize, isAdminOrOwner } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === ROLES.ADMIN ? {} : { owner: req.user._id };
    const devices = await Device.find(filter)
      .populate('owner', 'username email role')
      .sort({ lastSeen: -1 });
    return res.json({ success: true, data: devices });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
});

router.post(
  '/',
  [
    body('deviceId').trim().notEmpty().withMessage('Device ID required'),
    body('name').trim().notEmpty().withMessage('Device name required'),
    body('location.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
  ],
  validate,
  async (req, res) => {
    try {
      const { deviceId, name, location } = req.body;

      const existing = await Device.findOne({ deviceId });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Device ID already registered' });
      }

      const device = new Device({ deviceId, name, owner: req.user._id, location });
      await device.save();
      return res.status(201).json({ success: true, data: device });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to register device' });
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const device = await Device.findById(req.params.id).populate('owner', 'username email');
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    if (!isAdminOrOwner(device.owner._id, req)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({ success: true, data: device });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch device' });
  }
});

router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('batteryLevel').optional().isInt({ min: 0, max: 100 }).withMessage('Battery 0-100'),
    body('location.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
  ],
  validate,
  async (req, res) => {
    try {
      const device = await Device.findById(req.params.id);
      if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

      if (!isAdminOrOwner(device.owner, req)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const { name, location, batteryLevel, status } = req.body;
      if (name !== undefined) device.name = name;
      if (location !== undefined) device.location = location;
      if (batteryLevel !== undefined) device.batteryLevel = batteryLevel;
      if (status !== undefined && req.user.role === ROLES.ADMIN) device.status = status;

      await device.save();
      return res.json({ success: true, data: device });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to update device' });
    }
  }
);

// Mobil çıkış: cihazı hemen offline yap
router.patch('/:deviceId/deactivate', async (req, res) => {
  try {
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId, owner: req.user._id },
      { status: 'inactive' },
      { new: true }
    );
    if (!device) return res.status(404).json({ success: false, error: 'Cihaz bulunamadı' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Cihaz devre dışı bırakılamadı' });
  }
});

router.delete('/:id', authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const device = await Device.findByIdAndDelete(req.params.id);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });
    return res.json({ success: true, data: { message: 'Device deleted successfully' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete device' });
  }
});

router.get('/:id/status', async (req, res) => {
  try {
    const device = await Device.findById(req.params.id).select('status lastSeen batteryLevel deviceId name');
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });
    return res.json({ success: true, data: device });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch device status' });
  }
});

module.exports = router;
