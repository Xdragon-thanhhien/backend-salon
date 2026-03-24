// providers/payment/momo.provider.js
'use strict';

const axios  = require('axios');
const crypto = require('crypto');

const MOMO_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://payment.momo.vn'
  : 'https://test-payment.momo.vn';

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE;
const ACCESS_KEY   = process.env.MOMO_ACCESS_KEY;
const SECRET_KEY   = process.env.MOMO_SECRET_KEY;

/**
 * Creates HMAC-SHA256 signature for MoMo request.
 */
function _createSignature(rawSignature) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(rawSignature)
    .digest('hex');
}

/**
 * MoMo Payment Provider (Vietnam)
 * Docs: https://developers.momo.vn
 */
const MoMoProvider = {
  name: 'momo',

  /**
   * Creates a MoMo payment request.
   * @param {Object} payload - { amount, orderId, orderInfo, redirectUrl, ipnUrl }
   * @returns {Promise<Object>} { payUrl, deeplink, qrCodeUrl }
   */
  async createPayment({ amount, orderId, orderInfo, redirectUrl, ipnUrl }) {
    const requestId = `${PARTNER_CODE}_${Date.now()}`;
    const requestType = 'payWithMethod';
    const extraData   = '';

    const rawSignature = [
      `accessKey=${ACCESS_KEY}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${PARTNER_CODE}`,
      `redirectUrl=${redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`
    ].join('&');

    const signature = _createSignature(rawSignature);

    const { data } = await axios.post(
      `${MOMO_BASE_URL}/v2/gateway/api/create`,
      {
        partnerCode: PARTNER_CODE,
        accessKey:   ACCESS_KEY,
        requestId,
        amount,
        orderId,
        orderInfo,
        redirectUrl,
        ipnUrl,
        requestType,
        extraData,
        signature,
        lang: 'vi'
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      payUrl:    data.payUrl,
      deeplink:  data.deeplink,
      qrCodeUrl: data.qrCodeUrl,
      requestId,
      resultCode: data.resultCode
    };
  },

  /**
   * Verifies MoMo IPN (Instant Payment Notification) callback signature.
   * @param {Object} payload - IPN body from MoMo
   * @returns {boolean}
   */
  verifyCallback(payload) {
    const {
      accessKey, amount, extraData, message,
      orderId, orderInfo, orderType, partnerCode,
      payType, requestId, responseTime, resultCode, transId
    } = payload;

    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `message=${message}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `orderType=${orderType}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType}`,
      `requestId=${requestId}`,
      `responseTime=${responseTime}`,
      `resultCode=${resultCode}`,
      `transId=${transId}`
    ].join('&');

    const expectedSignature = _createSignature(rawSignature);
    return expectedSignature === payload.signature;
  },

  /**
   * Refunds a MoMo transaction.
   * @param {Object} payload - { orderId, requestId, amount, transId, description }
   * @returns {Promise<Object>}
   */
  async refund({ orderId, requestId, amount, transId, description }) {
    const rawSignature = [
      `accessKey=${ACCESS_KEY}`,
      `amount=${amount}`,
      `description=${description}`,
      `orderId=${orderId}`,
      `partnerCode=${PARTNER_CODE}`,
      `requestId=${requestId}`,
      `transId=${transId}`
    ].join('&');

    const signature = _createSignature(rawSignature);

    const { data } = await axios.post(
      `${MOMO_BASE_URL}/v2/gateway/api/refund`,
      {
        partnerCode: PARTNER_CODE,
        accessKey: ACCESS_KEY,
        requestId,
        orderId,
        transId,
        amount,
        description,
        signature,
        lang: 'vi'
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return { resultCode: data.resultCode, message: data.message };
  }
};

module.exports = MoMoProvider;
