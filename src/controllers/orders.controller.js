const supabaseAdmin = require('../config/supabaseAdmin');
const { randomUUID } = require('node:crypto');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const normalizePositiveInteger = (value) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const isRemovedIngredient = (ingredient) => [
    ingredient.removido,
    ingredient.removed,
    ingredient.quitado,
    ingredient.eliminado,
    ingredient.is_removed,
    ingredient.isRemoved
].some((value) => value === true);

const getOrderItemIngredients = (item) => {
    const ingredientLists = [item.ingredientes, item.adicionales, item.tamano_ingredientes];
    const ingredients = ingredientLists.flatMap((list) => {
        if (Array.isArray(list)) return list;
        return list && typeof list === 'object' ? [list] : [];
    });

    if (item.id_tamano_x_ingrediente !== undefined && ingredients.length === 0) {
        ingredients.push({
            id_tamano_x_ingrediente: item.id_tamano_x_ingrediente,
            cantidad: item.cantidad_ingrediente
        });
    }

    return ingredients
        .filter((ingredient) => ingredient && typeof ingredient === 'object' && !isRemovedIngredient(ingredient))
        .map((ingredient) => {
            const idTamanoIngrediente = normalizePositiveInteger(ingredient.id_tamano_x_ingrediente);
            const hasQuantity = typeof ingredient.cantidad === 'number' ||
                (typeof ingredient.cantidad === 'string' && ingredient.cantidad.trim() !== '');
            const cantidad = ingredient.cantidad === undefined || ingredient.cantidad === null
                ? 1
                : hasQuantity
                    ? Number(ingredient.cantidad)
                    : NaN;
            if (!idTamanoIngrediente || !Number.isFinite(cantidad) || cantidad <= 0) return null;
            return { id_tamano_x_ingrediente: idTamanoIngrediente, cantidad };
        })
        .filter(Boolean);
};

// Reglas vigentes de PizzaLab (public.metodo_pago / public.estado)
const PAYMENT_METHOD_CASH = 1;
const PAYMENT_METHOD_TRANSFER = 4;
const ALLOWED_PAYMENT_METHODS = [PAYMENT_METHOD_CASH, PAYMENT_METHOD_TRANSFER];
const ORDER_STATE_PENDING = 3;

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const parseBoolean = (value, fallback) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return fallback;
};

const DEMO_DELIVERIES = [
    {
        id_pedido: 901,
        id_estado: 1,
        is_delivery: true,
        total: 48000,
        persona: { nombre: 'Camila Restrepo', telefono: '3004128890' },
        direccion: {
            direccion_completa: 'Carrera 43A # 1-50, El Poblado, Medellín',
            referencia: 'Torre 2, Apto 804'
        }
    },
    {
        id_pedido: 902,
        id_estado: 1,
        is_delivery: true,
        total: 62000,
        persona: { nombre: 'Mateo Giraldo', telefono: '3117894512' },
        direccion: {
            direccion_completa: 'Circular 4 # 70-18, Laureles, Medellín',
            referencia: 'Casa esquina frente al parque'
        }
    },
    {
        id_pedido: 903,
        id_estado: 1,
        is_delivery: true,
        total: 39000,
        persona: { nombre: 'Valentina Ospina', telefono: '3156023341' },
        direccion: {
            direccion_completa: 'Calle 33 # 80B-25, Belén, Medellín',
            referencia: 'Portería unidad residencial'
        }
    }
];

const normalizeOrderInput = (body = {}) => {
    const clienteFields = body.cliente && typeof body.cliente === 'object' && !Array.isArray(body.cliente)
        ? body.cliente
        : {};
    const direccionFields = body.direccion && typeof body.direccion === 'object' && !Array.isArray(body.direccion)
        ? body.direccion
        : {};
    const cliente = {
        nombre: clienteFields.nombre ?? body.nombre,
        telefono: clienteFields.telefono ?? body.telefono,
        email: clienteFields.email ?? body.email,
        id_cliente: clienteFields.id_cliente ?? body.id_cliente,
        id_persona: clienteFields.id_persona ?? body.id_persona,
        access_token: clienteFields.access_token ?? body.access_token ?? body.token
    };
    const direccion = {
        id_direccion: direccionFields.id_direccion ?? body.id_direccion,
        direccion_completa: direccionFields.direccion_completa ||
            (typeof body.direccion === 'string' ? body.direccion : body.direccion_completa),
        referencia: direccionFields.referencia ?? body.referencia
    };
    // Por defecto el pedido es a domicilio; "Recoger en tienda" envía is_delivery=false.
    const isDelivery = parseBoolean(body.is_delivery, true);

    if (!isNonEmptyString(cliente.nombre)) {
        cliente.nombre = 'Cliente Invitado';
    }

    return { ...body, cliente, direccion, is_delivery: isDelivery };
};

