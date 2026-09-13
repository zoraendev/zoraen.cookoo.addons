# (ZRN) Planeacion

Addon operativo para centralizar:

- planeacion de produccion
- planeacion de abastecimiento
- planeacion logistica
- planes desacoplados de la ejecucion real en Odoo

## Alcance inicial

Este addon concentra la planeacion operativa de Zoraen para produccion, abastecimiento y logistica.

Incluye:

- centro principal de planeacion
- pantalla de produccion con accesos a fabricacion y abastecimiento
- wizard de planeacion de fabricacion
- wizard de planeacion de abastecimiento
- tablas `mfg_plan` para planes desacoplados
- placeholders de logistica listos para crecer

## Seguimiento del plan de fabricacion

Cada linea de fabricacion mantiene dos indicadores calculados:

- `Cantidad de insumos`: componentes distintos obtenidos al explotar la receta para la cantidad planeada. El detalle conserva cantidad por unidad, requerimiento total, existencias, pronostico y faltante por comprar.
- `Cantidad ejecutada`: suma de `qty_produced` de las ordenes de fabricacion vinculadas, convertida a la unidad de medida del producto terminado. Las OF canceladas no se incluyen y las OF de respaldo conservan el vinculo con el planning.

Los insumos se vuelven a calcular cuando cambia el producto, la receta, la cantidad planeada o la bodega. La actualizacion `0.1.2` tambien reconstruye el detalle de los planes de fabricacion existentes.

Al crear un planning de abastecimiento, la tabla de insumos conserva la compra sugerida como referencia y permite modificar `Cantidad a comprar` por producto. El valor ajustado se distribuye entre los productos terminados que requieren el mismo insumo y es el que se utiliza al generar el plan y sus ordenes de compra.

## Objetivo funcional

Permitir que el usuario planee antes de ejecutar:

- que fabricar
- que abastecer
- para cuando
- desde que demanda nace el plan
- que alertas operativas deben dispararse

## Documentacion adicional

- `docs/ui_ux.md`
- `docs/architecture.md`
