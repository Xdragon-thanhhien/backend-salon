// repositories/inventory.repo.js
'use strict';

const { Inventory } = require('../models/inventory.model');
const {
  findAll,
  findOne
} = require('../helpers');

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Creates a new inventory record for a product.
 * @param {Object} payload - { productId, stock, location }
 * @returns {Promise<Object>}
 */
const createInventory = async (payload) => {
  return await Inventory.create(payload);
};

/**
 * Adds stock quantity to an existing inventory record.
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<Object|null>}
 */
const addStock = async (productId, quantity) => {
  return await Inventory.findOneAndUpdate(
    { productId },
    { $inc: { stock: quantity } },  // atomic increment
    { new: true }
  ).lean();
};

/**
 * Reduces stock quantity (atomic to prevent race conditions).
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<Object|null>} Updated doc or null if insufficient stock
 */
const reduceStock = async (productId, quantity) => {
  return await Inventory.findOneAndUpdate(
    {
      productId,
      stock: { $gte: quantity }  // only update if enough stock (atomic check)
    },
    { $inc: { stock: -quantity } },
    { new: true }
  ).lean();
};

/**
 * Reserves stock for a customer (soft lock before appointment).
 * @param {string} productId
 * @param {string} customerId
 * @param {number} quantity
 * @returns {Promise<Object|null>}
 */
const reserveStock = async (productId, customerId, quantity) => {
  return await Inventory.findOneAndUpdate(
    {
      productId,
      stock: { $gte: quantity }  // atomic check
    },
    {
      $inc:  { stock: -quantity },
      $push: { reservations: { customerId, quantity } }
    },
    { new: true }
  ).lean();
};

/**
 * Releases a reservation back into stock (e.g., appointment cancelled).
 * @param {string} productId
 * @param {string} customerId
 * @returns {Promise<Object|null>}
 */
const releaseReservation = async (productId, customerId) => {
  // First find to get reserved quantity
  const inventory = await Inventory.findOne({ productId });
  if (!inventory) return null;

  const reservation = inventory.reservations.find(
    r => r.customerId.toString() === customerId.toString()
  );
  if (!reservation) return null;

  // Atomically release stock and remove reservation
  return await Inventory.findOneAndUpdate(
    { productId },
    {
      $inc:  { stock: reservation.quantity },
      $pull: { reservations: { customerId } }
    },
    { new: true }
  ).lean();
};

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Finds inventory record by product ID.
 * @param {string} productId
 * @returns {Promise<Object|null>}
 */
const findByProduct = async (productId) => {
  return await findOne({
    model:    Inventory,
    filter:   { productId },
    populate: [{ path: 'productId', select: 'Pname Brand Price' }]
  });
};

/**
 * Finds all inventory records (paginated).
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>}
 */
const findAllInventory = async ({ page = 1, limit = 20 } = {}) => {
  return await findAll({
    model:    Inventory,
    filter:   {},
    page,
    limit,
    sort:     'stock',  // lowest stock first for monitoring
    populate: [{ path: 'productId', select: 'Pname Brand Price' }]
  });
};

/**
 * Finds all items with stock at or below the low-stock threshold.
 * @param {number} threshold - (default: 10)
 * @returns {Promise<Object[]>}
 */
const findLowStock = async (threshold = 10) => {
  return await findAll({
    model:    Inventory,
    filter:   { stock: { $lte: threshold } },
    sort:     'stock',
    populate: [{ path: 'productId', select: 'Pname Brand Price' }]
  });
};

/**
 * Checks if sufficient stock is available for a product.
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<boolean>}
 */
const hasSufficientStock = async (productId, quantity) => {
  const inventory = await Inventory.findOne({
    productId,
    stock: { $gte: quantity }
  }).select('_id').lean();
  return !!inventory;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createInventory,
  addStock,
  reduceStock,
  reserveStock,
  releaseReservation,
  findByProduct,
  findAllInventory,
  findLowStock,
  hasSufficientStock
};
