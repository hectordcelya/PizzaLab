const supabase = require('../config/database');

const MAX_PIZZA_INGREDIENTS = 10;

const httpError = (status, message) => Object.assign(new Error(message), { status });

const handleError = (res, error) => {
    res.status(error.status || 500).json({ error: error.message });
};

const parseId = (value, fieldName) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw httpError(400, `${fieldName} debe ser un entero positivo.`);
    }
    return id;
};

const isPizzaCategory = (category) => /^pizzas?$/i.test(category.nombre.trim());

const fetchActiveCategory = async (idCategoria) => {
    const { data, error } = await supabase
        .from('categoria')
        .select('id_categoria,nombre')
        .eq('id_categoria', idCategoria)
        .eq('id_estado', 1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw httpError(400, 'La categoría no existe o no está activa.');
    return data;
};

const fetchActiveSizes = async () => {
    const { data, error } = await supabase
        .from('tamano')
        .select('id_tamano,nombre')
        .eq('id_estado', 1);

    if (error) throw error;
    return data || [];
};

const normalizeIngredientIds = (ids) => {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_PIZZA_INGREDIENTS) {
        throw httpError(400, `Una pizza debe tener entre 1 y ${MAX_PIZZA_INGREDIENTS} ingredientes.`);
    }

    const normalized = ids.map((id) => parseId(id, 'id_ingrediente'));
    if (new Set(normalized).size !== normalized.length) {
        throw httpError(400, 'No se permiten ingredientes duplicados.');
    }
    return normalized;
};

const normalizeSizePrices = (prices) => {
    if (!Array.isArray(prices) || prices.length === 0) {
        throw httpError(400, 'Debes enviar un precio para cada tamaño activo.');
    }

    const normalized = prices.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            throw httpError(400, 'Cada precio debe incluir id_tamano y precio.');
        }

        const id_tamano = parseId(entry.id_tamano, 'id_tamano');
        if (typeof entry.precio !== 'number' || !Number.isFinite(entry.precio) || entry.precio < 0) {
            throw httpError(400, 'Cada precio debe ser un número mayor o igual a cero.');
        }
        return { id_tamano, precio: entry.precio };
    });

    if (new Set(normalized.map(({ id_tamano }) => id_tamano)).size !== normalized.length) {
        throw httpError(400, 'No se permiten precios duplicados para un mismo tamaño.');
    }
    return normalized;
};

const validatePizzaConfiguration = async (body) => {
    const ingredientIds = normalizeIngredientIds(body.id_ingrediente);
    const sizePrices = normalizeSizePrices(body.precios_por_tamano);
    const [activeSizes, activeIngredientsResult] = await Promise.all([
        fetchActiveSizes(),
        supabase
            .from('ingrediente')
            .select('id_ingrediente')
            .in('id_ingrediente', ingredientIds)
            .eq('id_estado', 1)
    ]);

    if (activeIngredientsResult.error) throw activeIngredientsResult.error;
    if ((activeIngredientsResult.data || []).length !== ingredientIds.length) {
        throw httpError(400, 'Uno o más ingredientes no existen o no están activos.');
    }
    if (activeSizes.length === 0) {
        throw httpError(400, 'No hay tamaños activos para asignar precios.');
    }

    const activeSizeIds = new Set(activeSizes.map(({ id_tamano }) => id_tamano));
    const providedSizeIds = new Set(sizePrices.map(({ id_tamano }) => id_tamano));
    if (providedSizeIds.size !== activeSizeIds.size
        || [...activeSizeIds].some((id) => !providedSizeIds.has(id))) {
        throw httpError(400, 'Debes enviar exactamente un precio por cada tamaño activo.');
    }

    return { ingredientIds, sizePrices };
};

const productFields = (body, { creating, pizza }) => {
    const fields = {};
    if (creating || body.nombre !== undefined) {
        if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
            throw httpError(400, 'nombre es obligatorio.');
        }
        fields.nombre = body.nombre.trim();
    }

    if (creating || body.id_categoria !== undefined) {
        fields.id_categoria = parseId(body.id_categoria, 'id_categoria');
    }
    if (body.descripcion !== undefined) fields.descripcion = body.descripcion;
    if (body.imagen_url !== undefined) fields.imagen_url = body.imagen_url;

    if (!pizza && (creating || body.precio !== undefined)) {
        if (typeof body.precio !== 'number' || !Number.isFinite(body.precio) || body.precio < 0) {
            throw httpError(400, 'precio debe ser un número mayor o igual a cero.');
        }
        fields.precio = body.precio;
    }
    if (creating) fields.id_estado = 1;
    return fields;
};

