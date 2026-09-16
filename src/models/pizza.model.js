const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pizza = sequelize.define('Pizza', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  precio: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
}, {
  tableName: 'pizzas',
  timestamps: true // Esto crea automáticamente las columnas createdAt y updatedAt
});

module.exports = Pizza;