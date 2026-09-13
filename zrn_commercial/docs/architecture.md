# Arquitectura de (ZRN) Manejo Comercial

## Objetivo

Mantener la capa comercial operativa de Zoraen en un addon independiente y mantenible.

## Alcance actual

En esta fase el addon solo contiene el dominio de marcas comerciales:

- entidad principal de marca
- tabla puente hacia productos vendibles de Odoo
- vistas nativas para mantenimiento
- seguridad base
- documentacion tecnica de BD

## Responsabilidades

`zrn_commercial` debe concentrar:

- maestros comerciales operativos
- relaciones de productos con capa comercial
- futura estructura para portafolio, clientes comerciales, canales y pricing

No debe concentrar:

- hubs o dashboards analiticos
- simulaciones
- planeacion de produccion o abastecimiento

## Criterio de crecimiento

Cuando entren nuevos frentes en este addon:

1. cada dominio debe tener modelos y vistas propios
2. las acciones deben mantenerse desacopladas por dominio funcional
3. las metricas deben consumirse despues desde addons analiticos, no calcularse aqui por defecto
