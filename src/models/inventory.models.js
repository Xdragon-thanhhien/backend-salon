'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Constants ────────────────────────────────────────────────────────────────

const INVENTORY_STATUS = Object.freeze({
  IN_STOCK:    'in_stock',
  LOW_STOCK:   'low_stock',
  OUT_OF_STOCK: 'out_of_stock'
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const inventorySchema = new Schema(
  {
    // Product reference (1:M — one inventory covers many products)
    productId: {
      type:     Schema.Types.ObjectId,
      ref:      'Product',
      required: true,
      index:    true
    },

    // Quantity in stock
    stock: {
      type:    Number,
      default: 0,
      min:     [0, 'Stock cannot be negative']
    },

    // Threshold to trigger low-stock alarm
    reservations: [
      {
        quantity: { type: Number, default: 0, min: 0 },
        customerId: {
          type: Schema.Types.ObjectId,
          ref: 'Customer'
        }
      }
    ],

    // Location (barber shop branch or storage area)
    location: {
      type:    String,
      trim:    true,
      default: 'Main Store'
    }
  },
  {
    timestamps:  true,
    versionKey:  false,
    collection: 'Inventories'
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

inventorySchema.index({ productId: 1 }, { unique: true }); // one inventory per product
inventorySchema.index({ stock: 1 });                       // fast low-stock queries

// ─── Virtual ──────────────────────────────────────────────────────────────────

/**
 * Virtual field: calculates stock status dynamically.
 */
inventorySchema.virtual('status').get(function () {
  if (this.stock <= 0)  return INVENTORY_STATUS.OUT_OF_STOCK;
  if (this.stock <= 10) return INVENTORY_STATUS.LOW_STOCK;
  return INVENTORY_STATUS.IN_STOCK;
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Adds stock quantity (on restock/delivery).
 * @param {number} quantity - Amount to add
 * @returns {Promise<Object>}
 */
inventorySchema.methods.addStock = function (quantity) {
  if (quantity <= 0) throw new Error('Quantity to add must be positive.');
  this.stock += quantity;
  return this.save();
};

/**
 * Reduces stock quantity (on service usage or sale).
 * @param {number} quantity - Amount to reduce
 * @returns {Promise<Object>}
 */
inventorySchema.methods.reduceStock = function (quantity) {
  if (quantity <= 0) throw new Error('Quantity to reduce must be positive.');
  if (this.stock < quantity) throw new Error('Insufficient stock.');
  this.stock -= quantity;
  return this.save();
};

/**
 * Reserves stock for a customer appointment (soft lock).
 * @param {string} customerId - Customer ObjectId
 * @param {number} quantity   - Amount to reserve
 * @returns {Promise<Object>}
 */
inventorySchema.methods.reserveStock = function (customerId, quantity) {
  if (this.stock < quantity) throw new Error('Not enough stock to reserve.');
  this.reservations.push({ customerId, quantity });
  this.stock -= quantity;
  return this.save();
};

/**
 * Releases a previously reserved stock (e.g., on appointment cancel).
 * @param {string} customerId - Customer ObjectId
 * @returns {Promise<Object>}
 */
inventorySchema.methods.releaseReservation = function (customerId) {
  const idx = this.reservations.findIndex(
    r => r.customerId.toString() === customerId.toString()
  );
  if (idx === -1) throw new Error('No reservation found for this customer.');

  const { quantity } = this.reservations[idx];
  this.reservations.splice(idx, 1);
  this.stock += quantity;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Finds all products with low or out-of-stock status.
 * @returns {Promise<Object[]>}
 */
inventorySchema.statics.findLowStock = function () {
  return this.find({ stock: { $lte: 10 } })
    .populate('productId', 'Pname Brand Price')
    .lean();
};

/**
 * Finds inventory by product ID.
 * @param {string} productId
 * @returns {Promise<Object|null>}
 */
inventorySchema.statics.findByProduct = function (productId) {
  return this.findOne({ productId })
    .populate('productId', 'Pname Brand Price')
    .lean();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  Inventory: mongoose.model('Inventory', inventorySchema),
  INVENTORY_STATUS
};