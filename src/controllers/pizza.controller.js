const Pizza = require('../models/pizza.model');

// 1. CREAR una nueva pizza
const crearPizza = async (req, res) => {
  try {
    const { nombre, precio } = req.body;
    const nuevaPizza = await Pizza.create({ nombre, precio });
    res.status(201).json({ mensaje: 'Pizza creada con éxito 🍕', pizza: nuevaPizza });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la pizza', detalle: error.message });
  }
};

// 2. OBTENER todas las pizzas
const obtenerPizzas = async (req, res) => {
  try {
    const pizzas = await Pizza.findAll();
    res.json(pizzas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las pizzas', detalle: error.message });
  }
};

// 3. OBTENER una pizza por su ID
const obtenerPizzaPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const pizza = await Pizza.findByPk(id);
    if (!pizza) {
      return res.status(404).json({ error: 'Pizza no encontrada' });
    }
    res.json(pizza);
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar la pizza', detalle: error.message });
  }
};

// 4. ACTUALIZAR una pizza
const actualizarPizza = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio } = req.body;
    
    const pizza = await Pizza.findByPk(id);
    if (!pizza) {
      return res.status(404).json({ error: 'Pizza no encontrada' });
    }

    await pizza.update({ nombre, precio });
    res.json({ mensaje: 'Pizza actualizada con éxito 🚀', pizza });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la pizza', detalle: error.message });
  }
};

// 5. ELIMINAR una pizza
const eliminarPizza = async (req, res) => {
  try {
    const { id } = req.params;
    const pizza = await Pizza.findByPk(id);
    if (!pizza) {
      return res.status(404).json({ error: 'Pizza no encontrada' });
    }

    await pizza.destroy();
    res.json({ mensaje: 'Pizza eliminada correctamente 🗑️' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la pizza', detalle: error.message });
  }
};

module.exports = {
  crearPizza,
  obtenerPizzas,
  obtenerPizzaPorId,
  actualizarPizza,
  eliminarPizza
};