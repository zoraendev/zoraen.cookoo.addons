# Arquitectura de (ZRN) Planeacion

## Objetivo

Mantener la capa de planeacion operativa en un dominio independiente para que el stack evolucione por areas funcionales.

## Incluido en esta migracion

- `production planning`
- `purchase planning`
- `delivery planning`
- `mfg_plan`
- assets visuales y controladores necesarios para estas vistas

## No incluido aun

- hubs de reporteria
- reporterias comerciales
- marcas comerciales
- planeacion comercial

## Sincronizacion con fabricacion

- Las lineas de planes basados en ventas u ordenes de fabricacion explotan su receta y guardan el detalle en `zrn_planning.mfg.plan.supply`.
- Los planes mixtos conservan el detalle calculado por el flujo de abastecimiento y no se sobrescriben desde la receta.
- `qty_executed` no almacena un valor inicial: se calcula desde `mrp.production.qty_produced` para todas las OF activas vinculadas a la linea.
- Al dividir una OF, las OF de respaldo heredan los enlaces al plan y a su linea para evitar perder cantidades ejecutadas.

## Estrategia

- mantener `zrn_planning` con namespace propio
- consolidar primero lo operativo que ya esta avanzado
- dejar listas las bases para evolucionar menus, reportes y dependencias por dominio
