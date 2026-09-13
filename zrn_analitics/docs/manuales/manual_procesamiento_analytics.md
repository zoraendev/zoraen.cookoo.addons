# Manual de (ZRN) Analitica

## Procesamiento de datos, menus, vistas y simulaciones

## 1. Objetivo del manual

Este manual documenta el modulo de procesamiento temporal de datos de `zrn_analitics`.

Su objetivo es explicar:

- como entrar al centro de carga y al workspace temporal;
- como funciona la carga por archivo;
- como funciona la carga por Google Sheets;
- como se detectan hojas, tablas, columnas y tipos;
- como funciona el query builder no-code;
- como funciona el SQL de solo lectura;
- como usar el modulo para simular escenarios, reglas y KPIs;
- que casos de uso de negocio resuelve;
- que limitaciones tiene hoy.

Este documento describe la implementacion actual del sistema, no una propuesta futura.

## 2. Que es el modulo de Procesamiento

El modulo de Procesamiento es un espacio temporal dentro de Analytics para cargar un origen externo, convertirlo en dataset consultable, analizarlo y correr simulaciones sin persistir el archivo dentro de Odoo.

Es util para:

- validar archivos antes de integrarlos a una operacion;
- explorar data nueva;
- probar reglas de negocio;
- simular cambios de revenue, precio, mix, margen o cobertura;
- armar un dataset temporal y sacar hallazgos rapidos.

## 3. Principio mas importante del modulo

Todo el trabajo vive solo en la sesion del navegador.

Eso significa:

- si el usuario recarga la pagina, cierra la pestania o sale del modulo, el origen cargado se pierde;
- el archivo no se guarda como adjunto;
- la consulta SQL no queda persistida;
- las simulaciones no se guardan en la base de datos;
- las reglas del escenario tampoco quedan registradas.

El sistema avisa esto de forma explicita en la vista de carga y tambien antes de salir del workspace.

## 4. Ruta funcional en el menu

El flujo funcional actual es:

1. `(ZRN) Analitica`
2. `Procesamiento`
3. pantalla `Centro de carga`
4. opcion `Abrir workspace temporal`
5. pantalla `Procesamiento Workspace`

En terminos funcionales hay dos vistas:

- `processing`: landing o centro de carga
- `processing_workspace`: workspace temporal de trabajo

## 5. Vistas y pantallas del modulo

## 5.1 Vista: Centro de carga

Es la pantalla inicial del procesamiento.

Su funcion es:

- recordar que el origen es temporal;
- permitir cargar un archivo local;
- redirigir al workspace cuando el origen ya esta listo.

Elementos visibles:

- encabezado `Centro de carga`
- advertencia de sesion temporal
- boton `Abrir workspace temporal`
- bloque de `Carga de archivo`
- input para cargar archivo local

## 5.2 Vista: Workspace temporal

Es la pantalla principal de trabajo.

Aqui vive toda la experiencia de procesamiento:

- vista resumen del origen;
- seleccion de hoja;
- seleccion de tabla;
- configuracion estructural;
- columnas y tipos;
- constructor no-code;
- editor SQL;
- resultados;
- graficas;
- escenarios y exportacion.

## 6. Origenes soportados

Actualmente el modulo soporta dos grandes modos de entrada:

1. Archivo local
2. Google Sheets publico

## 6.1 Archivo local

Formatos soportados:

- `.csv`
- `.json`
- `.xml`
- `.xls`
- `.xlsx`
- `.xlsm`

## 6.2 Google Sheets

Requisitos:

- la URL debe ser valida;
- debe pertenecer a Google Sheets;
- el enlace debe ser publico o al menos utilizable por el backend actual;
- el workbook debe devolver hojas legibles.

El sistema valida la URL antes de abrir el workspace productivo.

## 7. Flujo de carga por archivo local

## 7.1 Paso funcional

El usuario selecciona un archivo desde:

- el centro de carga, o
- el boton `Reemplazar archivo` ya dentro del workspace.

## 7.2 Que hace el sistema

Segun la extension:

- Excel: usa `XLSX` y convierte cada hoja a matriz de filas;
- CSV: lee el texto y lo parte por filas y columnas;
- JSON: intenta convertir arreglos y objetos en filas tabulares;
- XML: intenta leer nodos repetidos como registros.

