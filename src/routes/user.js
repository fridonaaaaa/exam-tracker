const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { updatePreferences } = require('../controllers/authController');

router.put('/preferences', requireAuth, updatePreferences);

module.exports = router;
