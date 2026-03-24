// Minimal placeholder to boot server
const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  res.json({ message: 'Sign in not implemented' });
});

module.exports = router;

