# ER Marcas Comerciales

## Objetivo

Separar la entidad de marca comercial de los productos vendibles de Odoo para poder agrupar metricas futuras de ventas, compras e inventario sin duplicar logica transaccional.

## Reglas base

- Una marca comercial puede tener muchos productos asignados.
- Un producto de Odoo solo puede pertenecer a una marca comercial dentro de esta capa.
- La tabla puente solo guarda la relacion y datos de apoyo.
- La marca comercial es una entidad propia del cliente dentro de (ZRN) Manejo Comercial; no depende del maestro de clientes o proveedores de Odoo.

## Diagrama ER

```mermaid
erDiagram
    ZRN_COMMERCIAL_COMMERCIAL_BRAND ||--o{ ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT : agrupa
    ZRN_COMMERCIAL_COMMERCIAL_BRAND }o--|| RES_COMPANY : pertenece_a
    ZRN_COMMERCIAL_COMMERCIAL_BRAND }o--|| RES_COUNTRY : origen
    ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT }o--|| PRODUCT_PRODUCT : asigna
    ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT }o--|| PRODUCT_TEMPLATE : plantilla
    ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT }o--|| PRODUCT_CATEGORY : categoria
    ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT }o--|| UOM_UOM : unidad

    ZRN_COMMERCIAL_COMMERCIAL_BRAND {
        bigint id PK
        varchar name
        varchar code UK
        boolean active
        bigint company_id FK
        varchar owner_name
        bytea logo
        varchar website
        varchar email
        varchar phone
        bigint country_id FK
        date launch_date
        text description
        text notes
        timestamp create_date
        bigint create_uid
        timestamp write_date
        bigint write_uid
    }

    ZRN_COMMERCIAL_COMMERCIAL_BRAND_PRODUCT {
        bigint id PK
        integer sequence
        bigint brand_id FK
        bigint company_id FK
        bigint product_id FK UK
        bigint product_tmpl_id FK
        varchar default_code
        bigint categ_id FK
        bigint uom_id FK
        boolean active
        text notes
        timestamp create_date
        bigint create_uid
        timestamp write_date
        bigint write_uid
    }
```
