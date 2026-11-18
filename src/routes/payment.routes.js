const express = require('express');
const { validateReceipt } = require('../controllers/payment.controller');

const router = express.Router();

router.post('/validate-receipt', validateReceipt);

module.exports = router;
