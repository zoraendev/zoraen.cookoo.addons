# Manual Maestro de Hubs Analytics

## 1. Objetivo del manual

Este manual documenta la implementacion actual de los hubs de `zrn_analitics` para que cualquier usuario o responsable de negocio pueda entender:

- que muestra cada hub;
- de donde salen los datos;
- como se calcula cada indicador;
- por que un dato aparece en una seccion y no en otra;
- como usar cada vista para analizar negocio, validar informacion y tomar decisiones.

El documento esta escrito sobre la logica real hoy implementada en el addon. No describe un diseño ideal ni una vision futura: describe el comportamiento actual del sistema.

## 2. Alcance actual

Los hubs activos en la navegacion actual son:

1. Hub Comercial
2. Hub Financiero
3. Hub Operaciones
4. Hub PDV / Cobertura
5. Hub RRHH

Existe un archivo `hub_direction.xml`, pero no esta expuesto en la navegacion actual del cliente `zrn_analitics.hubs`, por lo que no se documenta como hub operativo vigente.

## 3. Fuentes principales de datos

La capa analitica usa principalmente estas fuentes:

- `sale.order` y `sale.order.line`: ventas, pedidos, revenue, unidades, recencia, clientes, PDVs, tendencias.
- `res.partner`: clientes, PDVs, razon comercial y estructura de cuentas.
- `product.product` y `product.category`: SKUs, categorias, precios y costo estandar.
- `zrn_commercial.commercial.brand`: marcas comerciales activas.
- `zrn_commercial.commercial.channel`: canales comerciales.
- `zrn_commercial.commercial.channel.partner`: asignacion de clientes o PDVs a canales.
- `zrn_commercial.product.channel` y relaciones asociadas: canal de producto para lectura operativa, inventarios y compras.
- `stock.quant`: existencias, disponible, reservado, cobertura.
- `purchase.order` y `purchase.order.line`: compras, backlog, montos abiertos, lead time.
- `hr.applicant`, `hr.job`: solicitudes y pipeline de reclutamiento.
- modelos propios de RRHH dentro de `zrn_analitics`: predictor, checklist y patrones validados.

## 4. Reglas transversales que aplican a varios hubs

### 4.1 Periodos

Los hubs comerciales, financieros, de PDV y cobertura usan estos cortes:

- `YTD`: desde el 1 de enero del anio actual hasta hoy.
- `Mes actual`
- `Ultimos 90 dias`
- `Ultimos 12 meses`

El Hub Operaciones usa la misma logica base, pero ademas convierte el periodo a dias para calcular demanda diaria, mensual y rotacion.

### 4.2 Productos incluidos

La mayor parte de los hubs solo considera productos asociados a marcas activas de `(ZRN) Manejo Comercial`.

Eso significa:

- si un producto no tiene marca comercial activa, puede quedar fuera de hubs comerciales y operativos;
- en financiero, el revenue puede existir, pero el revenue matcheado y el margen teorico solo existen si hay match de marca y costo estandar.

### 4.3 Resolucion de canal

El canal comercial se toma desde la asignacion del partner en `zrn_commercial.commercial.channel.partner`.

Si un cliente o PDV no esta asignado a canal:

- puede quedar fuera de analisis de canal;
- o aparecer como dato incompleto segun la vista.

### 4.4 Diferencia entre cliente, cuenta comercial y PDV

El sistema usa tres niveles que conviene no mezclar:

- `commercial_partner`: cuenta comercial consolidada.
- `partner`: punto especifico o contacto operativo.
- `PDV`: para efectos del hub, normalmente corresponde al partner operativo donde cae la transaccion.

Por eso puede pasar que:

- una cuenta comercial tenga varios PDVs;
- el hub comercial muestre mas cuentas que canales;
- el hub PDV tenga mas puntos que clientes consolidados.

## 5. Hub Comercial

### 5.1 Proposito del hub

El Hub Comercial centraliza el analisis de ventas de marcas activas, clientes, portafolio, cobertura, comportamiento de compra y posicionamiento de SKUs.

![Pantalla Principal de (ZRN) Analitica](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783400915605.png)

Sirve para:

- revisar desempeno comercial;
- entender donde se vende;
- identificar concentracion, huecos de portafolio y riesgo de clientes;
- analizar tendencia de productos;
- apoyar decisiones de surtido, cobertura y foco comercial.

### 5.2 Filtros del hub

Filtros disponibles:

- Periodo
- Marca
- Categoria
- Canal
- Busqueda libre por cliente, PDV, producto o codigo

Los filtros afectan los tabs que dependen del payload comercial o de cobertura.

### 5.3 Tab: Overview

![Hub Comercial - Vista Principal](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783400945076.png)

#### Seccion: KPIs principales

Campos:

- Venta total
- Pedidos
- Cuentas comerciales
- PDVs
- Ticket promedio

Calculo:

- `Venta total`: suma de `sale.order.line.price_total` de lineas filtradas y con producto asociado a marca activa.
- `Pedidos`: conteo unico de `sale.order.id`.
- `Cuentas comerciales`: conteo de cuentas consolidadas con venta.
- `PDVs`: conteo de partners con venta.
- `Ticket promedio`: `venta total / pedidos`.

Uso de negocio:

- medir tamano del negocio en el periodo;
- distinguir crecimiento por volumen de cuentas vs crecimiento por frecuencia;
- validar si la venta sube por mas pedidos o por ticket.

#### Seccion: Venta por mes

Que muestra:

- serie mensual YTD o del periodo filtrado.

Calculo:

- agrupa revenue por mes usando `order_id.date_order`;
- solo suma lineas de productos ligados a marcas activas;
- valor por mes = suma de `price_total`.

Uso:

- leer estacionalidad;
- detectar meses de aceleracion o frenado;
- comparar si el cambio viene por una marca o por todo el portafolio.

#### Seccion: Mix por marca

Que muestra:

- participacion de cada marca sobre la venta filtrada.

Calculo:

- revenue por marca = suma de `price_total` de lineas cuyo producto pertenece a esa marca;
- `% mix` = `venta de la marca / venta total`.

Uso:

- ver dependencia comercial por marca;
- validar si el crecimiento esta concentrado;
- detectar marcas subdesarrolladas.

#### Seccion: Top clientes

Que muestra:

- ranking de cuentas con mayor venta acumulada.

Calculo:

- agrupa por cuenta cliente;
- revenue = suma de `price_total`;
- pedidos = conteo unico de pedidos de esa cuenta.

Uso:

- priorizar gestion comercial;
- ver dependencia de clientes grandes;
- cruzar con RFM o riesgo.

#### Seccion: Top productos

Que muestra:

- ranking de productos por venta.

Calculo:

- agrupa por `product_id`;
- unidades = suma de `product_uom_qty`;
- venta = suma de `price_total`.

Uso:

- detectar locomotoras del negocio;
- validar concentracion de revenue;
- abrir detalle por canal y PDV.

### 5.4 Tab: Portafolio

![Hub Comercial - Vista de Portafolio](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783400960631.png)

#### Seccion: Filtros del tab

Usa el mismo set de filtros comerciales, aplicados sobre la estructura de portafolio por marca, linea y SKU.

#### Seccion: Vista por unidades, marcas y lineas

Que muestra:

- jerarquia comercial: marca -> categoria o linea -> producto.

Calculo:

- para cada marca se acumula revenue y unidades;
- para cada categoria dentro de la marca se repite el mismo calculo;
- para cada SKU se calcula revenue y unidades propias.

Uso:

- revisar profundidad de portafolio;
- identificar lineas pesadas y lineas accesorias;
- detectar si una marca esta sostenida por pocos productos.

#### Seccion: Drill-down de detalle

Cada fila puede abrir detalle con:

- revenue;
- unidades;
- pedidos;
- PDVs;
- desglose por canal;
- top PDVs o lineas segun el nivel.

Uso:

- justificar por que una marca o linea pesa;
- validar donde realmente rota cada bloque del portafolio.

### 5.5 Tab: Cobertura

Este tab usa `get_coverage_dashboard_data`.

![Hub Comercial - Cobertura Panel Superior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783400987654.png)

#### Seccion: Summary cards

Campos:

- PDVs en universo
- PDVs facturados YTD
- White space ponderado
- Clientes A/B con holes
- Clientes A/B en riesgo

Calculo:

- `PDVs en universo`: total de partners con actividad comercial real del ultimo anio movil; si no hay actividad suficiente, usa fallback de clientes con `customer_rank > 0`.
- `PDVs facturados YTD`: clientes con venta en el periodo y dentro de marcas activas.
- `White space ponderado`: suma de `network_total - active` por canal.
- `Clientes A/B con holes`: cuentas A/B con al menos 2 SKUs core faltantes.
- `Clientes A/B en riesgo`: cuentas A/B con recencia alta o caida de cobertura.

Uso:

- medir cobertura real vs universo disponible;
- ver donde hay crecimiento por penetracion, no solo por sell-in.

#### Seccion: Cobertura por canal

Campos:

- canal
- activos
- red total
- cobertura %
- white space
- revenue
- mix %
- ticket promedio

Calculo:

- `activos`: clientes con venta del periodo en ese canal;
- `red total`: universo del canal construido desde historico comercial del ultimo anio;
- `cobertura %` = `activos / red total`;
- `white space` = `red total - activos`;
- `mix %` = `revenue del canal / revenue total cobertura`;
- `ticket promedio` = `revenue del canal / activos`.

Uso:

- identificar canales con oportunidad de penetracion;
- diferenciar canal grande con baja captura vs canal de cobertura saturado.

![Hub Comercial - Cobertura Panel Inferior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401007512.png)

#### Seccion: Matriz canal x marca

Que muestra:

- revenue por marca dentro de cada canal.

Calculo:

- para cada canal se suma revenue por marca usando `price_total`.

Uso:

- detectar donde una marca no esta entrando;
- revisar especializacion de canal.

#### Seccion: Distribucion de SKUs

Campos:

- SKU
- marca
- revenue
- PDVs
- `% PDV`
- canales

Calculo:

- `PDVs`: cantidad de clientes distintos que compraron el SKU;
- `% PDV` = `PDVs del SKU / total de clientes activos`;
- `canales`: cantidad de canales donde aparece el SKU.

Uso:

- separar SKUs ancla de SKUs nicho;
- medir amplitud real de distribucion.

#### Seccion: Portfolio holes

Que muestra:

- clientes A/B comparados contra los 5 SKUs core.