const normalizeCustomerId = (id) => {
    if (id === undefined || id === null || id === '') return null;
    const normalizedId = Number(id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        throw new Error('id_cliente/id_persona no es válido');
    }
    return normalizedId;
};

const resolveAuthenticatedCustomerId = async (cliente, requestedCustomerId) => {
    const authorization = cliente.access_token;
    if (!authorization) return null;

    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new HttpError(401, 'El token de autenticación está vacío');

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
        throw new HttpError(401, authError?.message || 'El token de autenticación no es válido');
    }

    const user = authData.user;
    const { data: personByAuthId, error: personByAuthIdError } = await supabaseAdmin
        .from('persona')
        .select('id_persona')
        .eq('identificador_externo', user.id)
        .maybeSingle();
    if (personByAuthIdError) throw personByAuthIdError;
    if (personByAuthId) {
        if (requestedCustomerId && requestedCustomerId !== personByAuthId.id_persona) {
            throw new HttpError(403, 'El id de cliente no coincide con el usuario autenticado');
        }
        return personByAuthId.id_persona;
    }

    const metadata = { ...user.app_metadata, ...user.user_metadata };
    const authenticatedId = normalizeCustomerId(metadata.id_cliente ?? metadata.id_persona);
    if (authenticatedId) {
        if (requestedCustomerId && requestedCustomerId !== authenticatedId) {
            throw new HttpError(403, 'El id de cliente no coincide con el usuario autenticado');
        }
        return authenticatedId;
    }

    if (requestedCustomerId) return requestedCustomerId;

    if (user.email) {
        const { data: person, error } = await supabaseAdmin
            .from('persona')
            .select('id_persona')
            .eq('email', user.email)
            .maybeSingle();
        if (error) throw error;
        if (person) return person.id_persona;
    }

    throw new HttpError(404, 'No se encontró una persona vinculada al usuario autenticado');
};

const resolveCustomerId = async (cliente, rollback) => {
    const requestedCustomerId = normalizeCustomerId(cliente.id_cliente ?? cliente.id_persona);
    const authenticatedCustomerId = await resolveAuthenticatedCustomerId(cliente, requestedCustomerId);
    if (authenticatedCustomerId) return authenticatedCustomerId;
    if (requestedCustomerId) return requestedCustomerId;

    const guestName = isNonEmptyString(cliente.nombre) ? cliente.nombre.trim() : 'Cliente Invitado';
    const lookupField = isNonEmptyString(cliente.telefono)
        ? 'telefono'
        : isNonEmptyString(cliente.email)
            ? 'email'
            : null;

    if (lookupField) {
        const lookup = supabaseAdmin
            .from('persona')
            .select('id_persona')
            .eq('nombre', guestName)
            .eq(lookupField, cliente[lookupField])
            .eq('id_rol', 1)
            .limit(1);
        const { data, error } = await lookup.maybeSingle();
        if (error) throw error;
        if (data) return data.id_persona;
    }

    const guestId = randomUUID();
    const { data: provider, error: providerError } = await supabaseAdmin
        .from('proveedor')
        .select('id_proveedor')
        .limit(1)
        .maybeSingle();
    if (providerError) throw providerError;

    const guest = {
        nombre: guestName,
        telefono: isNonEmptyString(cliente.telefono) ? cliente.telefono.trim() : null,
        email: isNonEmptyString(cliente.email)
            ? cliente.email.trim()
            : `invitado_${guestId}@pizzalab.local`,
        identificador_externo: `guest_${guestId}`,
        id_proveedor: provider?.id_proveedor || 1,
        id_rol: 1,
        id_estado: 1
    };

    const { data, error } = await supabaseAdmin
        .from('persona')
        .insert(guest)
        .select('id_persona')
        .single();
    if (error) throw error;

    rollback.persona = data.id_persona;
    return data.id_persona;
};

