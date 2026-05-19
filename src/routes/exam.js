const router = require('express').Router();
const { requireAuth, requireSubscription } = require('../middleware/auth');
const { getCenters, getAllSlots } = require('../controllers/examController');

router.get('/centers', requireAuth, requireSubscription, getCenters);
router.get('/all-slots', requireAuth, requireSubscription, getAllSlots);

module.exports = router;