Calculo:

- `core_skus`: top 5 SKUs por revenue dentro de `sku_distribution`;
- para cada cliente A/B se revisa cuales de esos core estan presentes y cuales faltan;
- `gap_count` = cantidad de core faltantes.

Uso:

- priorizar cierre de huecos de surtido;
- detectar cuentas grandes con baja profundidad.

#### Seccion: Clientes en riesgo

Campos:

- cliente
- canal
- clase ABC
- segmento
- revenue
- dias desde la ultima compra
- meses activos
- producto principal
- accion sugerida

Calculo:

- solo se evalua para clientes A/B;
- si `days_since_last >= 20` o hay `2 o mas` SKUs core faltantes, entra al radar;
- el segmento se asigna por recencia y criticidad;
- la accion sugerida cambia segun severidad.

Uso:

- ordenar recuperacion comercial;
- separar cuentas para reactivacion vs cuentas para expansion de portafolio.

### 5.6 Tab: Por Canal

Este tab usa `get_channel_dashboard_data`.

![Hub Comercial - Por Canal](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401420428.png)

#### Seccion: Summary cards

Campos:

- Canales activos
- Revenue filtrado
- PDVs filtrados
- Ticket promedio

Calculo:

- `Canales activos`: cantidad de canales con data luego de filtros;
- `Revenue filtrado`: suma de `price_total`;
- `PDVs filtrados`: total de puntos activos con venta;
- `Ticket promedio`: `revenue / pedidos`.

#### Seccion: Filas por canal

Cada canal consolida:

- customer_count
- point_count
- order_count
- units
- revenue
- mix %
- average_ticket
- brand_count
- last_order_label

Calculo:

- agrupa cada linea por canal resuelto del partner;
- `mix %` = `revenue canal / revenue total del tab`;
- `average_ticket` = `revenue canal / pedidos del canal`;
- `brand_count` = numero de marcas con venta en ese canal.

#### Secciones de detalle al abrir un canal

El detalle del canal incluye:

- resumen general;
- top marcas;
- top categorias;
- top clientes;
- top PDVs;
- top productos.

Uso:

- entender de que esta compuesto un canal;
- decidir expansion de marcas, limpieza de surtido o foco por cuentas.

### 5.7 Tab: Por Cliente / PDV

![Hub Comercial - Por Cliente](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401429379.png)

#### Seccion: Dataset completo de clientes

Que muestra:

- lista amplia de clientes con revenue, unidades, facturas, recencia, ticket, margen estimado, canal principal y producto principal.

Calculo:

- `rev`: suma de revenue por cliente;
- `units`: suma de unidades;
- `invoices`: conteo de pedidos;
- `days_since`: dias desde ultima compra;
- `ticket_avg`: `rev / invoices`;
- `margin_pct`: `(rev - cost_amount) / rev`;
- `primary_channel`: canal con mayor revenue;
- `primary_product`: producto con mayor revenue en ese cliente.

Uso:

- validar calidad de cartera;
- localizar clientes con peso pero mala recencia;
- cruzar con RFM o holes.

### 5.8 Tab: Clientes RFM

Este tab calcula y muestra las métricas de recencia y frecuencia de la cartera de clientes.

![Hub Comercial - Clientes RFM Superior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401452215.png)

#### Seccion: Segmentacion RFM

Variables:

- `R`: recencia
- `F`: frecuencia
- `M`: valor monetario

Calculo de `M`:

- los clientes se ordenan por revenue;
- se asigna score 4, 3, 2 o 1 por cuartiles.

Calculo de `R`:

- se mide en meses desde la ultima compra;
- 0 meses = 4;
- 1 = 3;
- 2 = 2;
- 3 o mas = 1.

Calculo de `F`:

- cuenta meses activos con compra;
- 4 o mas = 4;
- 3 = 3;
- 2 = 2;
- 1 = 1.

Segmentos generados:

- Campeon
- Leal
- No perderlo
- En riesgo
- Prometedor
- Atender
- Nuevo
- Hibernando
- Esporadico

![Hub Comercial - Clientes RFM Inferior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401460907.png)

#### Seccion: ABC de clientes

Calculo:

- sobre clientes ordenados por revenue acumulado;
- `A`: hasta 80% de revenue acumulado;
- `B`: de 80% a 95%;
- `C`: resto.

#### Seccion: Pareto

Calculo:

- porcentaje acumulado de revenue vs porcentaje de clientes.

Uso:

- medir concentracion;
- validar cuantas cuentas explican el negocio.

#### Uso de negocio del tab

- definir prioridad de visita;
- proteger clientes campeones o leales;
- detectar reactivacion en clientes en riesgo;
- revisar si la cartera nueva se esta convirtiendo en cartera frecuente.

### 5.9 Tab: Cliente Insights

Este tab agrupa analiticas derivadas del dataset de clientes.

![Hub Comercial - Cliente Insights](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401475558.png)

#### Seccion: Cohort retention

Calculo:

- cada cliente se asigna al mes de primera compra;
- por cada cohorte se mide cuantos siguen activos en meses posteriores;
- `retention_pct = clientes activos del mes / tamano de la cohorte`.

Uso:

- saber si los clientes nuevos vuelven o se pierden;
- medir calidad de adquisicion y onboarding comercial.

