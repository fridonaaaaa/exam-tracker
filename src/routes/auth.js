const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { register, login, logout, me, updatePreferences } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

module.exports = router;
