// Placeholder
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ message: 'Barber routes' }));

module.exports = router;

