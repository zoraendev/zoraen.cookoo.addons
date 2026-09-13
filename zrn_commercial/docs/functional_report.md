# (ZRN) Manejo Comercial - Reporte Funcional

## Objetivo del addon

`zrn_commercial` es la capa comercial operativa de Zoraen sobre Odoo.

Su objetivo no es solo clasificar datos, sino ayudar a operar el proceso comercial con:

- marcas comerciales propias de Zoraen
- canales comerciales propios
- prospectos y oportunidades clasificados
- clientes con contexto comercial
- cotizaciones alineadas a marca y canal
- seguimiento comercial visible
- reportes operativos basicos

El addon debe mantenerse independiente de los addons base de Odoo. La logica nueva vive en `zrn_commercial`, aunque se integre por herencia sobre `crm.lead`, `res.partner`, `sale.order` y `mail.activity`.

## Alcance funcional actual

La etapa actual cubre:

- maestro de marcas comerciales Zoraen
- importacion de marcas desde modelos existentes en Odoo
- maestro de canales comerciales
- relacion de clientes o PDVs con canales
- clasificacion comercial en oportunidades
- arrastre de datos comerciales hacia cliente y cotizacion
- validaciones comerciales minimas
- alertas por mezcla de productos fuera del portafolio de marca
- filtros y agrupaciones operativas por marca, canal, prioridad y seguimiento

No incluye en esta etapa:

- analytics avanzado
- automatizaciones complejas
- scoring automatico
- flujos de aprobacion
- pricing avanzado
- metas, cuotas o forecast comercial avanzado

## 1. Marcas comerciales Zoraen

### Para que debe servir

La marca comercial de Zoraen debe ser la entidad principal para organizar el trabajo comercial. No debe ser solo un nombre duplicado de una marca existente en Odoo.

Debe servir para:

- definir el contexto comercial real de una oportunidad o cotizacion
- administrar lineamientos y notas operativas de la marca
- asignar responsables comerciales por marca
- sugerir canales de venta validos para esa marca
- relacionar productos foco o portafolio oficial
- consultar clientes, oportunidades y cotizaciones asociadas

### Que hace actualmente

El modelo `zrn_commercial.commercial.brand` permite:

- nombre, codigo, compania y estado comercial
- datos basicos como sitio web, correo, telefono y pais
- logo con validaciones de formato, resolucion y peso
- notas internas y lineamientos comerciales
- responsables comerciales
- canales sugeridos
- productos foco
- trazabilidad de origen si la marca fue importada
- contadores de oportunidades, clientes, cotizaciones y productos
- acceso directo a oportunidades, clientes y cotizaciones relacionadas

### Valor agregado esperado

La marca debe dar valor real cuando:

- permite saber que productos pertenecen a su portafolio oficial
- restringe o sugiere canales adecuados
- centraliza la operacion comercial de esa linea
- facilita la consistencia entre pipeline, clientes y cotizaciones

### Escenarios que deben cumplirse

- crear una marca manualmente con datos propios de Zoraen
- importar una marca desde un modelo origen y luego enriquecerla con informacion comercial propia
- asignar responsables y canales sugeridos
- asociar productos comerciales a la marca
- abrir desde la marca sus oportunidades, clientes y cotizaciones

### Criterios de aceptacion

- una marca puede existir sin depender de una marca nativa de Odoo
- el codigo debe ser unico por compania
- el logo solo acepta imagen valida y peso razonable
- la marca puede tener portafolio y responsables sin tocar modelos base
- la marca importada conserva referencia al origen

## 2. Importacion de marcas desde Odoo

### Para que debe servir

Debe evitar recaptura manual de marcas ya existentes en el sistema.

La importacion debe servir para:

- tomar un catalogo existente como punto de partida
- convertirlo en marca comercial operativa de Zoraen
- preservar trazabilidad con el origen
- no sobrescribir informacion comercial propia de Zoraen

### Que hace actualmente

El asistente `zrn_commercial.brand.import.wizard` permite:

