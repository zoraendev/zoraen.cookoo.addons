# Historial de Correcciones y Actualizaciones - (ZRN) Analitica

## Corrección del Filtro de Período y Enlaces de Callbacks (Junio 2026)

### 1. Contexto del Problema
Al interactuar con el menú de selección de períodos ("Periodo") en cualquiera de las pestañas del **Hub Comercial** (Overview, Portafolio, Cobertura, Canal), la selección de las opciones no se aplicaba y el valor del menú no cambiaba. Esto impedía filtrar la información de manera dinámica.

### 2. Causas Identificadas

#### A. Resolución de Referencias de Métodos en Plantillas de OWL 2
Las plantillas XML del Hub Comercial (`hub_commercial.xml`) utilizaban la directiva `.bind` para enlazar los métodos de callback del componente principal `ZrnAnalyticsHubAction`:
* Código anterior: `onSelect.bind="onOverviewPeriodSelect"` o `onChange.bind="onOverviewBrandsChange"`

En OWL 2 (Odoo 17), el compilador de plantillas evalúa la directiva `.bind` en el contexto local de renderizado. Puesto que los métodos del componente no residen en las variables del estado (`state`) o propiedades del contexto directo, sino en el prototipo de la clase del componente principal, al omitir el prefijo `this.`, la referencia se resolvía como `undefined`. Esto hacía que se ejecutara un callback vacío (comportamiento por defecto del componente `SelectMenu`), fallando de manera silenciosa sin arrojar excepciones en consola.

#### B. Mapeo de Claves del Backend vs Frontend
La respuesta del backend (`analytics_home.py`) genera la lista de opciones de periodos con el formato estándar de Odoo:
```python
{'value': 'ytd', 'label': 'YTD'}
```
En el frontend (`analytics_hub_action.js`), el método `getPeriodChoices` estaba estructurado para mapear las claves usando `option.key`:
```javascript
value: option.key // Resolvía a undefined
```
Esto causaba que la lista de opciones enviada a `SelectMenu` tuviera siempre `value: undefined`, impidiendo la propagación del valor seleccionado.

### 3. Soluciones Implementadas

#### Frontend XML ([hub_commercial.xml](file:///home/dgb/Documents/dev-zoraen/zoi.addons/zrn_analitics/static/src/xml/hubs/hub_commercial.xml))
Se actualizaron todas las referencias de callbacks para incluir explícitamente el prefijo `this.`, permitiendo que OWL localice correctamente las definiciones de método en la instancia del componente:
* `<SelectMenu ... onSelect.bind="this.onOverviewPeriodSelect"/>`
* `<ZrnRelationalMultiSelect ... onChange.bind="this.onOverviewBrandsChange"/>`

#### Frontend JS ([analytics_hub_action.js](file:///home/dgb/Documents/dev-zoraen/zoi.addons/zrn_analitics/static/src/js/analytics_hub_action.js))
Se modificó la función helper `getPeriodChoices` para leer la clave `value` enviada por el backend con un fallback seguro hacia `key`:
```javascript
getPeriodChoices(options) {
  // Mapea usando option.value y mantiene fallback para compatibilidad
  return (options || []).map((option) => ({
    value: option.value || option.key,
    label: option.label,
  }));
}
```

### 4. Verificación
Se eliminó la caché de los assets bundle (`ir.attachment`), se actualizó el módulo en la base de datos y se reinició el servidor. Se validó que al cambiar el período en la UI, los filtros se actualizan correctamente, persisten visualmente en el menú desplegable y se envían de forma exitosa al backend al presionar **Aplicar**.

---

## Integración de los 7 Tabs Analíticos en el Hub Comercial (Junio 2026)

### 1. Contexto del Requerimiento
Para unificar y potenciar la inteligencia de negocio dentro de Odoo sin depender de dashboards externos, se adaptaron las 7 pestañas analíticas restantes del reporte estático `COOKOO_Centro_Comercial.html` al Hub Comercial nativo.

### 2. Pestañas Implementadas
*   **Por Cliente / PDV (`cliente`)**:
    *   Listado general de clientes con métricas YTD de facturación, unidades, número de facturas, fecha de primera y última compra, y días transcurridos desde la última transacción.
    *   Soporte completo para ordenamiento client-side interactivo por cabecera de columna.
    *   Apertura de la ficha del cliente en una ventana modal nativa de Odoo al hacer clic en cualquier fila de la tabla.