## 7.3 Que se construye

El sistema genera:

- `sourceMeta`
- una lista de hojas
- el estado inicial de tablas detectadas por hoja
- una primera tabla fallback si no encuentra tablas claras

## 7.4 Metadatos del origen

Cuando se carga un archivo, el sistema registra temporalmente:

- nombre del archivo
- extension
- tamanio formateado
- icono visual segun tipo
- numero de hojas detectadas

## 7.5 Casos de ejemplo

### Caso 1: CSV de ventas

Archivo:

- `ventas_enero.csv`

Uso:

- revisar revenue por cliente;
- detectar productos top;
- simular aumentos de precio.

### Caso 2: Excel multihoja

Archivo:

- `planeacion_comercial.xlsx`

Hojas:

- ventas
- presupuesto
- cobertura

Uso:

- analizar varias hojas sin subir nada a Odoo;
- usar una hoja como tabla de ventas y otra como tabla de objetivos.

### Caso 3: JSON de API

Archivo:

- `pedidos_api.json`

Uso:

- transformar una respuesta de API en tabla;
- validar estructura y KPIs rapidamente.

## 8. Flujo de carga por Google Sheets

## 8.1 Experiencia del usuario

Desde la landing hay una tarjeta:

- `Google Sheets`

Al hacer clic:

- se abre modal de validacion;
- el usuario pega la URL;
- presiona `Validar y continuar`.

## 8.2 Validaciones aplicadas

El frontend valida:

- que la URL exista;
- que sea parseable;
- que tenga forma de Google Sheets;
- que contenga un `spreadsheet_id`.

El backend valida:

- que pueda descargar el workbook exportado como `.xlsx`;
- que existan hojas utilizables;
- que se pueda resolver la hoja pedida.

## 8.3 Rutas backend utilizadas

Rutas actuales:

- `/zrn_analitics/google_sheet/metadata`
- `/zrn_analitics/google_sheet/sheet`

## 8.4 Que hace el backend

Para metadata:

- extrae `spreadsheet_id` desde la URL;
- descarga el workbook exportado en formato Excel;
- lee `workbook.xml`;
- lista las hojas disponibles.

Para una hoja puntual:

- descarga el mismo workbook;
- resuelve la hoja por indice;
- reconstruye las filas leyendo celdas, shared strings y tipos basicos.

## 8.5 Particularidad importante de Google Sheets

Las hojas no siempre se hidratan completas de una vez.

La implementacion actual puede crear hojas diferidas y luego cargar la hoja seleccionada cuando el usuario la activa.

Esto ayuda a:

- no cargar todo de golpe;
- reducir costo de hojas grandes;
- abrir el workspace mas rapido.

## 8.6 Casos de uso ideales para Google Sheets

- proyecciones comerciales compartidas por equipos;
- simulaciones de cobertura o surtido que viven en Sheets;
- tableros operativos exportados desde otra area;
- validacion rapida de layouts antes de una integracion real.

## 9. Logica general del workspace temporal

## 9.1 Bloques principales del workspace

Una vez cargado el origen, el workspace muestra estas capas:

1. Origen activo
2. Dataset temporal
3. Consulta
4. Resultados
5. Totales y escenarios
6. Ayuda SQL

## 9.2 Origen activo

Resume:

- nombre del origen;
- tipo;
- hoja activa;
- tablas detectadas;
- tabla activa;
- estado del dataset.

Tambien permite:

- reemplazar archivo;
- volver a carga;
- limpiar sesion.

## 10. Dataset temporal

## 10.1 Objetivo

Definir que parte de la hoja se convertira en tabla SQL temporal.

## 10.2 Concepto de hoja vs tabla

Una hoja puede tener:

- una sola tabla limpia;
- varias tablas separadas;
- un encabezado horizontal normal;
- una estructura por columnas.

Por eso el sistema no asume que toda la hoja es una sola tabla.

## 10.3 Deteccion automatica de tablas

El sistema busca celdas ocupadas y arma componentes conectados.

Luego filtra componentes muy pequenos.

Una region solo se considera tabla si cumple reglas minimas como:

- altura minima;
- ancho minimo;
- cantidad minima de celdas ocupadas.

## 10.4 Heuristica del titulo y encabezado