#### Seccion: Market basket

Calculo:

- por pedido se construye el set de productos comprados juntos;
- se cuentan pares de productos;
- se calcula:
  - `support = pedidos con el par / total de pedidos`
  - `confidence A->B = pedidos con A y B / pedidos con A`
  - `lift = total_pedidos * count_par / (count_A * count_B)`

Uso:

- detectar bundles naturales;
- diseniar cross-sell;
- validar afinidad entre SKUs.

#### Seccion: Cadencia de recompra

Calculo:

- para cada cliente se miden intervalos entre compras;
- se usa mediana y promedio de dias;
- segmentos:
  - `regular`: mediana <= 15 dias
  - `bimensual`: mediana <= 30 dias
  - `esporadico`: mediana > 30 dias
  - `unico`: una sola compra
- `fugado`: cliente regular o bimensual que supera `max(14, 2 * mediana_intervalo)` dias sin compra.

Uso:

- medir frecuencia real;
- detectar clientes que ya se salieron del patron esperado.

#### Seccion: LTV forecast

Calculo:

- solo considera clientes ABC A o B;
- toma revenue de los ultimos 3 meses observados;
- calcula promedio reciente y pendiente simple;
- proyecta 3 meses futuros con una extension lineal controlada.

Uso:

- priorizar clientes con alto valor futuro;
- detectar cuentas que merecen inversion comercial.

### 5.10 Tab: Por Producto

#### Seccion: Grafica de productos

Muestra top 10 productos por revenue, en modo barra, linea o pie.

Calculo:

- ordena `all_products` por `rev`;
- toma los 10 primeros.

#### Seccion: Tabla completa de productos

Campos:

- producto
- marca
- categoria
- revenue
- unidades
- lineas o pedidos
- canales
- precio unitario promedio real

Calculo:

- `avg_unit_price_real = sales_amount / quantity_sold`.

Uso:

- revisar portafolio ganador;
- entender amplitud vs profundidad por SKU.

### 5.11 Tab: Tendencias

Este apartado analiza la aceleración o declive de cada SKU.

![Hub Comercial - Tendencias de Venta](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401744992.png)

#### Seccion: Growers y Decliners

Calculo:

- compara el ritmo del ultimo mes contra el ritmo acumulado previo;
- `pace_last = unidades ultimo mes / dias del ultimo mes`;
- `pace_prev = unidades periodo previo / dias previos`;
- `trend % = ((pace_last - pace_prev) / pace_prev) * 100`.

Uso:

- detectar productos acelerando;
- identificar SKUs en caida antes de que se note en cierre mensual.

### 5.12 Tab: Sell-in vs Sell-out

#### Importante

La implementacion actual simula sell-out para cadenas especificas.

Actualmente trabaja sobre:

- `Walmart/Paiz`
- `PUMA Super 7`

Calculo:

- `sell-in`: revenue y unidades facturadas;
- `sell-out`: simulacion con un factor pseudoaleatorio estable por producto, partner y mes;
- `sell-through % = sellout / sellin`;
- `gap = sellin - sellout`;
- `days_of_cover` usa stock implicito `sellin_u - sellout_u` dividido por consumo estimado.

Uso:

- solo como senal analitica aproximada mientras no exista fuente real de sell-out;
- no debe usarse como verdad contable ni inventario exacto de cliente.

### 5.13 Tab: Matriz BCG

Este cuadrante clasifica dinámicamente tu portafolio según margen y volumen de venta.

![Hub Comercial - Matriz BCG](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401780169.png)

#### Seccion: Dataset BCG

Variables por SKU:

- revenue `r`
- unidades `u`
- margen bruto %
- ganancia bruta `g`
- share de revenue `s`

Calculo:

- `margin_val = rev - cost_amount`
- `margin_pct = margin_val / rev`
- mediana de revenue = `mr`
- mediana de margen % = `mm`

Clasificacion:

- `S`: alta venta y alto margen
- `C`: alta venta y bajo margen
- `I`: baja venta y alto margen
- `D`: baja venta y bajo margen

Uso:

- priorizar SKUs estrella;
- decidir donde defender volumen, donde subir margen y donde descontinuar.

## 6. Hub Financiero

### 6.1 Proposito del hub

Traducir ventas comerciales en lectura financiera usando revenue, costo teorico y margen bruto teorico.

### 6.2 Regla central del hub

El margen es teorico, no contable.

Calculo base por linea:

- `revenue = price_total`
- `standard_cost = product.standard_price`
- hay `match` si el producto tiene marca activa y costo estandar > 0
- `matched_revenue = revenue` solo si hay match
- `cost = standard_cost * quantity` solo si hay match
- `margin = matched_revenue - cost`
- `margin % = margin / matched_revenue`

### 6.3 Tab: Resumen

Este apartado consolida los indicadores generales de rentabilidad de las marcas.

![Hub Financiero - Resumen](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401833879.png)

#### Seccion: KPIs

- Revenue
- Revenue matcheado
- Cobertura
- Costo teorico
- Margen
- Margen %

Calculo:

- `Cobertura = matched_revenue / revenue`
- `Margen % = margin / matched_revenue`

Uso:

- medir cuanta venta esta financieramente trazable;
- detectar huecos de costo o marca.

#### Seccion: Evolucion financiera