*   **Clientes RFM (`rfm`)**:
    *   Cálculo automático de puntuaciones R (Recency), F (Frequency) y M (Monetary) de 1 a 4.
    *   Matriz de calor de cuadrícula R-F (4x4) que indica el número de clientes y monto facturado en cada cruce de puntuaciones.
    *   Tarjetas informativas de KPI por segmento de cliente (Campeón, Leal, En Riesgo, etc.) con sus correspondientes emojis identificadores.
    *   Integración de Apache ECharts para trazar la **Curva de Pareto** (concentración de ingresos vs acumulado de clientes) en tiempo real.
*   **Cliente Insights (`insights`)**:
    *   **Matriz de Cohortes**: Análisis de retención mensual a partir de la fecha de la primera transacción de cada cliente, con celdas sombreadas proporcionalmente.
    *   **Market Basket**: Matriz de afinidad de productos y transacciones conjuntas, con cálculo de Soporte, Confianza y *Lift* (Correlación).
    *   **Cadencia de Compra**: Gráfico de rosca (ECharts) de regularidad de compra (Regular, Bimensual, Esporádico, Único) y alerta de clientes regulares que han entrado en estado de fuga (sin compras recientes).
    *   **LTV Forecast**: Proyección de valor de vida del cliente (Lifetime Value) a 3, 6 y 12 meses basada en la pendiente de la tendencia de compra individual.
*   **Por Producto (`producto`)**:
    *   Ranking de productos ordenado por ingresos con volumen de unidades, participación sobre el total de ventas y precio real promedio de facturación.
    *   Apertura de la ficha técnica del producto en ventana modal al hacer clic en el nombre.
*   **Tendencias (`tendencias`)**:
    *   División interactiva entre **Growers** (productos con tendencia de velocidad de venta diaria positiva) y **Decliners** (productos con tendencia de velocidad diaria negativa).
*   **Sell-in vs Sell-out (`gap`)**:
    *   Comparativa de Sell-in facturado contra Sell-out simulado de forma determinista para las cadenas de autoservicios clave (Walmart/Paiz y Puma Super 7).
    *   Representación en gráfico de barras apiladas o agrupadas (ECharts).
    *   Alertas e indicadores automáticos para quiebres de inventario (*Out of Stock*) y acumulación excesiva de mercancía (*Overstock*).
*   **Matriz BCG (`bcg`)**:
    *   Clasificación matricial de productos en cuatro cuadrantes (Estrellas, Vacas, Incógnitas, Perros) utilizando la mediana de facturación y el margen de ganancia como límites divisorios.
    *   Visualización interactiva tipo scatter plot construida con CSS nativo sobre coordenadas relativas (sin depender de librerías adicionales para el posicionamiento) que permite pasar el cursor y ver la información del producto.
    *   Tabla resumen interactiva con filtros dinámicos por cuadrante.

### 3. Aspectos de Arquitectura y Estilo (Cumplimiento de `AGENTS.md`)
*   Se eliminaron gradientes invasivos,cards excesivas y decoraciones innecesarias, prefiriendo la estética sobria y nativa de Odoo.
*   Se usaron las clases de tabla de Odoo (`o_list_table table-sm table-hover table-striped`) en conjunto con el prefijo `zrn_` para los estilos personalizados del módulo.
*   Los gráficos se implementaron usando **Apache ECharts** (`window.echarts`), asegurando compatibilidad con el resto del ecosistema de (ZRN) Analitica.

---

## Gráfica de Producto y Clics Interactivos de Fila (Junio 2026)

### 1. Contexto del Requerimiento
Se solicitó añadir interactividad a todas las tablas del Hub Comercial de modo que, al hacer clic en cualquier fila, se despliegue un modal nativo de Odoo con el detalle correspondiente (formulario de Cliente o Producto). Adicionalmente, se solicitó incorporar una gráfica dinámica en la pestaña **"Por Producto"** que permita alternar interactivamente entre diferentes tipos de visualizaciones.

### 2. Cambios Implementados

