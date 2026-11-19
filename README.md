# PizzaLab

## API de productos

El backend expone rutas Express bajo el prefijo `/api`.

- `GET /api/productos?id_categoria=<id>` lista productos activos agrupados por su categoría e incluye `precios_por_tamano` desde `tamano_x_producto`. El filtro por categoría es opcional.
- `POST /api/productos` crea un producto. Para una categoría Pizza, envía `id_ingrediente` (de 1 a 10 IDs activos) y `precios_por_tamano` con un `{ "id_tamano": 1, "precio": 0 }` por cada tamaño activo. Para otras categorías, envía `precio`.
- `PUT /api/productos/:id` actualiza el producto. Si la categoría resultante es Pizza, envía nuevamente `id_ingrediente` y `precios_por_tamano`; para las demás categorías se actualiza `precio` de forma estándar.
- `POST /api/productos/:id/precio-personalizado` recibe `id_tamano` y opcionalmente `id_ingrediente_adicional` (lista de IDs) y devuelve precio base, adicionales y total.

Las categorías, productos, tamaños e ingredientes se validan usando su estado activo (`id_estado = 1`). Los precios base de pizza e ingredientes se leen de `tamano_x_producto` y `tamano_x_ingrediente`, respectivamente. Para compatibilidad con el campo general `producto.precio`, en pizzas se guarda el menor precio enviado; el cálculo por tamaño siempre usa `tamano_x_producto`.