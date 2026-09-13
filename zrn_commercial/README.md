# (ZRN) Manejo Comercial

Addon comercial operativo para centralizar:

- marcas comerciales
- relaciones de productos por marca
- base futura para portafolio
- base futura para canales, pricing y calendario comercial

## Alcance inicial

Este addon concentra la capa comercial operativa de Zoraen con maestros de marcas, unidades de negocio y canales.

Incluye:

- app propia de (ZRN) Manejo Comercial
- maestro de marcas comerciales
- maestro de canales comerciales
- asignacion de productos vendibles por marca
- asignacion exclusiva de clientes o PDVs por canal
- validaciones para evitar productos repetidos entre marcas
- validaciones para evitar clientes repetidos entre canales
- validacion de logo y documentacion de base de datos

## Objetivo funcional

Permitir que el cliente:

- registre sus marcas comerciales reales
- registre sus canales comerciales reales
- agrupe productos vendibles bajo cada marca
- agrupe clientes y PDVs bajo un solo canal operativo
- prepare una base consistente para metricas futuras
- compare despues inventario, ventas y compras por marca

## Documentacion adicional

- `docs/ui_ux.md`
- `docs/architecture.md`
- `docs/db/commercial_brands_schema.sql`
- `docs/db/commercial_brands_er.md`
- `docs/db/commercial_channels_schema.sql`
- `docs/db/commercial_channels_er.md`
