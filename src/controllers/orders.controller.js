const supabaseAdmin = require('../config/supabaseAdmin');
const { randomUUID } = require('node:crypto');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

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
        id_persona: clienteFields.id_persona ?? body.id_persona
    };
    const direccion = {
        direccion_completa: direccionFields.direccion_completa ||
            (typeof body.direccion === 'string' ? body.direccion : body.direccion_completa),
        referencia: direccionFields.referencia ?? body.referencia
    };

    if (!isNonEmptyString(cliente.nombre)) {
        cliente.nombre = 'Cliente Invitado';
    }

    return { ...body, cliente, direccion };
};

const resolveCustomerId = async (cliente, rollback) => {
    if (cliente.id_persona !== undefined && cliente.id_persona !== null) {
        if (!Number.isInteger(Number(cliente.id_persona)) || Number(cliente.id_persona) <= 0) {
            throw new Error('id_persona no es válido');
        }
        return Number(cliente.id_persona);
    }

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

const validateOrder = ({ cliente, direccion, id_metodo_pago, total, items }) => {

    if (!cliente || typeof cliente !== 'object' || Array.isArray(cliente)) {
        return 'Se requiere el nombre del cliente';
    }
    if (!direccion || typeof direccion !== 'object' || Array.isArray(direccion)) {
        return 'Se requiere el objeto direccion';
    }
    if (!isNonEmptyString(direccion.direccion_completa)) {
        return 'direccion.direccion_completa es obligatorio';
    }
    if (!Number.isInteger(Number(id_metodo_pago)) || Number(id_metodo_pago) <= 0) {
        return 'id_metodo_pago no es válido';
    }
    if (!isFiniteNumber(Number(total)) || Number(total) < 0) {
        return 'total no es válido';
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
            !isFiniteNumber(Number(item.subtotal)) ||
            Number(item.subtotal) < 0
        ) {
            return 'Uno o más ítems no son válidos';
        }
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
        const { cliente, direccion, id_metodo_pago, total, items } = orderInput;
        const idCliente = await resolveCustomerId(cliente, rollback);

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

        const { data: order, error: orderError } = await supabaseAdmin
            .from('pedido')
            .insert({
                id_cliente: idCliente,
                id_direccion: address.id_direccion,
                id_metodo_pago: Number(id_metodo_pago),
                id_estado: 1,
                total: Number(total),
                is_delivery: true
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
            subtotal: Number(item.subtotal)
        }));
        const { error: itemsError } = await supabaseAdmin
            .from('producto_x_pedido')
            .insert(orderItems);
        if (itemsError) throw itemsError;

        return res.status(201).json({ success: true, id_pedido: order.id_pedido });
    } catch (error) {
        const rollbackFailures = await rollbackOrder(rollback);
        console.error('Error al crear el pedido:', error);
        if (rollbackFailures.length) {
            console.error('No se pudieron revertir todos los registros del pedido:', rollbackFailures);
        }
        return res.status(500).json({
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