const persistPizzaRelations = async (idProducto, configuration) => {
    const { ingredientIds, sizePrices } = configuration;
    const { error: ingredientsError } = await supabase
        .from('ingrediente_x_producto')
        .insert(ingredientIds.map((id_ingrediente) => ({
            id_producto: idProducto,
            id_ingrediente
        })));
    if (ingredientsError) throw ingredientsError;

    const { error: pricesError } = await supabase
        .from('tamano_x_producto')
        .insert(sizePrices.map(({ id_tamano, precio }) => ({
            id_producto: idProducto,
            id_tamano,
            precio
        })));
    if (pricesError) throw pricesError;
};

const cleanupProduct = async (idProducto) => {
    const errors = [];
    for (const table of ['tamano_x_producto', 'ingrediente_x_producto', 'producto']) {
        const { error } = await supabase.from(table).delete().eq('id_producto', idProducto);
        if (error) errors.push(`${table}: ${error.message}`);
    }
    return errors;
};

const replaceProductRelations = async (idProducto, configuration) => {
    const tableRows = {
        ingrediente_x_producto: configuration
            ? configuration.ingredientIds.map((id_ingrediente) => ({
                id_producto: idProducto,
                id_ingrediente
            }))
            : [],
        tamano_x_producto: configuration
            ? configuration.sizePrices.map(({ id_tamano, precio }) => ({
                id_producto: idProducto,
                id_tamano,
                precio
            }))
            : []
    };
    const previousRows = {};

    for (const table of Object.keys(tableRows)) {
        const { data, error } = await supabase
            .from(table)
            .select(table === 'ingrediente_x_producto'
                ? 'id_producto,id_ingrediente'
                : 'id_producto,id_tamano,precio')
            .eq('id_producto', idProducto);
        if (error) throw error;
        previousRows[table] = data || [];
    }

    try {
        for (const table of Object.keys(tableRows)) {
            const { error } = await supabase.from(table).delete().eq('id_producto', idProducto);
            if (error) throw error;
            if (tableRows[table].length) {
                const { error: insertError } = await supabase.from(table).insert(tableRows[table]);
                if (insertError) throw insertError;
            }
        }
    } catch (error) {
        const rollbackErrors = [];
        for (const table of Object.keys(tableRows)) {
            const { error: deleteError } = await supabase.from(table).delete().eq('id_producto', idProducto);
            if (deleteError) {
                rollbackErrors.push(`${table} (limpieza): ${deleteError.message}`);
                continue;
            }
            if (previousRows[table].length) {
                const { error: restoreError } = await supabase.from(table).insert(previousRows[table]);
                if (restoreError) rollbackErrors.push(`${table} (restauración): ${restoreError.message}`);
            }
        }
        const detail = rollbackErrors.length ? ` La compensación falló: ${rollbackErrors.join('; ')}.` : '';
        throw httpError(500, `No se pudieron guardar las relaciones del producto: ${error.message}.${detail}`);
    }
};

const getCategorias = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categoria')
            .select('id_categoria,nombre')
            .eq('id_estado', 1);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        handleError(res, error);
    }
};

const getProductos = async (req, res) => {
    try {
        let query = supabase
            .from('producto')
            .select(`
                id_producto,
                nombre,
                precio,
                descripcion,
                id_categoria,
                imagen_url,
                categoria!inner (id_categoria, nombre)
            `)
            .eq('id_estado', 1)
            .eq('categoria.id_estado', 1);

        if (req.query.id_categoria !== undefined) {
            query = query.eq('id_categoria', parseId(req.query.id_categoria, 'id_categoria'));
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) return res.json(data || []);

        const [sizes, pricesResult] = await Promise.all([
            fetchActiveSizes(),
            supabase
                .from('tamano_x_producto')
                .select('id_producto,id_tamano,precio')
                .in('id_producto', data.map(({ id_producto }) => id_producto))
        ]);
        if (pricesResult.error) throw pricesResult.error;

        const sizeById = new Map(sizes.map((size) => [size.id_tamano, size]));
        const pricesByProduct = new Map(data.map(({ id_producto }) => [id_producto, []]));
        for (const price of pricesResult.data || []) {
            const size = sizeById.get(price.id_tamano);
            if (size) {
                pricesByProduct.get(price.id_producto).push({
                    id_tamano: price.id_tamano,
                    nombre_tamano: size.nombre,
                    precio: price.precio
                });
            }
        }

        res.json(data.map((product) => ({
            ...product,
            precios_por_tamano: pricesByProduct.get(product.id_producto)
        })));
    } catch (error) {
        handleError(res, error);
    }
};