Muestra revenue, costo y margen por mes.

Uso:

- leer expansion o compresion de margen;
- revisar si el negocio crece con rentabilidad o la sacrifica.

#### Seccion: Margen por marca

Mide contribucion de margen por marca.

Uso:

- separar marcas que venden de marcas que realmente dejan margen.

#### Seccion: Margen % por canal

Compara la calidad del revenue por canal.

Uso:

- decidir mezcla de canales;
- revisar si un canal grande destruye margen.

#### Seccion: Notas y fuentes

Sirve como trazabilidad del dato y recordatorio de que el costo es teorico.

### 6.4 Tab: Por Producto

Este apartado detalla el margen bruto por SKU individual.

![Hub Financiero - Por Producto](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401847292.png)

#### Secciones

- top 10 por margen
- top 10 por margen %
- ranking completo de productos

Campos clave:

- revenue
- revenue matcheado
- costo
- margen
- margen %
- canales

Uso:

- detectar SKUs rentables vs SKUs que solo mueven caja;
- abrir detalle por canal y PDV.

### 6.5 Tab: Por Canal

Analiza la dispersión de márgenes brutos por canal de mercado.

![Hub Financiero - Por Canal](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401871581.png)

#### Secciones

- ranking de canales
- matriz producto-canal
- detalle financiero por canal

Uso:

- revisar donde se genera margen y donde se erosiona;
- ver combinaciones producto-canal con margen fuerte o debil.

### 6.6 Tab: Por Marca

#### Secciones

- ranking de marcas
- detalle financiero por marca

Uso:

- comparar marcas por rentabilidad, no solo por venta.

### 6.7 Tab: Portafolio

Este tab muestra la jerarquía financiera unificada de marcas y categorías del catálogo.

![Hub Financiero - Portafolio](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401977722.png)

#### Estructura

Unidad -> Marca -> Linea -> SKU

Calculo:

- la unidad se toma del nivel superior de categoria;
- cada nivel acumula revenue, matched_revenue, costo, margen y SKUs.

Uso:

- entender donde se genera margen dentro del arbol del portafolio;
- apoyar decisiones de racionalizacion o expansion.

### 6.8 Tab: Alertas

Visualiza inconsistencias de costos, marcas o márgenes atípicos.

![Hub Financiero - Alertas](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783401989697.png)

Reglas actuales:

- productos con revenue sin costo o sin marca activa;
- productos con margen <= 10% y revenue relevante;
- concentracion alta por canal;
- concentracion alta por marca.

Uso:

- revisar calidad de maestra de productos;
- detectar dependencia riesgosa.

## 7. Hub Operaciones

### 7.1 Proposito del hub

Convertir ventas en lectura de demanda, cobertura, rotacion, inventarios y compras.

### 7.2 Logica central

La demanda es inferida desde ventas.

Eso significa:

- no mide demanda perfecta;
- mide salida historica usada como proxy para planificacion.

### 7.3 Variables operativas base por SKU

Calculos:

- `units_per_day = units / period_days`
- `units_per_month = units * 30 / period_days`
- `weekly_suggestion = units_per_day * 7`
- `biweekly_suggestion = units_per_day * 15`
- `days_since_last = hoy - ultima venta`

ABC:

- por revenue acumulado:
  - `A` hasta 80%
  - `B` hasta 95%
  - `C` resto

Rotacion:

- `frequency_pct = days_active / period_days`
- `Alta` si >= 0.65
- `Media` si >= 0.35
- `Baja` si >= 0.15
- `Muy Baja` si < 0.15

### 7.4 Tab: Resumen

Consolida los principales KPIs y tendencias operativas a nivel físico.

![Hub Operaciones - Resumen Superior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402023401.png)

#### Seccion: KPIs

- Unidades vendidas
- Revenue
- Pedidos
- PDVs
- SKUs activos
- Promedio unid/dia

#### Seccion: Demanda mensual

Muestra revenue y unidades por mes, con proyeccion del mes parcial.

Calculo:

- `projected = valor_actual * dias_mes / dias_con_data`

#### Seccion: Mix por marca

Usa unidades, no revenue.

Uso:

- leer peso operativo real.

#### Seccion: Distribucion ABC

Cuenta cuantos SKUs caen en A, B o C.

#### Seccion: Distribucion de rotacion

Cuenta cuantos SKUs caen en Alta, Media, Baja o Muy Baja.

![Hub Operaciones - Resumen Inferior](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402037183.png)

#### Seccion: Top SKUs

Ordena por unidades vendidas.

Uso:

- detectar motores operativos;
- priorizar abastecimiento.

### 7.5 Tab: Demanda

Establece las sugerencias de lotes basadas en la demanda inferida por día y mes.

![Hub Operaciones - Plan de Producción Sugerido](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402053085.png)

#### Seccion: Plan de produccion sugerido

Campos:

- SKU
- marca
- ABC
- rotacion
- unidades por mes
- unidades por dia
- sugerencia semanal
- sugerencia quincenal

Uso:

- traducir ventas historicas a una recomendacion operativa base;
- no reemplaza forecast avanzado, pero si acelera planificacion tactica.

### 7.6 Tab: Rotacion y ABC

Este apartado cruza de forma matricial la clasificación ABC por volumen de venta con los niveles de rotación operativa.

