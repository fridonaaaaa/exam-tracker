const https = require('https');
const CONFIG = require('../config');

function bogRequest(method, path, accessToken, body, isAuth = false) {
  return new Promise((resolve, reject) => {
    const bodyStr = isAuth ? new URLSearchParams(body).toString() : JSON.stringify(body);
    const headers = {
      'Content-Type': isAuth ? 'application/x-www-form-urlencoded' : 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    };
    if (isAuth) {
      const creds = Buffer.from(`${CONFIG.BOG_API_KEY}:${CONFIG.BOG_SECRET}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    } else if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const req = https.request({
      hostname: 'api.bog.ge',
      path: `/payments/v1${path}`,
      method,
      headers,
    }, (response) => {
      let data = '';
      response.on('data', d => data += d);
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = { bogRequest };