const getIngredientesProducto = async (req, res) => {
    try {
        const idProducto = parseId(req.params.id, 'id_producto');
        const { data, error } = await supabase
            .from('ingrediente_x_producto')
            .select('ingrediente!inner (id_ingrediente,nombre,descripcion)')
            .eq('id_producto', idProducto)
            .eq('ingrediente.id_estado', 1);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        handleError(res, error);
    }
};

const getPreciosIngredientesPorTamano = async (req, res) => {
    try {
        const idTamano = parseId(req.params.id_tamano, 'id_tamano');
        const sizes = await fetchActiveSizes();
        if (!sizes.some(({ id_tamano }) => id_tamano === idTamano)) {
            throw httpError(404, 'El tamaño no existe o no está activo.');
        }

        const { data, error } = await supabase
            .from('tamano_x_ingrediente')
            .select('id_ingrediente,precio,ingrediente!inner (id_ingrediente,nombre,descripcion)')
            .eq('id_tamano', idTamano)
            .eq('ingrediente.id_estado', 1);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        handleError(res, error);
    }
};

const getPrecioPersonalizado = async (req, res) => {
    try {
        const body = req.body || {};
        const idProducto = parseId(req.params.id, 'id_producto');
        const idTamano = parseId(body.id_tamano, 'id_tamano');
        const additionalIngredientIds = body.id_ingrediente_adicional === undefined
            ? []
            : body.id_ingrediente_adicional;
        if (!Array.isArray(additionalIngredientIds)) {
            throw httpError(400, 'id_ingrediente_adicional debe ser una lista.');
        }
        const additionalIds = additionalIngredientIds.map((id) => parseId(id, 'id_ingrediente_adicional'));
        if (new Set(additionalIds).size !== additionalIds.length) {
            throw httpError(400, 'No se permiten ingredientes adicionales duplicados.');
        }

        const { data: product, error: productError } = await supabase
            .from('producto')
            .select('id_producto,categoria!inner (nombre)')
            .eq('id_producto', idProducto)
            .eq('id_estado', 1)
            .eq('categoria.id_estado', 1)
            .maybeSingle();
        if (productError) throw productError;
        if (!product) throw httpError(404, 'El producto no existe o no está activo.');
        if (!isPizzaCategory(product.categoria)) {
            throw httpError(400, 'El cálculo personalizado solo está disponible para pizzas.');
        }

        const sizes = await fetchActiveSizes();
        if (!sizes.some(({ id_tamano }) => id_tamano === idTamano)) {
            throw httpError(404, 'El tamaño no existe o no está activo.');
        }

        const { data: basePrice, error: basePriceError } = await supabase
            .from('tamano_x_producto')
            .select('precio')
            .eq('id_producto', idProducto)
            .eq('id_tamano', idTamano)
            .maybeSingle();
        if (basePriceError) throw basePriceError;
        if (!basePrice) throw httpError(404, 'La pizza no tiene precio para ese tamaño.');

        let additions = [];
        if (additionalIds.length) {
            const [ingredientsResult, additionPricesResult] = await Promise.all([
                supabase
                    .from('ingrediente')
                    .select('id_ingrediente')
                    .in('id_ingrediente', additionalIds)
                    .eq('id_estado', 1),
                supabase
                    .from('tamano_x_ingrediente')
                    .select('id_ingrediente,precio,ingrediente!inner (nombre)')
                    .eq('id_tamano', idTamano)
                    .in('id_ingrediente', additionalIds)
                    .eq('ingrediente.id_estado', 1)
            ]);
            if (ingredientsResult.error) throw ingredientsResult.error;
            if (additionPricesResult.error) throw additionPricesResult.error;
            if ((ingredientsResult.data || []).length !== additionalIds.length
                || (additionPricesResult.data || []).length !== additionalIds.length) {
                throw httpError(400, 'Uno o más ingredientes adicionales no están activos o no tienen precio para ese tamaño.');
            }
            additions = additionPricesResult.data.map(({ id_ingrediente, precio, ingrediente }) => ({
                id_ingrediente,
                nombre: ingrediente.nombre,
                precio
            }));
        }

        const precioBase = Number(basePrice.precio);
        const precioAdicional = additions.reduce((total, ingredient) => total + Number(ingredient.precio), 0);
        res.json({
            id_producto: idProducto,
            id_tamano: idTamano,
            precio_base: precioBase,
            precio_adicional: precioAdicional,
            precio_total: precioBase + precioAdicional,
            ingredientes_adicionales: additions
        });
    } catch (error) {
        handleError(res, error);
    }
};

