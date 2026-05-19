const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getUsers, activateUser, deactivateUser, getSlotEvents } = require('../controllers/adminController');

router.get('/users', requireAuth, getUsers);
router.post('/activate', requireAuth, activateUser);
router.post('/deactivate', requireAuth, deactivateUser);
router.get('/slot-events', requireAuth, getSlotEvents);

module.exports = router;
