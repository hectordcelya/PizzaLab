const express = require('express');
const cors = require('cors');
require('dotenv').config();
const sequelize = require('./config/database');

// Importamos el modelo para que se registre en Sequelize
require('./models/pizza.model');

// 1. IMPORTAR LAS RUTAS DE PIZZAS
const pizzaRoutes = require('./routes/pizza.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 2. USAR LAS RUTAS EN LA APLICACIÓN
app.use('/api/pizzas', pizzaRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'PizzaLab API activa' });
});

const iniciarServidor = async () => {
  try {
    await sequelize.authenticate();
    console.log('¡Conexión a la base de datos en Supabase establecida con éxito! 🚀');

    // Sincroniza los modelos con la base de datos (crea las tablas si no existen)
    await sequelize.sync({ alter: true });
    console.log('¡Modelos sincronizados correctamente con la base de datos! 📦');

    app.listen(port, () => {
      console.log(`Servidor corriendo en el puerto ${port}`);
    });
  } catch (error) {
    console.error('No se pudo conectar a la base de datos:', error);
  }
};

iniciarServidor();