const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pizzaRoutes = require('./routes/pizza.routes');

const app = express();
app.use(cors());
app.use(express.json());

// Montar las rutas en el prefijo /api
app.use('/api', pizzaRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});