- elegir compania
- detectar modelos candidatos que parezcan catlogos de marcas
- escanear registros del modelo origen
- mostrar lineas detectadas
- marcar cuales importar
- importar solo seleccionadas
- importar todas las pendientes

La logica de importacion:

- busca coincidencias por modelo origen e id origen
- si no encuentra, intenta por codigo
- si no encuentra, intenta por nombre y compania
- crea la marca si no existe
- si ya existe, solo completa datos faltantes basicos
- registra `source_model`, `source_record_id`, nombre del origen y fecha de sincronizacion

### Que no debe pasar

- no debe duplicar marcas por una importacion repetida
- no debe borrar ni sobrescribir notas, lineamientos o configuracion comercial propia
- no debe obligar al usuario a recrear manualmente lo que ya existe en Odoo

### Escenarios que deben cumplirse

- importar una sola marca faltante
- importar todas las marcas pendientes del modelo origen
- volver a escanear el mismo modelo sin generar duplicados
- sincronizar una marca ya importada sin perder datos comerciales propios

### Criterios de aceptacion

- la importacion inicial crea registros utilizables en Zoraen
- la reimportacion no duplica registros
- la sincronizacion solo rellena campos basicos faltantes
- la marca resultante queda lista para configurar portafolio, responsables y canales

## 3. Canales comerciales

### Para que deben servir

El canal comercial debe usarse como capa operativa para ordenar cartera y trabajo diario, no solo como etiqueta para reportes.

Debe servir para:

- asignar clientes o PDVs a un canal
- identificar oportunidades activas por canal
- ver cotizaciones abiertas por canal
- detectar cuentas sin seguimiento
- apoyar segmentacion comercial real

### Que hace actualmente

El modelo `zrn_commercial.commercial.channel` permite:

- nombre, codigo, compania y estado activo
- descripcion y notas
- responsable comercial
- asignacion de clientes o PDVs mediante lineas propias
- contadores de clientes, oportunidades, cotizaciones y cuentas sin seguimiento
- acciones rapidas para abrir clientes, oportunidades y cotizaciones del canal

El modelo `zrn_commercial.commercial.channel.partner` permite:

- asignar un cliente o PDV a un canal
- evitar que un mismo partner quede asignado a varios canales Zoraen
- restringir contactos privados o sin perfil comercial
- almacenar notas de la asignacion

### Valor operativo esperado

El canal debe permitir responder rapido preguntas como:

- que cuentas pertenecen a este canal
- cuantas oportunidades activas hay aqui
- que cotizaciones siguen abiertas
- que cartera no tiene seguimiento

### Escenarios que deben cumplirse

- crear un canal y asignarle responsable
- vincular clientes o PDVs al canal
- mover una cuenta de un canal a otro
- abrir desde el canal la cartera oportuna y las cotizaciones relacionadas

### Criterios de aceptacion

- el nombre y codigo del canal son unicos por compania
- un partner no queda repetido en varios canales Zoraen
- solo se asignan partners comerciales validos
- el canal sirve para operar y filtrar trabajo diario

## 4. Prospectos y oportunidades

### Para que debe servir esta capa

La oportunidad debe ser el punto en que la clasificacion comercial se vuelve obligatoria.

Debe servir para:

- definir marca comercial y canal comercial
- fijar prioridad
- registrar siguiente paso visible para el equipo
- mostrar estado de seguimiento
- preparar el arrastre hacia cliente y cotizacion

### Que hace actualmente

Sobre `crm.lead` se agregan:

- `zrn_brand_id`
- `zrn_channel_id`
- `zrn_allowed_channel_ids`
- `zrn_priority`
- `zrn_next_step_note`
- `zrn_followup_state`

Comportamientos actuales:

- en oportunidades activas, marca y canal son obligatorios
- los canales permitidos pueden restringirse por los canales sugeridos de la marca
- el estado de seguimiento depende de `activity_state`
- al preparar cliente desde la oportunidad se arrastra responsable y marca
- al preparar cotizacion desde la oportunidad se arrastran marca y canal
- al asignar partner se sincroniza su perfil comercial y su canal

