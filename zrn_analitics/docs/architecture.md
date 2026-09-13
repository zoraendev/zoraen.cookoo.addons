# Arquitectura de (ZRN) Analitica

## Objetivo

Separar la capa de reporteria, hubs y analisis de datos en un addon independiente y mantenible.

## Alcance actual

En esta fase el addon solo contiene la base estructural:

- modelo contenedor para la pantalla principal
- dos paginas singleton para resumen y workspace
- accion principal y navegacion interna
- assets base para una UI analitica sobria

## Responsabilidades

`zrn_analitics` debe concentrar:

- hubs
- reporteria
- dashboards
- procesamiento de datos para analitica

No debe concentrar:

- planeacion operativa
- CRUD comercial operativo
- simulaciones

## Criterio de crecimiento

Cuando entren frentes reales:

1. cada hub debe vivir en vistas o modelos propios
2. la navegacion debe mantenerse desacoplada por dominio funcional
3. los assets deben seguir siendo sobrios y orientados a trabajo interno
