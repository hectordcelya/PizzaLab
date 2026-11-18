const express = require('express');
const cors = require('cors');
require('dotenv').config();

const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        try {
            const { protocol, hostname } = new URL(origin);
            const isAllowedOrigin =
                origin === 'http://localhost:3000' ||
                (protocol === 'https:' && hostname.endsWith('.vercel.app'));

            return callback(null, isAllowedOrigin);
        } catch {
            return callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

const paymentRoutes = require('./routes/payment.routes');
const pizzaRoutes = require('./routes/pizza.routes');
const orderRoutes = require('./routes/orders.routes');

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use('/api/payments', (err, req, res, next) => {
    if (err) {
        return res.status(400).json({
            valid: false,
            message: 'Solicitud inválida o demasiado grande'
        });
    }
    next();
});

// Montar las rutas en el prefijo /api
app.use('/api/payments', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', pizzaRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});