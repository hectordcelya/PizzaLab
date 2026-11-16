const supabase = require('../config/database');

// Obtener categorías
const getCategorias = async (req, res) => {
    try {
        const { data, error } = await supabase.from('categoria').select('*').eq('id_estado', 1);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Obtener productos con su categoría y tamaño
const getProductos = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('producto')
            .select(`
                id_producto,
                nombre,
                precio,
                descripcion,
                id_categoria,
                categoria (nombre),
                tamano (id_tamano, nombre)
            `)
            .eq('id_estado', 1);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Obtener ingredientes base de una pizza
const getIngredientesProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('ingrediente_x_producto')
            .select(`
                es_removible,
                ingrediente (
                    id_ingrediente,
                    nombre,
                    descripcion
                )
            `)
            .eq('id_producto', id);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Obtener precios de ingredientes adicionales según el tamaño
const getPreciosIngredientesPorTamano = async (req, res) => {
    const { id_tamano } = req.params;
    try {
        const { data, error } = await supabase
            .from('tamano_x_ingrediente')
            .select(`
                precio,
                ingrediente (
                    id_ingrediente,
                    nombre,
                    descripcion
                )
            `)
            .eq('id_tamano', id_tamano);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getCategorias,
    getProductos,
    getIngredientesProducto,
    getPreciosIngredientesPorTamano
};