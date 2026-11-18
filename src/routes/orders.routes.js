const express = require('express');
const {
    createOrder,
    getDeliveries,
    deliverOrder
} = require('../controllers/orders.controller');

const router = express.Router();

router.post('/', createOrder);
router.get('/deliveries', getDeliveries);
router.patch('/:id/deliver', deliverOrder);

module.exports = router;
