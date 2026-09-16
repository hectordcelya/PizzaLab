const { Router } = require('express');
const {
  crearPizza,
  obtenerPizzas,
  obtenerPizzaPorId,
  actualizarPizza,
  eliminarPizza
} = require('../controllers/pizza.controller');

const router = Router();

router.post('/', crearPizza);
router.get('/', obtenerPizzas);
router.get('/:id', obtenerPizzaPorId);
router.put('/:id', actualizarPizza);
router.delete('/:id', eliminarPizza);

module.exports = router;