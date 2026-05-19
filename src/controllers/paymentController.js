const { getDb } = require('../db');
const CONFIG = require('../config');
const { bogRequest } = require('../services/bogService');

async function createPayment(req, res) {
  const orderId = `SUB-${req.personalId}-${Date.now()}`;
  try {
    const tokenRes = await bogRequest('POST', '/auth/token', null, { grant_type: 'client_credentials' }, true);

    if (!tokenRes.access_token) {
      return res.json({
        demoMode: true,
        orderId,
        message: 'BOG_NOT_CONFIGURED',
        manualPaymentInfo: {
          bankAccount: 'GE00BG0000000000000000',
          amount: '10.00 GEL',
          reference: orderId,
          note: 'BOG API გასაღები არ არის დაყენებული.'
        }
      });
    }

    const order = await bogRequest('POST', '/ecommerce/orders', tokenRes.access_token, {
      callback_url: `${CONFIG.APP_URL}/api/payment/callback`,
      purchase_units: [{
        amount: { currency_code: 'GEL', value: CONFIG.SUBSCRIPTION_PRICE.toString() },
        description: 'გამოცდის ტრეკერი — 1 თვის გამოწერა',
      }],
      redirect_urls: {
        success: `${CONFIG.APP_URL}?payment=success`,
        fail: `${CONFIG.APP_URL}?payment=fail`,
      },
      metadata: { order_id: orderId, personal_id: req.personalId }
    });

    await getDb().collection('users').updateOne(
      { personalId: req.personalId },
      { $set: { lastPaymentId: order.id } }
    );

    res.json({ redirectUrl: order._links?.redirect?.href, orderId: order.id });
  } catch (err) {
    console.error('BOG payment error:', err.message);
    res.json({
      demoMode: true,
      orderId,
      manualPaymentInfo: {
        bankAccount: 'GE00BG0000000000000000',
        amount: '10.00 GEL',
        reference: orderId,
        note: 'გადახდის შემდეგ ადმინი გააქტიურებს გამოწერას 24 საათის განმავლობაში.'
      }
    });
  }
}

async function paymentCallback(req, res) {
  res.json({ ok: true });
  const { order_id, status, metadata } = req.body;

  if (status === 'completed' && metadata?.personal_id) {
    await getDb().collection('users').updateOne(
      { personalId: metadata.personal_id },
      {
        $set: {
          subscriptionActive: true,
          subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lastPaymentId: order_id,
        }
      }
    );
  }
}

module.exports = { createPayment, paymentCallback };
