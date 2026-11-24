# PizzaLab

## API de productos

El backend expone rutas Express bajo el prefijo `/api`.

- `GET /api/productos?id_categoria=<id>` lista productos activos agrupados por su categoría e incluye `precios_por_tamano` desde `tamano_x_producto`. El filtro por categoría es opcional.
- `POST /api/productos` crea un producto. Para una categoría Pizza, envía `id_ingrediente` (de 1 a 10 IDs activos) y `precios_por_tamano` con un `{ "id_tamano": 1, "precio": 0 }` por cada tamaño activo. Para otras categorías, envía `precio`.
- `PUT /api/productos/:id` actualiza el producto. Si la categoría resultante es Pizza, envía nuevamente `id_ingrediente` y `precios_por_tamano`; para las demás categorías se actualiza `precio` de forma estándar.
- `POST /api/productos/:id/precio-personalizado` recibe `id_tamano` y opcionalmente `id_ingrediente_adicional` (lista de IDs) y devuelve precio base, adicionales y total.

Las categorías, productos, tamaños e ingredientes se validan usando su estado activo (`id_estado = 1`). Los precios base de pizza e ingredientes se leen de `tamano_x_producto` y `tamano_x_ingrediente`, respectivamente. Para compatibilidad con el campo general `producto.precio`, en pizzas se guarda el menor precio enviado; el cálculo por tamaño siempre usa `tamano_x_producto`.

## API de pedidos y verificador de comprobantes

- `POST /api/payments/validate-receipt` recibe `{ imageBase64, mimeType }` y usa Gemini para confirmar que la imagen parece un comprobante de transferencia (no valida montos ni remitente). Responde `200 { valid: true }` o `400 { valid: false, message }`. Requiere `GEMINI_API_KEY`.
- `POST /api/orders` crea el pedido (`public.pedido`) y sus líneas (`public.producto_x_pedido`).
  - Body: `cliente { nombre, telefono }`, `is_delivery` (por defecto `true`), `direccion { direccion_completa, referencia, id_direccion? }` (solo domicilio), `id_metodo_pago` (**1 = Efectivo, 4 = Transferencia**), `costo_domicilio`, `total`, `items[]`.
  - Si se envía `Authorization: Bearer <access_token de Supabase>` el pedido se asocia a la persona de la cuenta (así aparece en "Mis Pedidos"); sin token se crea como invitado.
  - Estado inicial: `id_estado = 3` (Pendiente). `id_domiciliario` siempre queda en `null`; el administrador lo asigna después.
  - Domicilio: guarda `id_direccion` (reutiliza `direccion.id_direccion` si pertenece al cliente, si no crea una nueva). Recoger en tienda (`is_delivery = false`): `id_direccion = null`, sin costo de domicilio y requiere teléfono.

Copia `.env.example` a `.env` y ajusta los valores. El backend debe correr en el puerto 4000 (`PORT=4000`) para no chocar con Next.js.