![Hub Operaciones - Rotación y ABC](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402163276.png)

#### Secciones

- lectura cruzada de clase ABC;
- lectura cruzada de rotacion;
- ranking de productos con revenue, unidades, recencia y comportamiento.

Uso:

- separar productos importantes con mala rotacion;
- detectar SKUs pequenos pero con alta recurrencia.

### 7.7 Tab: Portafolio

Permite analizar el desglose de unidades demandadas y pedidos a través del árbol del catálogo.

![Hub Operaciones - Portafolio](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402182852.png)

#### Estructura

Unidad -> Marca -> Linea -> SKU

Mide:

- unidades
- revenue
- cantidad de SKUs
- pedidos

Uso:

- entender complejidad operativa por bloque;
- alinear portafolio comercial con carga logistica.

### 7.8 Tab: Tendencias

Estudia la aceleración del ritmo diario proyectado frente a meses anteriores de cada SKU.

![Hub Operaciones - Tendencias](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402214700.png)

#### Secciones

- growers
- decliners
- detalle completo de tendencia

Calculo:

- compara ritmo del mes actual proyectado contra ritmo previo.

Uso:

- detectar cambios de demanda;
- anticipar compra o reduccion.

### 7.9 Tab: Forecast

Establece estimaciones lineales y de promedios para planificar la demanda futura.

![Hub Operaciones - Forecast](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402234685.png)

#### Seccion: Forecast mensual

Calcula proyeccion del mes y blend para siguiente mes.

Calculo:

- proyecta el mes parcial a cierre;
- toma los ultimos meses proyectados;
- calcula promedio movil y proyeccion lineal;
- `next_month_blend = (trailing_average + linear_projection) / 2`
- `runrate_annual = next_month_blend * 12`

#### Seccion: Pace por canal

Campos:

- total YTD
- parcial actual
- proyectado actual
- ultimo mes completo
- `% proyectado vs ultimo mes`

Uso:

- revisar aceleracion por canal;
- anticipar carga operativa y abastecimiento.

### 7.10 Tab: Inventarios

Conecta el stock disponible (`stock.quant`) con el consumo diario para alertar riesgos de quiebre o sobrestock.

![Hub Operaciones - Inventarios](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783402313725.png)

#### Fuente principal

- `stock.quant`

#### Variables base

- `on_hand`
- `available`
- `reserved`
- `inventory_value = on_hand * standard_price`
- `coverage_days = available / demand_per_day` cuando existe demanda

Referencias del canal de producto:

- `min_stock_days`
- `target_stock_days`
- `max_stock_days`

Clasificacion de cobertura:

- Sin demanda
- Sin stock
- Bajo minimo
- En rango
- Sobrestock

#### Secciones

- resumen de inventario
- distribucion de cobertura
- mix de stock por marca
- mix por canal de producto
- SKUs en riesgo
- sobrestock
- baja rotacion con stock

Uso:

- priorizar reposicion;
- identificar capital inmovilizado;
- revisar productos sin clasificacion logistica.

### 7.11 Tab: Compras

Este apartado centraliza el análisis del gasto, lead times e histórico por proveedor de compras confirmadas.

![Hub Operaciones - Compras](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783474753398.png)

#### Fuente principal

- `purchase.order.line`
- `purchase.order`
- recepciones `incoming`

#### KPIs

- ordenes abiertas
- monto abierto
- spend del periodo
- lead time promedio
- lineas atrasadas
- concentracion top proveedor

Calculos:

- `open_qty = product_qty - qty_received`
- `open_amount = open_qty * price_unit`
- `lead_time = fecha primera recepcion - fecha aprobacion`
- `supplier_concentration_pct = spend proveedor top / spend total`

#### Secciones

- spend mensual
- top proveedores
- proveedores
- ordenes abiertas
- backlog por SKU

Uso:

- controlar dependencia de proveedores;
- detectar atrasos y backlog;
- alinear compra con demanda.

### 7.12 Tab: Alertas

Visualiza de manera unificada las excepciones operacionales y cuellos de botella detectados.

![Hub Operaciones - Alertas](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783475309284.png)

Reglas actuales:

- concentracion por marca;
- SKUs sin venta reciente;
- clase A con rotacion baja;
- inventario en riesgo;
- sobrestock;
- productos sin canal de producto;
- compras atrasadas;
- concentracion por proveedor.

Uso:

- operar excepciones;
- crear lista corta de acciones semanales.

## 8. Hub PDV / Cobertura

### 8.1 Proposito del hub

Leer desempeno por punto de venta, no solo por cliente consolidado.

### 8.2 Relacion con otros hubs

Este hub reutiliza:

- hub comercial para sell-in;
- dashboard de cobertura para universo y penetracion;
- logica de alertas operativas por punto.

### 8.3 Tab: Overview

Este panel principal del Hub PDV resume la actividad de ventas a nivel punto geográfico u operativo.

![Hub PDV - Overview](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783475641836.png)

#### KPIs

- Revenue YTD
- PDVs activos
- Ticket promedio
- PDVs nuevos
- PDVs con alertas

Calculo:

- `Revenue YTD`: suma de revenue por PDV;
- `PDVs activos`: cantidad de PDVs con venta;
- `Ticket promedio`: `revenue / pedidos`;
- `PDVs nuevos`: puntos con alerta de alta reciente;
- `PDVs con alertas`: puntos con al menos una alerta.