La deteccion intenta reconocer:

- si la primera fila es solo un titulo;
- si la segunda fila ya es encabezado real;
- rango de columnas utiles;
- fila final de datos.

Si no encuentra una estructura clara, crea una tabla fallback basada en:

- mejor fila candidata a encabezado;
- primera columna no vacia;
- ultima columna no vacia.

## 10.5 Configuracion manual de la tabla

Cada tabla permite configurar:

- nombre visible;
- nombre de tabla SQL;
- fila de encabezado o fila inicial;
- fila final;
- si existe fila final explicita;
- encabezado por fila o por columna;
- columna inicial;
- columna final.

## 10.6 Encabezado por fila

Es el caso tradicional:

- una fila contiene nombres de columnas;
- debajo vienen filas de datos.

## 10.7 Encabezado por columna

Es util cuando:

- la primera columna contiene nombres de variables;
- las columnas a la derecha son observaciones, periodos o entidades.

Ejemplo:

| Campo | Ene | Feb | Mar |
| --- | --- | --- | --- |
| Revenue | 100 | 120 | 130 |
| Unidades | 5 | 6 | 7 |

En este caso cada columna de meses se convierte en un registro y cada fila es una variable.

## 10.8 Columnas del dataset

Para cada columna el usuario puede definir:

- si se usa o no;
- alias SQL;
- tipo SQL.

Tipos disponibles:

- `text`
- `number`
- `date`
- `boolean`

## 10.9 Inferencia de tipos

La deteccion automatica intenta inferir tipo desde muestras:

- booleanos como `true`, `false`, `si`, `no`;
- numeros;
- fechas;
- texto.

## 10.10 Reglas de validacion estructural

Antes de aplicar la estructura, el sistema valida:

- que la hoja no este vacia;
- que la fila inicial sea valida;
- que la fila final no quede encima del encabezado;
- que el rango de columnas sea valido;
- que exista al menos una columna activa;
- que los alias SQL activos sean unicos;
- que existan filas de datos dentro del rango.

## 10.11 Estado del dataset

La pantalla reporta si el dataset esta:

- pendiente;
- listo;
- con error de estructura.

## 10.12 Construccion del dataset real

Al aplicar estructura, el sistema:

1. toma la tabla seleccionada;
2. genera registros tabulares;
3. crea una tabla temporal en `AlaSQL`;
4. deja esa tabla lista para consulta.

## 10.13 Regla clave del nombre SQL

El nombre SQL se sanea para evitar problemas:

- se normaliza;
- se quitan acentos;
- se reemplazan caracteres no validos;
- se evita que inicie con numero.

## 11. SQL temporal y seguridad funcional

## 11.1 Motor usado

El workspace usa `AlaSQL` en el navegador para ejecutar consultas sobre una tabla temporal.

## 11.2 Regla de seguridad principal

Solo se permiten consultas `SELECT`.

Validaciones:

