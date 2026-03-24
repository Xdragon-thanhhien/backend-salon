// providers/payment/zalopay.provider.js
'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const moment = require('moment');

const ZALOPAY_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://openapi.zalopay.vn'
  : 'https://sb-openapi.zalopay.vn';

const APP_ID     = process.env.ZALOPAY_APP_ID;
const KEY1       = process.env.ZALOPAY_KEY1;
const KEY2       = process.env.ZALOPAY_KEY2;

/**
 * Creates HMAC-SHA256 signature for ZaloPay request.
 */
function _createSignature(data, key) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * ZaloPay Payment Provider (Vietnam)
 * Docs: https://docs.zalopay.vn
 */
const ZaloPayProvider = {
  name: 'zalopay',

  /**
   * Creates a ZaloPay order.
   * @param {Object} payload - { amount, description, callbackUrl, items }
   * @returns {Promise<Object>} { orderUrl, zpTransToken, qrCode }
   */
  async createOrder({ amount, description, callbackUrl, items = [] }) {
    const transId = Math.floor(Math.random() * 1000000);
    const appTransId = `${moment().format('YYMMDD')}_${transId}`;

    const order = {
      app_id:       APP_ID,
      app_trans_id: appTransId,
      app_user:     'barbershop_user',
      app_time:     Date.now(),
      item:         JSON.stringify(items),
      embed_data:   JSON.stringify({ redirecturl: callbackUrl }),
      amount,
      description,
      bank_code:    '',
      callback_url: callbackUrl
    };

    // MAC = hmac(app_id|app_trans_id|app_user|amount|app_time|embed_data|item)
    const macData = [
      order.app_id,
      order.app_trans_id,
      order.app_user,
      order.amount,
      order.app_time,
      order.embed_data,
      order.item
    ].join('|');

    order.mac = _createSignature(macData, KEY1);

    const { data } = await axios.post(
      `${ZALOPAY_BASE_URL}/v2/create`,
      order,
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      orderUrl:    data.order_url,
      zpTransToken: data.zp_trans_token,
      qrCode:      data.qr_code,
      appTransId,
      returnCode:  data.return_code
    };
  },

  /**
   * Verifies ZaloPay callback signature.
   * @param {Object} payload - Callback body from ZaloPay
   * @returns {boolean}
   */
  verifyCallback({ data: cbData, mac }) {
    const expectedMac = _createSignature(cbData, KEY2);
    return expectedMac === mac;
  },

  /**
   * Refunds a ZaloPay transaction.
   * @param {Object} payload - { zpTransId, amount, description }
   * @returns {Promise<Object>}
   */
  async refund({ zpTransId, amount, description }) {
    const timestamp = Date.now();
    const uid = `${timestamp}${Math.floor(Math.random() * 1000)}`;

    const macData = `${APP_ID}|${zpTransId}|${amount}|${description}|${timestamp}`;
    const mac = _createSignature(macData, KEY1);

    const { data } = await axios.post(
      `${ZALOPAY_BASE_URL}/v2/refund`,
      {
        app_id:     APP_ID,
        m_refund_id: `${moment().format('YYMMDD')}_${APP_ID}_${uid}`,
        timestamp,
        zp_trans_id: zpTransId,
        amount,
        description,
        mac
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return { returnCode: data.return_code, returnMessage: data.return_message };
  }
};

module.exports = ZaloPayProvider;
