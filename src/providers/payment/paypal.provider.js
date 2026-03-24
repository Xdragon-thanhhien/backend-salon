// providers/payment/paypal.provider.js
'use strict';

const axios = require('axios');

const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Gets a PayPal OAuth access token.
 * @returns {Promise<string>} Bearer access token
 */
async function _getAccessToken() {
  const { data } = await axios.post(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_CLIENT_SECRET
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  return data.access_token;
}

/**
 * PayPal Payment Provider
 * Docs: https://developer.paypal.com/docs/api/orders/v2
 */
const PayPalProvider = {
  name: 'paypal',

  /**
   * Creates a PayPal order.
   * @param {Object} payload - { amount, currency, returnUrl, cancelUrl }
   * @returns {Promise<Object>} { orderId, approveUrl }
   */
  async createOrder({ amount, currency = 'USD', returnUrl, cancelUrl }) {
    const token = await _getAccessToken();

    const { data } = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency.toUpperCase(),
            value: amount.toFixed(2)
          }
        }],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      },
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const approveUrl = data.links.find(l => l.rel === 'approve')?.href;

    return {
      orderId:    data.id,
      approveUrl,
      status:     data.status
    };
  },

  /**
   * Captures (charges) a PayPal order after customer approves.
   * @param {string} orderId
   * @returns {Promise<Object>}
   */
  async captureOrder(orderId) {
    const token = await _getAccessToken();

    const { data } = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    return {
      captureId: data.purchase_units[0]?.payments?.captures[0]?.id,
      status:    data.status
    };
  },

  /**
   * Refunds a captured PayPal payment.
   * @param {string} captureId
   * @returns {Promise<Object>}
   */
  async refund(captureId) {
    const token = await _getAccessToken();

    const { data } = await axios.post(
      `${PAYPAL_BASE_URL}/v2/payments/captures/${captureId}/refund`,
      {},
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    return { refundId: data.id, status: data.status };
  }
};

module.exports = PayPalProvider;