#### A. Mapeo de IDs e Interactividad en Tablas (`models/analytics_home.py` & `static/src/xml/hubs/hub_commercial.xml`)
*   Se añadieron campos identificadores (`partner_id` para clientes, `product_id` para productos) en los conjuntos de datos del backend que carecían de ellos, específicamente en las listas de distribución `sellin_vs_sellout` de la pestaña **Desplazamiento**.
*   Se implementaron manejadores de eventos `t-on-click="() => this.openRecordModal(model, id)"` en los elementos `<tr>` de todas las tablas analíticas del Hub Comercial. Esto redirige la acción al servicio `actionService` de Odoo utilizando el target `new` para abrir el formulario modal nativo en lugar de desviar la navegación.

#### B. Componente de Gráfica Dinámica de Productos (`static/src/js/analytics_hub_action.js`)
*   Se incorporó el estado `productChartType` en el componente Owl (`ZrnAnalyticsHubAction`) con el valor por defecto `"bar"`.
*   Se desarrolló el método `renderProductChart()` que extrae el top 10 de productos y genera la configuración de ECharts en base al tipo seleccionado:
    *   **Barra/Línea**: Configura ejes cartesianos, tooltips formateados con el símbolo de moneda local y barras o líneas suavizadas con gradiente.
    *   **Rosca (Pie)**: Configura una visualización circular segmentada con leyendas scrolleables para evitar saturación de pantalla.
*   Se incluyó un selector en la cabecera del panel de productos en el XML para actualizar el estado del gráfico de forma reactiva al hacer clic en los tipos de visualización.

#### C. Remoción de Marcadores y Ajuste de Filtros (`static/src/xml/hubs/hub_commercial.xml`)
*   Se eliminó el banner genérico de *"Esta vista queda reservada..."* en las pestañas no desarrolladas. En su lugar, ahora se despliega únicamente la barra unificada de **Filtros Comerciales** (`HubCommercialFilters`) para permitir la interacción global y mantener una estructura limpia y homogénea en toda la interfaz.
*   Se documentó y comentó el código JS de renderizado de ECharts, y los callbacks XML para asegurar mantenibilidad futura.

---

## Optimización de Rendimiento, Manejo Defensivo de Modelos y Filtro por Rango de Fechas (Agosto 2026)

### 1. Optimización N+1 SQL Query en Resolutores de Canales
* **Problema:** En tableros con miles de registros de venta, el filtrado por cliente (`_resolve_partner_channel`) ejecutaba una consulta SQL individual por cada línea de orden (`sale.order.line`), generando miles de peticiones HTTP/SQL consecutivas y causando retardos de hasta 5 minutos al abrir el módulo.
* **Solución:** Se creó el método `_get_partner_channel_map()` en `analytics_home.py`, el cual realiza **una única consulta SQL agrupada** al cargar el hub para almacenar en un mapa en memoria la relación `partner_id -> channel_name`. El bucle de filtrado consume este mapa directamente en tiempo constante $O(1)$.

### 2. Manejo Defensivo ante Modelos Removidos (`zrn_commercial.product.channel`)
* **Problema:** Tras la refactorización del módulo comercial, el modelo `zrn_commercial.product.channel` fue eliminado, lo que causaba un fallo crítico `KeyError` al ingresar al Hub de Operaciones.
* **Solución:** Se implementó verificación defensiva previa (`if 'zrn_commercial.product.channel' not in self.env:`) en `_get_product_channel_records`, `_get_product_channel_map` y `_get_product_channel_filter_options`. Si el modelo no existe, el sistema retorna inmediatamente colecciones vacías seguras sin interrumpir la ejecución.

### 3. Reemplazo del Filtro Estático YTD por Rango Dinámico (Desde / Hasta)
* **Cambio:** Se eliminó el selector desplegable predeterminado "Periodo" (YTD, Mes actual, etc.) en los hubs **Comercial**, **Financiero**, **Operaciones** y **PDV/Cobertura** (respetando la estructura nativa del hub de RRHH).
* **Frontend (`analytics_hub_action.xml` & `analytics_hub_action.js`):**
  * Se definieron campos nativos de fecha `<input type="date">` vinculados a los estados `date_from` y `date_to`.
  * Se establecieron como valores predeterminados el primer día del año en curso (`YYYY-01-01`) y el día actual respectivamente.
* **Backend (`analytics_home.py`):**
  * `_normalize_channel_filters` ahora lee las fechas `date_from` y `date_to` enviadas desde la interfaz de forma prioritaria, manteniendo el método `_get_channel_period_range` únicamente como mecanismo de contingencia (*fallback*).