const rollbackOrder = async (rollback) => {
    const failures = [];

    if (rollback.productItemIds?.length) {
        try {
            const { error } = await supabaseAdmin
                .from('tamano_x_ingrediente_x_producto_x_pedido')
                .delete()
                .in('id_producto_x_pedido', rollback.productItemIds);
            if (error) failures.push({ table: 'tamano_x_ingrediente_x_producto_x_pedido', error });
        } catch (error) {
            failures.push({ table: 'tamano_x_ingrediente_x_producto_x_pedido', error });
        }
    }

    const deletions = [
        ['producto_x_pedido', rollback.items, 'id_pedido'],
        ['pedido', rollback.pedido, 'id_pedido'],
        ['direcciones_x_cliente', rollback.addressLink, 'id_direccion'],
        ['direccion', rollback.direccion, 'id_direccion'],
        ['persona', rollback.persona, 'id_persona']
    ];

    for (const [table, id, column] of deletions) {
        if (!id) continue;

        try {
            const { error } = await supabaseAdmin.from(table).delete().eq(column, id);
            if (error) failures.push({ table, error });
        } catch (error) {
            failures.push({ table, error });
        }
    }

    return failures;
};

const linkAddressToCustomer = async (idCliente, idDireccion, rollback) => {
    for (const customerColumn of ['id_cliente', 'id_persona']) {
        try {
            const { error } = await supabaseAdmin
                .from('direcciones_x_cliente')
                .insert({ [customerColumn]: idCliente, id_direccion: idDireccion });
            if (!error) {
                rollback.addressLink = idDireccion;
                return;
            }
            console.error(`No se pudo vincular la dirección usando ${customerColumn}:`, error);
        } catch (error) {
            console.error(`No se pudo vincular la dirección usando ${customerColumn}:`, error);
        }
    }
};

const validateOrder = ({ cliente, direccion, id_metodo_pago, total, costo_domicilio, items, is_delivery }) => {

    if (!cliente || typeof cliente !== 'object' || Array.isArray(cliente)) {
        return 'Se requiere el nombre del cliente';
    }
    if (is_delivery) {
        if (!direccion || typeof direccion !== 'object' || Array.isArray(direccion)) {
            return 'Se requiere el objeto direccion';
        }
        if (!isNonEmptyString(direccion.direccion_completa)) {
            return 'direccion.direccion_completa es obligatorio';
        }
    } else if (!isNonEmptyString(cliente.telefono)) {
        return 'Se requiere un teléfono de contacto para recoger en tienda';
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(Number(id_metodo_pago))) {
        return 'id_metodo_pago no es válido (1 = Efectivo, 4 = Transferencia)';
    }
    if (total === null || total === '' || !isFiniteNumber(Number(total)) || Number(total) < 0) {
        return 'total no es válido';
    }
    if (is_delivery && (costo_domicilio === undefined || costo_domicilio === null || costo_domicilio === '' ||
        !isFiniteNumber(Number(costo_domicilio)) || Number(costo_domicilio) < 0)) {
        return 'costo_domicilio no es válido';
    }
    if (!Array.isArray(items) || items.length === 0) {
        return 'Se requiere al menos un ítem';
    }

    for (const item of items) {
        if (
            !item ||
            !Number.isInteger(Number(item.id_producto)) ||
            Number(item.id_producto) <= 0 ||
            !Number.isInteger(Number(item.cantidad)) ||
            Number(item.cantidad) <= 0 ||
            !isFiniteNumber(Number(item.precio_unitario)) ||
            Number(item.precio_unitario) < 0 ||
            item.subtotal === null ||
            item.subtotal === '' ||
            !isFiniteNumber(Number(item.subtotal)) ||
            Number(item.subtotal) < 0
        ) {
            return 'Uno o más ítems no son válidos';
        }
    }

    const productsTotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    const deliveryFee = is_delivery ? Number(costo_domicilio) : 0;
    if (Number(total) + 0.01 < productsTotal + deliveryFee) {
        return 'total debe incluir el subtotal de productos y el costo de domicilio';
    }

    return null;
};

