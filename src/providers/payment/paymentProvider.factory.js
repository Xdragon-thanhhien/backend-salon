// providers/payment/paymentProvider.factory.js
'use strict';

const StripeProvider  = require('./stripe.provider');
const PayPalProvider  = require('./paypal.provider');
const MoMoProvider    = require('./momo.provider');
const ZaloPayProvider = require('./zalopay.provider');

// Registry of all available providers
const PROVIDERS = Object.freeze({
  stripe:  StripeProvider,
  paypal:  PayPalProvider,
  momo:    MoMoProvider,
  zalopay: ZaloPayProvider
});

/**
 * Returns the payment provider instance by name.
 * @param {string} providerName - 'stripe' | 'paypal' | 'momo' | 'zalopay'
 * @returns {Object} Payment provider
 * @throws {Error} If provider is not supported
 */
function getProvider(providerName) {
  const provider = PROVIDERS[providerName?.toLowerCase()];
  if (!provider) {
    throw new Error(
      `Unsupported payment provider: "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider;
}

/**
 * Returns the default provider from environment variable.
 * @returns {Object} Default payment provider
 */
function getDefaultProvider() {
  const defaultName = process.env.DEFAULT_PAYMENT_PROVIDER || 'momo';
  return getProvider(defaultName);
}

module.exports = {
  getProvider,
  getDefaultProvider,
  PROVIDERS
};