### Escenarios que deben cumplirse

- crear un prospecto sin forzar toda la capa comercial desde el primer momento
- convertirlo a oportunidad y completar marca y canal
- marcar prioridad comercial
- registrar siguiente paso
- visualizar si esta sin actividad, al dia, hoy o vencida

### Criterios de aceptacion

- una oportunidad activa no puede quedar sin marca o canal
- el selector de canal responde a la marca cuando hay canales sugeridos
- el siguiente paso es visible para operacion comercial
- las actividades impactan correctamente el estado de seguimiento

## 5. Clientes comerciales

### Para que debe servir

El cliente no debe quedarse solo como contacto o cuenta contable. Debe mostrar su contexto comercial en Zoraen.

Debe servir para:

- saber con que marcas trabaja ese cliente
- saber cual es su canal principal
- ver responsable comercial
- entender su estado comercial
- consultar si tiene seguimiento o no

### Que hace actualmente

Sobre `res.partner` se agregan:

- marca principal
- marcas relacionadas
- canal principal calculado desde la asignacion canal-partner
- estado comercial
- responsable comercial
- ultima gestion
- estado de seguimiento
- contador de oportunidades
- contador de cotizaciones

### Escenarios que deben cumplirse

- crear cliente desde una oportunidad y heredar contexto comercial
- agregar una marca nueva al mismo cliente
- calcular canal principal desde la asignacion del canal
- ver ultima gestion y estado de seguimiento

### Criterios de aceptacion

- el cliente hereda contexto comercial desde la oportunidad cuando aplica
- el canal principal refleja la asignacion real del canal Zoraen
- el usuario puede distinguir rapido un cliente activo, dormido o bloqueado

## 6. Cotizaciones comerciales

### Para que deben servir

La cotizacion debe respetar el contexto comercial originado en la oportunidad o en el cliente.

Debe servir para:

- mantener marca y canal a lo largo del flujo
- alertar cuando se vendan productos fuera del portafolio de la marca
- apoyar filtros por marca, canal y seguimiento

### Que hace actualmente

Sobre `sale.order` se agregan:

- marca comercial
- canal comercial
- oportunidad comercial relacionada
- estado de seguimiento
- portafolio calculado de la marca
- conteo de productos fuera de marca
- mensaje de advertencia comercial

Comportamientos actuales:

- al crear desde oportunidad, toma marca y canal por defecto
- si se crea desde cliente y no hay canal, intenta usar el canal principal del partner
- si falta marca y el cliente tiene marca principal, la toma
- al confirmar, exige marca y canal
- si la marca tiene portafolio definido, alerta cuando la cotizacion mezcla productos fuera del portafolio

### Escenarios que deben cumplirse

- crear cotizacion desde oportunidad y heredar clasificacion
- crear cotizacion desde cliente y completar defaults disponibles
- detectar lineas fuera de portafolio
- impedir confirmacion si falta marca o canal

### Criterios de aceptacion

- la cotizacion conserva el contexto comercial
- la advertencia aparece solo cuando existe portafolio definido
- no se confirma una cotizacion incompleta comercialmente

## 7. Seguimiento comercial y actividades

### Para que debe servir

El addon debe permitir ver si la cartera esta atendida o no sin montar un dashboard pesado.

Debe servir para:

- detectar registros sin actividad
- detectar actividades vencidas
- diferenciar actividad planeada y actividad del dia
- dar visibilidad rapida al seguimiento comercial

### Que hace actualmente

En oportunidades, clientes y cotizaciones se calcula un estado comercial derivado de `activity_state`:

- `no_activity`
- `planned`
- `today`
- `overdue`

Ademas, en clientes se calcula una ultima gestion usando fechas de actividades.

### Escenarios que deben cumplirse

- una oportunidad nueva sin actividades debe verse como sin seguimiento
- una cuenta con actividad vencida debe resaltarse como vencida
- una cotizacion con actividad programada debe verse con seguimiento

### Criterios de aceptacion