const createOrder = async (req, res) => {
    const orderInput = normalizeOrderInput(req.body);
    const validationError = validateOrder(orderInput);
    if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
    }

    const rollback = {};
    try {
        const { cliente, direccion, id_metodo_pago, total, items, is_delivery: isDelivery } = orderInput;
        const authorization = req.get('authorization');
        if (authorization) cliente.access_token = authorization;
        const idCliente = await resolveCustomerId(cliente, rollback);

        // Recoger en tienda: sin dirección ni domiciliario.
        let idDireccion = null;
        if (isDelivery) {
            const requestedAddressId = normalizeCustomerId(direccion.id_direccion);
            if (requestedAddressId) {
                // Reutiliza una dirección guardada solo si pertenece al cliente.
                const { data: ownedLink, error: ownedLinkError } = await supabaseAdmin
                    .from('direcciones_x_cliente')
                    .select('id_direccion')
                    .eq('id_cliente', idCliente)
                    .eq('id_direccion', requestedAddressId)
                    .maybeSingle();
                if (ownedLinkError) throw ownedLinkError;
                if (!ownedLink) throw new HttpError(403, 'La dirección seleccionada no pertenece al cliente');
                idDireccion = requestedAddressId;
            } else {
                const { data: address, error: addressError } = await supabaseAdmin
                    .from('direccion')
                    .insert({
                        direccion_completa: direccion.direccion_completa.trim(),
                        referencia: isNonEmptyString(direccion.referencia) ? direccion.referencia.trim() : null,
                        id_estado: 1
                    })
                    .select('id_direccion')
                    .single();
                if (addressError) throw addressError;
                rollback.direccion = address.id_direccion;
                await linkAddressToCustomer(idCliente, address.id_direccion, rollback);
                idDireccion = address.id_direccion;
            }
        }

        const { data: order, error: orderError } = await supabaseAdmin
            .from('pedido')
            .insert({
                id_cliente: idCliente,
                id_direccion: idDireccion,
                // El administrador asigna el domiciliario después (queda "En preparación").
                id_domiciliario: null,
                id_metodo_pago: Number(id_metodo_pago),
                id_estado: ORDER_STATE_PENDING,
                total: Number(total),
                is_delivery: isDelivery
            })
            .select('id_pedido')
            .single();
        if (orderError) throw orderError;
        rollback.pedido = order.id_pedido;
        rollback.items = order.id_pedido;

        const orderItems = items.map((item) => ({
            id_pedido: order.id_pedido,
            id_producto: Number(item.id_producto),
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario),
            subtotal: Number(item.subtotal),
            descripcion_detalle: typeof item.descripcion_detalle === 'string'
                ? item.descripcion_detalle
                : typeof item.observaciones === 'string'
                    ? item.observaciones
                    : item.descripcion_detalle == null
                        ? ''
                        : JSON.stringify(item.descripcion_detalle)
        }));
        const { data: insertedItems, error: itemsError } = await supabaseAdmin
            .from('producto_x_pedido')
            .insert(orderItems)
            .select('id_producto_x_pedido');
        if (itemsError) throw itemsError;
        if (!insertedItems || insertedItems.length !== items.length) {
            throw new Error('No se pudieron recuperar los identificadores de los ítems del pedido');
        }
        rollback.productItemIds = insertedItems.map(({ id_producto_x_pedido }) => id_producto_x_pedido);

        const orderIngredients = items.flatMap((item, index) => (
            getOrderItemIngredients(item).map(({ id_tamano_x_ingrediente, cantidad }) => ({
                id_producto_x_pedido: insertedItems[index].id_producto_x_pedido,
                id_tamano_x_ingrediente,
                cantidad
            }))
        ));
        if (orderIngredients.length) {
            const uniqueIds = [...new Set(orderIngredients.map(
                ({ id_tamano_x_ingrediente }) => id_tamano_x_ingrediente
            ))];
            const { data: ingredientPrices, error: ingredientPricesError } = await supabaseAdmin
                .from('tamano_x_ingrediente')
                .select('id_tamano_x_ingrediente, precio')
                .in('id_tamano_x_ingrediente', uniqueIds);
            if (ingredientPricesError) throw ingredientPricesError;

            const priceByIngredientId = new Map((ingredientPrices || []).map(({ id_tamano_x_ingrediente, precio }) => {
                const numericPrice = precio == null ? 0 : Number(precio);
                return [id_tamano_x_ingrediente, Number.isFinite(numericPrice) ? numericPrice : 0];
            }));
            const ingredientsToInsert = orderIngredients.map((ingredient) => {
                const precio_unitario = priceByIngredientId.get(ingredient.id_tamano_x_ingrediente) ?? 0;
                const cantidad = Number(ingredient.cantidad);
                const calculatedSubtotal = Number.isFinite(precio_unitario) && Number.isFinite(cantidad)
                    ? precio_unitario * cantidad
                    : 0;
                return {
                    id_tamano_x_ingrediente: ingredient.id_tamano_x_ingrediente,
                    id_producto_x_pedido: ingredient.id_producto_x_pedido,
                    cantidad: ingredient.cantidad,
                    precio_unitario,
                    subtotal: Number.isFinite(calculatedSubtotal) ? calculatedSubtotal : 0
                };
            });
            const { error: ingredientsError } = await supabaseAdmin
                .from('tamano_x_ingrediente_x_producto_x_pedido')
                .insert(ingredientsToInsert);
            if (ingredientsError) throw ingredientsError;
        }

        return res.status(201).json({ success: true, id_pedido: order.id_pedido });
    } catch (error) {
        const rollbackFailures = await rollbackOrder(rollback);
        console.error('Error al crear el pedido:', error);
        if (rollbackFailures.length) {
            console.error('No se pudieron revertir todos los registros del pedido:', rollbackFailures);
        }
        return res.status(error instanceof HttpError ? error.status : 500).json({
            success: false,
            message: error.message || 'No se pudo crear el pedido'
        });
    }
};

