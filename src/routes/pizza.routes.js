const express = require('express');
const router = express.Router();
const { 
    getCategorias, 
    getProductos, 
    getIngredientesProducto, 
    getPreciosIngredientesPorTamano 
} = require('../controllers/pizza.controller');

router.get('/categorias', getCategorias);
router.get('/productos', getProductos);
router.get('/productos/:id/ingredientes', getIngredientesProducto);
router.get('/ingredientes/precios/:id_tamano', getPreciosIngredientesPorTamano);

module.exports = router;