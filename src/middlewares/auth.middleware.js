// Placeholder auth middleware
module.exports = {
  authenticate: (req, res, next) => next(),
  authorize: roles => (req, res, next) => next()
};

