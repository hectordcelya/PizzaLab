const express = require('express');
const cors = require('cors');
require('dotenv').config();
const sequelize = require('./config/database');


require('./models/pizza.model');


const pizzaRoutes = require('./routes/pizza.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


app.use('/api/pizzas', pizzaRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'PizzaLab API activa' });
});

const iniciarServidor = async () => {
  try {
    await sequelize.authenticate();
    console.log('¡Conexión a la base de datos en Supabase establecida con éxito! 🚀');

    
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