#### Seccion: Revenue por mes

Mide revenue por mes a nivel punto de venta.

#### Seccion: Cobertura por canal

Compara:

- PDVs activos
- red total del canal

La logica viene del payload de cobertura.

#### Seccion: Top PDVs

Ranking por revenue.

#### Seccion: Altas recientes y dormancia

Calculo:

- `nuevo`: pocos dias desde primera compra;
- `dormante`: muchos dias desde ultima compra.

Uso:

- activar onboarding;
- recuperar puntos en fuga.

### 8.4 Tab: Ranking PDVs

Presenta un listado consolidado y ordenado de los puntos de venta según volumen facturado.

![Hub PDV - Ranking PDVs](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783476063349.png)

Campos:

- rank
- PDV
- canal
- subcanal
- revenue
- pedidos
- ticket
- recencia

Calculo:

- `avg_ticket = revenue / invoices`
- `days_since_last = hoy - ultima compra`

Uso:

- priorizar PDVs clave;
- ver puntos fuertes y debiles por canal.

### 8.5 Tab: Canales PDV

Desglosa comparativas de sell-in y simulaciones de sell-out por canal de distribución.

![Hub PDV - Canales PDV](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783476207170.png)

#### Importante

Esta vista mezcla sell-in con sell-out simulado cuando aplica.

#### KPIs y detalle

- sell-in
- sell-out
- sell-through
- cobertura o days of cover

Calculo:

- si el canal soporta sell-out simulado, usa esa comparacion;
- si no, usa revenue como mejor aproximacion visible;
- `sell-through = sellout / sellin`.

Uso:

- leer eficiencia del punto;
- detectar acumulacion potencial.

### 8.6 Tab: Otras cadenas

Muestra el análisis y desempeño de las cadenas o canales de distribución secundarios.

![Hub PDV - Otras Cadenas](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783476434963.png)

Que muestra:

- cadenas o canales fuera de los principales comparables;
- revenue por canal;
- cantidad de PDVs activos;
- detalle por PDV.

Uso:

- no perder visibilidad del long tail;
- detectar cadenas pequenas que pueden escalar.

### 8.7 Tab: Alertas

Sección centralizada para aislar puntos dormantes, alertas de sell-through bajo y nuevos ingresos.

![Hub PDV - Alertas](/home/dgb/.gemini/antigravity/brain/1f5a542e-3c54-40bf-a62d-c6a9f1261aac/media__1783476451298.png)

KPIs:

- Dormantes
- Nuevos
- Low sell-through
- Total alertas

Alertas por PDV:

- dormancia;
- alta reciente;
- bajo sell-through;
- otras senales segun logica del ranking.

Uso:

- construir agenda operativa por punto;
- filtrar PDVs que requieren visita, reactivacion o correccion de surtido.

## 9. Hub RRHH

### 9.1 Proposito del hub

Apoyar evaluacion de candidatos y seguimiento de solicitudes de reclutamiento.

### 9.2 Fuente de datos

- `hr.applicant`
- `hr.job`
- predictor RRHH propio
- checklist de entrevista propio
- patrones validados propios

### 9.3 Flujo operativo general

1. Se selecciona una solicitud activa.
2. Se completa el predictor.
3. Se registra el checklist de entrevista.
4. Se recalculan patrones.
5. Se consulta historico y distribucion de riesgo.

### 9.4 Tab: Resumen

#### KPIs

- Solicitudes
- Con predictor
- Con checklist
- Riesgo alto
- Pendientes

Calculo:

- `Solicitudes`: total de `hr.applicant`;
- `Con predictor`: total de registros `zrn.rrhh.predictor`;
- `Con checklist`: total de `zrn.rrhh.interview.checklist`;
- `Riesgo alto`: predictores con nivel `high` o `very_high`;
- `Pendientes`: solicitudes sin flujo completo predictor + checklist + patrones.

#### Seccion: Distribucion de riesgo

Umbrales:

- bajo: `0.0 a 5.0`
- moderado: `5.1 a 12.0`
- alto: `12.1 a 20.0`
- muy alto: `> 20.0`

#### Seccion: Solicitudes por etapa

Agrupa por `stage_id`.

#### Seccion: Ultimas solicitudes

Muestra estado rapido de predictor, checklist y patrones.

#### Seccion: Puestos con mas solicitudes

Agrupa por `job_id`.

Uso:

- revisar carga del pipeline;
- medir avance de evaluaciones;
- detectar volumen por puesto y riesgo agregado.

### 9.5 Tab: Predictor

#### Logica general

Cada pregunta tiene:

- una opcion seleccionada;
- puntos base;
- peso.

Calculo:

- `score pregunta = puntos * peso`
- `score total = suma de scores`
- ademas se acumulan subtotales por factor:
  - familia
  - patrimonio
  - entorno
  - historial laboral
  - examen

Interpretacion:

- `<= 5`: riesgo bajo
- `<= 12`: moderado
- `<= 20`: alto
- `> 20`: muy alto

Uso:

- decidir si la solicitud debe avanzar;
- justificar entrevista ampliada o descarte.

#### Factores del predictor

##### Situacion familiar

- padres presentes
- contacto activo con padre y madre

