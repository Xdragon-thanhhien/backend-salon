// helpers/model.helper.js
'use strict';

// ─── Default Excluded Fields ──────────────────────────────────────────────────

const DEFAULT_UNSELECT = ['__v', 'password', 'salt', 'hashedKey'];

// ─── selectData ───────────────────────────────────────────────────────────────

/**
 * Converts array of field names into Mongoose include select string.
 * @param {string[]} fields - e.g. ['Fname', 'email']
 * @returns {string} 'Fname email'
 */
const selectData = (fields = []) => fields.join(' ');

// ─── unSelectData ─────────────────────────────────────────────────────────────

/**
 * Converts array of field names into Mongoose exclude select string.
 * @param {string[]} fields - e.g. ['password', '__v']
 * @returns {string} '-password -__v'
 */
const unSelectData = (fields = []) => fields.map(f => `-${f}`).join(' ');

// ─── findAll ──────────────────────────────────────────────────────────────────

/**
 * Finds all documents with filtering, pagination, sorting, and field selection.
 * @param {Object} options
 * @param {Model}    options.model
 * @param {Object}   options.filter    - Mongoose filter (default: {})
 * @param {number}   options.limit     - (default: 20)
 * @param {number}   options.page      - (default: 1)
 * @param {string}   options.sort      - (default: '-createdAt')
 * @param {string[]} options.select    - Fields to include
 * @param {string[]} options.unselect  - Fields to exclude (default: DEFAULT_UNSELECT)
 * @param {Array}    options.populate  - Populate config (default: [])
 * @returns {Promise<{ data, total, page, limit, totalPages }>}
 */
const findAll = async ({
  model,
  filter   = {},
  limit    = 20,
  page     = 1,
  sort     = '-createdAt',
  select   = [],
  unselect = DEFAULT_UNSELECT,
  populate = []
}) => {
  const skip = (page - 1) * limit;

  const selectString = select.length > 0
    ? selectData(select)
    : unSelectData(unselect);

  let query = model
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select(selectString)
    .lean();

  if (populate.length > 0) {
    populate.forEach(p => { query = query.populate(p); });
  }

  const [data, total] = await Promise.all([
    query,
    model.countDocuments(filter)
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

// ─── findOne ──────────────────────────────────────────────────────────────────

/**
 * Finds a single document matching the filter.
 * @param {Object} options
 * @param {Model}    options.model
 * @param {Object}   options.filter
 * @param {string[]} options.select    - Fields to include
 * @param {string[]} options.unselect  - Fields to exclude (default: DEFAULT_UNSELECT)
 * @param {Array}    options.populate  - Populate config (default: [])
 * @returns {Promise<Object|null>}
 */
const findOne = async ({
  model,
  filter   = {},
  select   = [],
  unselect = DEFAULT_UNSELECT,
  populate = []
}) => {
  const selectString = select.length > 0
    ? selectData(select)
    : unSelectData(unselect);

  let query = model
    .findOne(filter)
    .select(selectString)
    .lean();

  if (populate.length > 0) {
    populate.forEach(p => { query = query.populate(p); });
  }

  return await query;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  findAll,
  findOne,
  selectData,
  unSelectData,
  DEFAULT_UNSELECT
};
