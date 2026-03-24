// providers/payment/stripe.provider.js
'use strict';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Stripe Payment Provider
 * Docs: https://stripe.com/docs/api
 */
const StripeProvider = {
  name: 'stripe',

  /**
   * Creates a payment intent (client confirms on frontend).
   * @param {Object} payload - { amount, currency, metadata }
   * @returns {Promise<Object>} { clientSecret, paymentIntentId }
   */
  async createPaymentIntent({ amount, currency = 'usd', metadata = {} }) {
    const intent = await stripe.paymentIntents.create({
      amount:   Math.round(amount * 100), // Stripe uses smallest currency unit
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: { enabled: true }
    });

    return {
      clientSecret:    intent.client_secret,
      paymentIntentId: intent.id,
      status:          intent.status
    };
  },

  /**
   * Verifies Stripe webhook signature (for server-to-server confirmation).
   * @param {Buffer} rawBody     - Raw request body (must be buffer)
   * @param {string} signature   - req.headers['stripe-signature']
   * @returns {Object} Stripe event
   */
  verifyWebhook(rawBody, signature) {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  },

  /**
   * Refunds a payment.
   * @param {string} paymentIntentId
   * @returns {Promise<Object>}
   */
  async refund(paymentIntentId) {
    return await stripe.refunds.create({ payment_intent: paymentIntentId });
  }
};

module.exports = StripeProvider;
