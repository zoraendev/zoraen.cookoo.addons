# UI/UX de (ZRN) Planeacion

## Direccion visual

La interfaz debe sentirse:

- operativa
- administrativa
- compacta
- clara para priorizar
- alineada con Odoo

## Reglas visuales

- usar fondos claros y estructura nativa de Odoo
- evitar layouts tipo landing o dashboards de marketing
- priorizar acciones, estados y tablas
- usar tarjetas solo para agrupar informacion util
- mantener radios suaves entre `6px` y `8px`

## Colores base

El addon reutiliza la base visual ya trabajada en `Prodigyn` y mantiene variables de color de Zoraen para no romper continuidad:

- marca principal: azules Zoraen
- acentos operativos: verdes suaves para acciones de abastecimiento o estado favorable
- fondos: blancos y grises administrativos
- texto: alto contraste, sin decoracion

## Componentes clave

- centro de planeacion con menu corto por frentes
- tablero de produccion con accesos rapidos
- filtros operativos con resumen inmediato
- reportes de resultados en tablas nativas de Odoo
- placeholders sobrios donde aun no exista logica final

## Criterio de crecimiento

Antes de agregar nuevos bloques:

1. validar si la informacion ayuda a decidir
2. validar si debe vivir en planeacion y no en analitica
3. mantener densidad funcional sin llenar la vista de contenedores