- el estado de seguimiento responde a las actividades reales de Odoo
- el equipo puede filtrar por registros sin actividad o vencidos

## 8. Reportes operativos

### Para que deben servir

Estos reportes no buscan reemplazar analytics, sino dar visibilidad operativa inmediata.

Deben servir para:

- filtrar pipeline por marca, canal, prioridad y seguimiento
- revisar cotizaciones por marca, canal y estado
- agrupar clientes por estado comercial o marca

### Que hace actualmente

Se agregan vistas, filtros y agrupaciones sobre:

- oportunidades
- prospectos
- clientes
- cotizaciones

Principales filtros y grupos actuales:

- marca comercial
- canal comercial
- prioridad comercial
- estado de seguimiento
- estado comercial del cliente

Tambien existen acciones para:

- prospectos
- oportunidades
- clientes comerciales
- cotizaciones
- reporte de pipeline
- reporte de cotizaciones

### Escenarios que deben cumplirse

- agrupar oportunidades por marca o canal
- detectar clientes sin actividad
- agrupar cotizaciones por marca y canal
- usar reportes pivot y graph como punto de operacion rapida

### Criterios de aceptacion

- el usuario puede revisar volumen comercial por marca y canal sin necesitar analytics
- los filtros responden al contexto comercial agregado por Zoraen

## 9. Reglas de negocio que deben mantenerse

- las oportunidades activas deben tener marca y canal
- las cotizaciones no deben confirmarse sin marca y canal
- un canal no debe repetir el mismo partner en varias asignaciones Zoraen
- un producto no debe quedar asignado a varias marcas comerciales Zoraen
- la importacion de marcas no debe destruir configuracion comercial propia
- la marca Zoraen debe seguir siendo entidad separada de cualquier marca nativa o de terceros

## 10. Escenarios integrales que el addon debe resolver

### Escenario 1: crear oportunidad desde prospecto

- se registra prospecto
- al avanzar a oportunidad se define marca y canal
- se asigna prioridad y proximo paso
- el seguimiento cambia conforme se programan actividades

### Escenario 2: convertir oportunidad en cliente comercial

- se asigna o crea partner
- el partner recibe responsable, marca principal y marcas trabajadas
- el partner queda vinculado al canal Zoraen correspondiente

### Escenario 3: crear cotizacion desde oportunidad

- la cotizacion hereda marca y canal
- si la marca tiene portafolio, se valida visualmente la mezcla de productos
- la confirmacion exige clasificacion comercial completa

### Escenario 4: importar marca existente desde Odoo

- el usuario escanea un modelo origen
- importa marcas faltantes
- configura responsables, canales y portafolio sobre la marca Zoraen
- reescanea despues sin duplicados

## 11. Casos de prueba recomendados

- crear marca comercial manual
- importar una marca y luego sincronizarla de nuevo
- crear canal comercial y asignar clientes
- crear oportunidad con marca y canal obligatorios
- convertir oportunidad en cliente
- crear cotizacion desde oportunidad
- probar alerta por producto fuera del portafolio
- confirmar que no se pueda confirmar una cotizacion sin marca o canal
- filtrar oportunidades sin actividad
- agrupar cotizaciones por marca y canal

## 12. Riesgos funcionales a vigilar

- duplicidad conceptual entre marcas nativas y marcas Zoraen si no se comunica bien el valor agregado
- importaciones desde modelos origen demasiado genericos si contienen registros que no son marcas reales
- usuarios creando oportunidades sin completar clasificacion si se relajan validaciones
- cotizaciones mezclando productos de varias marcas sin revisar la alerta

## 13. Definicion de exito de esta etapa

Esta etapa puede considerarse funcionalmente lista cuando:

- Zoraen puede operar oportunidades con marca, canal, prioridad y seguimiento
- los clientes muestran contexto comercial util
- las cotizaciones respetan la clasificacion comercial y avisan desalineaciones
- las marcas y canales aportan orden operativo real
- se pueden importar marcas existentes sin recaptura manual
- el equipo comercial puede trabajar y filtrar su cartera sin depender aun de Analytics