##### Patrimonio y finanzas

- patrimonio congruente
- brechas de ingreso

##### Entorno y estilo de vida

- con quien vive
- tatuajes visibles abundantes

##### Historial laboral

- cantidad de empleos
- salidas por conflicto

##### Condiciones del examen

- alcohol reciente
- horas de suenio
- desayuno

### 9.6 Tab: Patrones Validados

#### Logica

Los patrones se activan combinando predictor y checklist.

Flags actuales:

- situacion familiar dificil
- patrimonio desproporcionado
- vive sin red familiar
- tatuajes visibles
- rotacion alta
- brechas sin explicar
- condiciones de examen

Severidad:

- `high` si hay 4 o mas patrones o predictor alto/muy alto;
- `moderate` si hay 2 o mas patrones o predictor moderado;
- `low` en los demas casos.

Uso:

- revisar consistencia de senales;
- detectar casos que ameritan validacion profunda.

### 9.7 Tab: Checklist Entrevista

#### Logica

Cada item es booleano: se marca si existe alerta o inconsistencia.

Secciones:

- Situacion familiar
- Patrimonio y finanzas
- Entorno y laboral
- Condiciones del examen

Calculo:

- `alert_count = suma de checks verdaderos`

Interpretacion:

- 0: sin alertas
- 1 a 2: alertas puntuales
- 3 a 4: varias alertas relevantes
- 5 o mas: acumulacion alta de alertas

Uso:

- normalizar entrevista;
- documentar hallazgos de forma comparable.

### 9.8 Tab: Historico

Campos:

- solicitud
- puesto
- etapa
- score
- riesgo
- checklist
- patrones
- fecha creada

Uso:

- auditar decisiones;
- comparar candidatos;
- revisar consistencia del proceso de RRHH.

## 10. Como usar estos hubs para decisiones de negocio

### 10.1 Para crecimiento comercial

Usar principalmente:

- Comercial > Overview
- Comercial > Cobertura
- Comercial > RFM
- PDV > Ranking

Preguntas que responde:

- donde estan las ventas hoy;
- en que canal hay espacio real;
- que clientes debemos proteger;
- que PDVs pueden reactivarse o crecer.

### 10.2 Para rentabilidad

Usar:

- Financiero > Resumen
- Financiero > Producto
- Financiero > Canal
- Financiero > Alertas

Preguntas que responde:

- estamos creciendo con margen;
- que SKUs venden pero no rentan;
- que canal erosiona margen;
- donde faltan datos maestros de costo o marca.

### 10.3 Para abastecimiento y operaciones

Usar:

- Operaciones > Resumen
- Operaciones > Demanda
- Operaciones > Forecast
- Operaciones > Inventarios
- Operaciones > Compras

Preguntas que responde:

- que producir o comprar;
- que SKU esta en riesgo;
- donde hay sobrestock;
- que proveedor esta atrasando la operacion.

### 10.4 Para cartera y relacion con PDV

Usar:

- PDV > Overview
- PDV > Alertas
- Comercial > Cobertura

Preguntas que responde:

- cuantos puntos realmente estan activos;
- donde hay dormancia;
- donde el surtido o la frecuencia cayeron.

### 10.5 Para validacion de datos

Revisar cuando algo no cuadre:

1. si el producto tiene marca activa;
2. si el partner tiene canal asignado;
3. si el producto tiene costo estandar;
4. si el producto tiene canal de producto cuando el analisis es operativo;
5. si la venta esta en `sale` o `done`;
6. si el periodo filtrado realmente incluye los movimientos esperados.

## 11. Limitaciones actuales

### 11.1 Sell-out

El sell-out mostrado hoy es simulado para cadenas especificas. Es util como aproximacion analitica, pero no como fuente definitiva.

### 11.2 Margen financiero

El margen es teorico porque usa `standard_price`. No reemplaza contabilidad ni un P&L real.

### 11.3 Cobertura fisica

White space y holes miden oportunidad analitica desde ventas y universo comercial. No equivalen a ejecucion fisica de ruta ni visita de campo.

### 11.4 Demanda operativa

Operaciones infiere demanda desde ventas historicas. Si hubo quiebres de stock o mala ejecucion comercial, la demanda real puede estar subestimada.

## 12. Recomendaciones de lectura para usuario final

### 12.1 Si la venta baja

Revisar en este orden:

1. Comercial > Overview
2. Comercial > Tendencias
3. Comercial > Cobertura
4. PDV > Alertas
5. Operaciones > Inventarios

### 12.2 Si el margen baja

Revisar:

1. Financiero > Resumen
2. Financiero > Producto
3. Financiero > Canal
4. Financiero > Alertas

### 12.3 Si faltan productos en cuentas clave

Revisar:

1. Comercial > Cobertura > Portfolio holes
2. Comercial > Por Canal
3. PDV > Ranking

### 12.4 Si hay problemas de abastecimiento

Revisar:

1. Operaciones > Forecast
2. Operaciones > Inventarios
3. Operaciones > Compras
4. Operaciones > Alertas

## 13. Estado del documento

Este manual refleja la implementacion actual del addon `zrn_analitics` al momento de su redaccion. Si se agregan nuevos tabs, nuevas reglas o nuevas fuentes, este documento debe actualizarse junto con el backend y la UI.