const createProducto = async (req, res) => {
    try {
        const body = req.body || {};
        const idCategoria = parseId(body.id_categoria, 'id_categoria');
        const category = await fetchActiveCategory(idCategoria);
        const pizza = isPizzaCategory(category);
        const configuration = pizza ? await validatePizzaConfiguration(body) : null;
        const fields = productFields(body, { creating: true, pizza });
        if (pizza) fields.precio = Math.min(...configuration.sizePrices.map(({ precio }) => precio));

        const { data: product, error } = await supabase
            .from('producto')
            .insert(fields)
            .select('id_producto,nombre,descripcion,precio,id_categoria,imagen_url,id_estado')
            .single();
        if (error) throw error;

        if (pizza) {
            try {
                await persistPizzaRelations(product.id_producto, configuration);
            } catch (persistError) {
                const rollbackErrors = await cleanupProduct(product.id_producto);
                const detail = rollbackErrors.length
                    ? ` La compensación también falló: ${rollbackErrors.join('; ')}`
                    : '';
                throw httpError(500, `No se pudieron guardar las relaciones de la pizza: ${persistError.message}.${detail}`);
            }
        }
        res.status(201).json(product);
    } catch (error) {
        handleError(res, error);
    }
};

const updateProducto = async (req, res) => {
    try {
        const body = req.body || {};
        const idProducto = parseId(req.params.id, 'id_producto');
        const { data: current, error: currentError } = await supabase
            .from('producto')
            .select('id_producto,id_categoria,nombre,descripcion,precio,imagen_url,id_estado')
            .eq('id_producto', idProducto)
            .eq('id_estado', 1)
            .maybeSingle();
        if (currentError) throw currentError;
        if (!current) throw httpError(404, 'El producto no existe o no está activo.');

        const idCategoria = body.id_categoria === undefined
            ? current.id_categoria
            : parseId(body.id_categoria, 'id_categoria');
        const category = await fetchActiveCategory(idCategoria);
        const pizza = isPizzaCategory(category);
        const configuration = pizza ? await validatePizzaConfiguration(body) : null;
        const fields = productFields(body, { creating: false, pizza });
        if (!pizza && body.id_categoria !== undefined && body.precio === undefined) {
            throw httpError(400, 'Debes enviar precio al cambiar la categoría del producto.');
        }
        if (body.id_categoria !== undefined) fields.id_categoria = idCategoria;
        if (pizza) fields.precio = Math.min(...configuration.sizePrices.map(({ precio }) => precio));
        if (!Object.keys(fields).length) {
            throw httpError(400, 'Indica al menos un campo para actualizar.');
        }

        let data = current;
        if (Object.keys(fields).length) {
            const { data: updated, error } = await supabase
                .from('producto')
                .update(fields)
                .eq('id_producto', idProducto)
                .select('id_producto,nombre,descripcion,precio,id_categoria,imagen_url,id_estado')
                .single();
            if (error) throw error;
            data = updated;
        }

        try {
            await replaceProductRelations(idProducto, configuration);
        } catch (error) {
            if (Object.keys(fields).length) {
                const { error: rollbackError } = await supabase
                    .from('producto')
                    .update({
                        nombre: current.nombre,
                        descripcion: current.descripcion,
                        precio: current.precio,
                        id_categoria: current.id_categoria,
                        imagen_url: current.imagen_url,
                        id_estado: current.id_estado
                    })
                    .eq('id_producto', idProducto);
                if (rollbackError) {
                    error.message += ` No se pudieron restaurar los datos del producto: ${rollbackError.message}.`;
                }
            }
            throw error;
        }
        res.json(data);
    } catch (error) {
        handleError(res, error);
    }
};

module.exports = {
    getCategorias,
    getProductos,
    getIngredientesProducto,
    getPreciosIngredientesPorTamano,
    getPrecioPersonalizado,
    createProducto,
    updateProducto
};