- debe iniciar con `SELECT`;
- si contiene palabras como `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `ATTACH`, se bloquea.

## 11.3 SQL permitido

Se permite principalmente:

- `SELECT`
- `WHERE`
- `GROUP BY`
- `ORDER BY`
- `LIMIT`
- agregados como `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`

## 11.4 Límite visible de resultados

La UI muestra preview hasta `200` filas.

Importante:

- la consulta puede devolver mas;
- pero la vista de preview corta a 200 filas para lectura y rendimiento.

## 11.5 Ejemplos de SQL utiles

### Ejemplo 1: total por canal

```sql
SELECT canal, SUM(revenue) AS revenue_total
FROM [ventas_mayo]
GROUP BY canal
ORDER BY revenue_total DESC
LIMIT 20;
```

### Ejemplo 2: top clientes

```sql
SELECT cliente, SUM(revenue) AS revenue_total, COUNT(*) AS filas
FROM [ventas_mayo]
WHERE canal = 'Moderno'
GROUP BY cliente
ORDER BY revenue_total DESC
LIMIT 15;
```

### Ejemplo 3: productos con margen bajo

```sql
SELECT producto, revenue, costo, margen_pct
FROM [rentabilidad]
WHERE margen_pct <= 10
ORDER BY margen_pct ASC
LIMIT 30;
```

## 12. Constructor no-code

## 12.1 Objetivo

Permitir que el usuario construya un `SELECT` simple sin escribir SQL manual.

## 12.2 Que permite

- seleccionar columnas;
- agregar filtros;
- definir operadores;
- limitar filas;
- generar la consulta automaticamente.

## 12.3 Operadores soportados

Para numeros y fechas:

- igual
- mayor que
- mayor o igual
- menor que
- menor o igual
- entre

Para boolean:

- igual

Para texto:

- igual
- contiene
- empieza con
- termina con

## 12.4 Casos de uso del constructor

- filtrar clientes de una region;
- ver solo productos de una categoria;
- aislar revenue mayor a cierto umbral;
- sacar tabla corta para simular.

## 12.5 Cuándo usar no-code y cuándo SQL

Usar no-code cuando:

- el analisis es simple;
- el usuario no maneja SQL;
- solo hace falta filtrar y seleccionar columnas.

Usar SQL cuando:

- se necesita agrupar;
- se requieren agregados;
- se busca un ranking;
- se necesita una vista mas analitica.

## 13. Resultados del query

## 13.1 Vistas disponibles

El resultado puede verse como:

- tabla
- JSON
- grafica

## 13.2 Vista tabla

Sirve para:

- validar registros;
- revisar filas puntuales;
- confirmar que el filtro y las columnas salieron bien.

## 13.3 Vista JSON

Sirve para:

- copiar una estructura;
- revisar salida serializada;
- validar payloads o integraciones.

## 13.4 Vista grafica

El sistema permite configurar:

- tipo de grafica;
- columna de categoria;
- columna numerica;
- tipo de agregado.

Agregados:

- suma
- conteo
- promedio
- minimo
- maximo

## 13.5 Casos de uso de la grafica

- revenue por canal;
- unidades por categoria;
- pedidos por asesor;
- margen promedio por marca.

## 14. Totales y escenarios

## 14.1 Objetivo

Tomar el resultado actual del query y correr simulaciones temporales por fila.

Es una capa de analisis y no altera el dataset base.

## 14.2 Flujo funcional del panel

1. ejecutar una consulta;
2. elegir columna para agrupar;
3. elegir metrica numerica;
4. crear columnas calculadas si hace falta;
5. agregar reglas del escenario;
6. comparar base vs escenario.

## 14.3 Columnas calculadas

Permiten crear una nueva columna usando dos columnas numericas.

Operaciones soportadas:

- suma
- resta
- multiplicacion
- division

Ejemplos:

- `margen = revenue - costo`
- `ticket = revenue / pedidos`
- `rebate_valor = revenue * rebate_pct`

## 14.4 Reglas del escenario

Cada regla tiene:

- nombre;
- columna condicion;
- operador;
- valor condicion;
- columna objetivo;
- accion;
- valor accion;
- modo de salida.

## 14.5 Operadores de condicion

- `=`
- `!=`
- contiene
- `>`
- `>=`
- `<`
- `<=`

## 14.6 Acciones soportadas

- `add`: sumar valor
- `subtract`: restar valor
- `multiply`: multiplicar factor
- `set`: reemplazar valor
- `percent_delta`: cambiar por porcentaje sobre el valor actual

## 14.7 Modos de salida

- `replace`: sobrescribe la columna objetivo
- `new_column`: crea una nueva columna de salida

## 14.8 Resultado del escenario

El panel calcula:

- total base
- total escenario
- delta absoluto
- delta porcentual

Y ademas genera resumen por grupo con:

- base
- escenario
- diferencia
- `% cambio`
- `% base`
- `% escenario`

## 14.9 Regla importante del motor

El escenario corre sobre el resultado del query, no sobre el archivo original completo.

Entonces:

- si el query trae solo 20 filas, el escenario solo afecta esas 20;
- si el query agrupa mal o filtra de mas, la simulacion tambien quedara sesgada.

## 15. Warnings y validaciones de escenarios

El sistema muestra advertencias cuando:

- una columna calculada esta incompleta;
- una columna calculada esta duplicada;
- una formula usa columnas no numericas;
- hay division entre cero;
- una regla esta incompleta;
- una regla apunta a columna no numerica;
- una regla nueva no tiene nombre de salida.

Esto no siempre bloquea, pero si avisa que la simulacion puede quedar parcial.

## 16. Exportaciones

## 16.1 Exportacion de tabla de escenario

Formatos:

- `xlsx`
- `csv`
- `xml`
- `txt`

En `txt` el usuario puede definir delimitador.

## 16.2 Exportacion de grafica de escenario

Formatos:

- `png`
- `pdf`

## 16.3 Uso practico

- compartir comparativos rapidamente;
- documentar una simulacion en una reunion;
- llevar una grafica a presentacion o correo.

## 17. Ejemplos de escenarios a simular

## 17.1 Escenario: aumento general de precio

Objetivo:

- ver impacto de subir 5% el revenue proyectado.

Setup recomendado:

- query con columnas: `canal`, `producto`, `revenue`
- metrica: `revenue`

Regla:

- si columna: `canal`
- operador: `contains`
- valor: dejar vacio o agrupar antes si se quiere masivo
- columna objetivo: `revenue`
- accion: `percent_delta`
- valor accion: `5`
- salida: `replace`

Uso:

- estimar impacto bruto de alza.

## 17.2 Escenario: descuento solo para un canal

Objetivo:

- simular una promocion en canal moderno.

Regla:

- condicion: `canal = Moderno`
- target: `revenue`
- accion: `percent_delta`
- valor: `-8`

Uso:

- medir costo comercial de una promo;
- ver caida por grupo.

## 17.3 Escenario: incremento de costo logistico

Objetivo:

- simular costo mas alto en una categoria.

Columnas requeridas:

- `revenue`
- `costo`
- columna calculada `margen = revenue - costo`

Regla:

- condicion: `categoria = Snacks`
- target: `costo`
- accion: `percent_delta`
- valor: `12`

Despues:

- volver a calcular margen en una consulta o columna derivada.

Uso:

- medir sensibilidad del margen.

## 17.4 Escenario: empuje comercial a PDVs dormantes

Objetivo:

- simular recuperacion de cuentas con baja recencia.

Columnas:

- `pdv`
- `days_since_last`
- `revenue`

Regla:

- condicion: `days_since_last > 30`
- target: `revenue`
- accion: `percent_delta`
- valor: `20`

Uso:

- estimar upside potencial de reactivacion.

## 17.5 Escenario: surtido nuevo en clientes A

Objetivo:

- simular ingreso de una nueva linea en clientes prioritarios.

Columnas:

- `cliente`
- `abc`
- `revenue`

Regla:

- condicion: `abc = A`
- target: `revenue`
- accion: `add`
- valor: `1500`

Uso:

- estimar impacto de ampliar portafolio en cuentas top.

## 17.6 Escenario: ajuste por devoluciones o merma

Objetivo:

- descontar un porcentaje operativo por merma.

Regla:

- target: `unidades`
- accion: `percent_delta`
- valor: `-3`

Uso:

- aterrizar un forecast mas conservador.

## 18. Reglas de negocio sugeridas para agregar en simulaciones

Estas no viven preconfiguradas hoy, pero son buenos patrones de uso.

## 18.1 Reglas comerciales

- aumento de precio por canal
- descuento por categoria
- bono por PDV nuevo
- reduccion en cuentas dormantes
- incremento de surtido en clientes A/B

## 18.2 Reglas financieras

- aumento de costo por proveedor
- reduccion de margen por rebaja
- incremento de costo logístico
- ajuste por tipo de cambio

## 18.3 Reglas operativas

- merma sobre unidades
- penalizacion por quiebre
- correccion por sobrestock
- compra minima por proveedor

## 18.4 Reglas de cobertura

- objetivo de penetracion por canal
- apertura de PDVs nuevos
- recuperacion de cuentas inactivas
- cierre de holes de surtido

## 19. Casos de uso por area

## 19.1 Comercial

Casos:

- validar una propuesta de pricing;
- medir revenue potencial por cliente;
- simular campanias;
- agrupar ventas por canal, marca o asesor.

KPIs que se pueden simular:

- revenue
- ticket promedio
- revenue por cliente
- revenue por canal
- share por marca

## 19.2 Finanzas

Casos:

- simular compresion de margen;
- estimar impacto de descuentos;
- medir variacion de costo.

KPIs que se pueden simular:

- margen
- margen %
- costo total
- revenue matcheado

## 19.3 Operaciones

Casos:

- proyectar demanda;
- probar ajustes por canal;
- revisar combinaciones de volumen y costo.

KPIs que se pueden simular:

- unidades
- unidades por mes
- run rate
- cobertura estimada

## 19.4 Supply o compras

Casos:

- analizar spend por proveedor;
- simular aumento de costo;
- revisar backlog con supuestos.

KPIs que se pueden simular:

- spend
- costo unitario
- costo extendido
- delta de compra

## 20. Como simular KPIs utilmente

## 20.1 Revenue

Dataset minimo:

- canal
- cliente
- producto
- revenue

Escenarios comunes:

- +5% precio
- -8% descuento
- +20% recuperacion de PDVs

## 20.2 Margen

Dataset minimo:

- revenue
- costo

Columnas calculadas sugeridas:

- `margen = revenue - costo`
- `margen_pct = margen / revenue`

Escenarios comunes:

- aumento de costo;
- descuento selectivo;
- cambio de mix.

## 20.3 Ticket promedio

Dataset minimo:

- revenue
- pedidos

Columna calculada:

- `ticket = revenue / pedidos`

Escenarios:

- subir precio;
- concentrar ventas en menos pedidos;
- recuperar clientes de alta compra.

## 20.4 Cobertura

Dataset minimo:

- canal
- pdv
- estado activo

Escenarios:

- sumar PDVs en un canal;
- estimar revenue promedio por PDV nuevo;
- medir crecimiento por penetracion.

## 20.5 Unidades

Dataset minimo:

- producto
- unidades
- canal

Escenarios:

- ajuste por merma;
- aumento por promo;
- redistribucion por canal.

## 21. Buenas practicas para el usuario

## 21.1 Antes de cargar

- revisar si el archivo tiene encabezados claros;
- evitar merges complejos si no son necesarios;
- asegurarse de que las columnas clave tengan consistencia;
- separar tablas distintas si se puede.

## 21.2 Antes de consultar

- confirmar que la tabla activa sea la correcta;
- revisar alias SQL;
- validar tipo de columna numerica, fecha o texto;
- aplicar estructura antes de correr SQL serio.

## 21.3 Antes de simular

- ejecutar primero un query limpio;
- revisar que la metrica sea numerica;
- no simular sobre un subset accidental;
- probar una regla a la vez si el caso es complejo.

## 21.4 Antes de exportar

- revisar si el agrupador es el correcto;
- revisar si el escenario esta en tabla o grafica;
- confirmar que el delta tenga sentido de negocio.

## 22. Limitaciones actuales

## 22.1 No persistencia

Nada queda guardado en la base de Odoo.

## 22.2 Una tabla activa por consulta

La version actual trabaja sobre una sola tabla temporal activa por vez.

No hay joins reales multi-tabla desde UI.

## 22.3 SQL acotado

Solo lectura:

- no hay DDL ni DML;
- no hay modificaciones permanentes;
- el SQL esta pensado para exploracion.

## 22.4 Escenarios sobre resultado, no sobre modelo persistido

Las reglas se aplican sobre el resultado del query, no sobre tablas historicas persistidas.

## 22.5 Calidad de datos de entrada

Si la hoja viene con:

- encabezados ambiguos;
- columnas mezcladas;
- tipos inconsistentes;
- estructuras partidas;

la experiencia puede requerir mas configuracion manual.

## 23. Recomendaciones de evolucion futura

Ideas utiles para siguientes iteraciones:

- guardar presets de consultas;
- guardar presets de reglas;
- permitir comparacion entre dos tablas;
- soportar joins guiados;
- persistir escenarios favoritos;
- plantillas por area: comercial, financiero, operaciones;
- biblioteca de KPIs sugeridos.

## 24. Resumen ejecutivo

El modulo de Procesamiento de `zrn_analitics` es una mesa de trabajo temporal para:

- cargar data externa;
- convertirla en tabla util;
- consultarla con SQL o sin codigo;
- graficarla;
- simular impactos y escenarios;
- exportar resultados.

No sustituye un ETL formal ni una integracion definitiva, pero si es una herramienta muy util para analisis rapido, validacion de datos, exploracion de oportunidades y simulacion de decisiones antes de llevarlas a operacion.
