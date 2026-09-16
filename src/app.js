const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = require('./config/database');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_request, response) => {
  response.json({ message: 'PizzaLab API activa' });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('¡Conexión a la base de datos en Supabase establecida con éxito! 🚀');

    app.listen(port, () => {
      console.log(`Servidor corriendo en el puerto ${port}`);
    });
  } catch (error) {
    console.error('No se pudo conectar a la base de datos:', error.message);
    process.exitCode = 1;
  }
}

startServer();

module.exports = app;