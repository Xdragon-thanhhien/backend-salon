const { Inventory, INVENTORY_STATUS } = require('../models/inventory.model');
const { findAll, findOne } = require('../helpers');

// Get all low stock items
const getLowStockItems = async () => {
  return await Inventory.findLowStock();
};

// Add stock after delivery
const restockProduct = async (productId, quantity) => {
  const inventory = await Inventory.findOne({ productId });
  if (!inventory) throw new NotFoundError('Inventory not found for this product.');
  return await inventory.addStock(quantity);
};

// Reduce stock after service usage
const useStock = async (productId, quantity) => {
  const inventory = await Inventory.findOne({ productId });
  if (!inventory) throw new NotFoundError('Inventory not found for this product.');
  return await inventory.reduceStock(quantity);
};

// Get all inventory (paginated)
const getAllInventory = async ({ page = 1, limit = 20 } = {}) => {
  return await findAll({
    model:    Inventory,
    filter:   {},
    page,
    limit,
    sort:     'stock', // lowest stock first
    populate: [{ path: 'productId', select: 'Pname Brand Price' }]
  });
};
