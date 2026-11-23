const express = require('express');
const router = express.Router();
const { 
    getCategorias, 
    getProductos, 
    getIngredientesProducto, 
    getPreciosIngredientesPorTamano,
    getPrecioPersonalizado,
    createProducto,
    updateProducto
} = require('../controllers/pizza.controller');

router.get('/categorias', getCategorias);
router.get('/productos', getProductos);
router.post('/productos', createProducto);
router.put('/productos/:id', updateProducto);
router.get('/productos/:id/ingredientes', getIngredientesProducto);
router.get('/ingredientes/precios/:id_tamano', getPreciosIngredientesPorTamano);
router.post('/productos/:id/precio-personalizado', getPrecioPersonalizado);

module.exports = router;