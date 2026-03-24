// Placeholder customer routes
const express = require('express');
const router = express.Router();

router.get('/profile', (req, res) => {
  res.json({ message: 'Customer profile' });
});

module.exports = router;

