const router = require('express').Router();
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createPayment, paymentCallback } = require('../controllers/paymentController');

router.post('/create', requireAuth, createPayment);
router.post('/callback', express.json(), paymentCallback);

module.exports = router;
