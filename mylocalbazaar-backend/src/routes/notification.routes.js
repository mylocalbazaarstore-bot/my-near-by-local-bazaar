// src/routes/notification.routes.js
// ─────────────────────────────────────────────────────────────
// Notification Routes — /api/v1/notifications
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { authenticate, authorize, restrictToAdminIPs } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/notifications/notification.controller');

// All users (customer | merchant | delivery_partner | admin)
router.use(authenticate);

router.get('/',                      ctrl.listNotifications);
router.get('/unread-count',          ctrl.getUnreadCount);
router.patch('/read-all',            ctrl.markAllRead);
router.post('/register-token',       ctrl.registerToken);
router.patch('/:id/read',            ctrl.markRead);
router.delete('/:id',                ctrl.deleteNotification);

// Admin only
router.post('/admin/campaign',
  restrictToAdminIPs,
  authorize('admin'),
  ctrl.sendCampaign
);

router.post('/admin/broadcast',
  restrictToAdminIPs,
  authorize('admin'),
  ctrl.broadcastToRole
);

router.post('/admin/test-push',
  restrictToAdminIPs,
  authorize('admin'),
  ctrl.testPush
);

module.exports = router;