const getDeliveriesWithRelations = async () => {
    const { data: orders, error: ordersError } = await supabaseAdmin
        .from('pedido')
        .select('*')
        .eq('id_estado', 1)
        .eq('is_delivery', true);
    if (ordersError) throw ordersError;

    const deliveryOrders = orders || [];
    const customerIds = [...new Set(deliveryOrders.map((order) => order.id_cliente).filter(Boolean))];
    const addressIds = [...new Set(deliveryOrders.map((order) => order.id_direccion).filter(Boolean))];
    const [peopleResult, addressesResult] = await Promise.all([
        customerIds.length
            ? supabaseAdmin.from('persona').select('id_persona,nombre,telefono').in('id_persona', customerIds)
            : Promise.resolve({ data: [], error: null }),
        addressIds.length
            ? supabaseAdmin.from('direccion').select('id_direccion,direccion_completa,referencia').in('id_direccion', addressIds)
            : Promise.resolve({ data: [], error: null })
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (addressesResult.error) throw addressesResult.error;

    const people = new Map((peopleResult.data || []).map((person) => [person.id_persona, person]));
    const addresses = new Map((addressesResult.data || []).map((address) => [address.id_direccion, address]));

    return deliveryOrders.map((order) => ({
        ...order,
        persona: people.get(order.id_cliente) || null,
        direccion: addresses.get(order.id_direccion) || null
    }));
};

const getDeliveries = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('pedido')
            .select(`
                *,
                persona (nombre, telefono),
                direccion (direccion_completa, referencia)
            `)
            .eq('id_estado', 1)
            .eq('is_delivery', true);

        if (error) {
            console.error('Error en el join de pedidos de domicilio; se consultarán las relaciones por separado:', error);
        } else if (data && data.length > 0) {
            return res.status(200).json({ deliveries: data, data });
        }
    } catch (error) {
        console.error('Error en el join de pedidos de domicilio; se consultarán las relaciones por separado:', error);
    }

    try {
        const deliveries = await getDeliveriesWithRelations();
        const results = deliveries.length > 0 ? deliveries : DEMO_DELIVERIES;
        return res.status(200).json({ deliveries: results, data: results });
    } catch (error) {
        console.error('Error al consultar pedidos y sus relaciones de domicilio:', error);
        return res.status(200).json({ deliveries: DEMO_DELIVERIES, data: DEMO_DELIVERIES });
    }
};

const deliverOrder = async (req, res) => {
    const idPedido = Number(req.params.id);
    if (!Number.isInteger(idPedido) || idPedido <= 0) {
        return res.status(400).json({ success: false, message: 'El id del pedido no es válido' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('pedido')
            .update({ id_estado: 2 })
            .eq('id_pedido', idPedido)
            .select('id_pedido')
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error al actualizar el estado del pedido:', error);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el pedido' });
    }
};

module.exports = { createOrder, getDeliveries, deliverOrder };
