# Tablero de caracterización estudiantil

Universidad Nacional de Colombia · Sede Medellín

Caracterización de los estudiantes matriculados en la Sede Medellín período a período,
construida sobre la base de matrícula de la Dirección Nacional de Información Académica,
Registro y Matrícula. Conserva la arquitectura, el sistema de diseño y el comportamiento
del tablero de pérdida de la calidad de estudiante.

---

## 1. Unidad de análisis

Cada registro de la base es una **matrícula**: un estudiante en un período académico y un
plan de estudios. Un mismo estudiante aparece tantas veces como períodos haya cursado,
que es justamente lo que mide el indicador de matrícula. Las tarjetas informan además el
número de **primeras matrículas**, que corresponde a quienes ingresan, y el número de
estudiantes distintos que aparece en el archivo de metadatos.

## 2. Cómo procesar la base completa

La base completa pesa varios gigabytes y no puede cargarse en un chat ni en memoria. El
ETL la lee **por bloques**, tomando únicamente las veintinueve columnas que el tablero
necesita, y acumula los conteos en diccionarios. El consumo de memoria depende del número
de combinaciones distintas, no del tamaño del archivo.

```bash
python3 etl_caracterizacion.py DATOS_MED.csv.gz datos COLOMBIA-MUNICIPIOS.json
```

Acepta CSV plano o comprimido en gzip. Requiere `pandas`. El tamaño del bloque se controla
con la constante `TAMANO_BLOQUE`, fijada en doscientas mil filas; bajarla reduce el uso de
memoria a costa de más iteraciones.

**Peso de la salida.** Cada variable incluida en `DIMENSIONES_NUCLEO` multiplica el número
de combinaciones. Con la muestra del diez por ciento la salida pesa 2,4 MB; sobre la base
completa crecerá, aunque menos que proporcionalmente, porque las mismas combinaciones se
repiten. El script imprime el peso total al terminar y avisa si supera los doce megabytes
fijados en `PESO_MAXIMO_MB`. Si eso ocurre, mueva variables de `DIMENSIONES_NUCLEO` a
`MARGINALES`: las que queden allí seguirán respondiendo a los filtros, pero dejarán de
filtrar al hacer clic sobre ellas. Al terminar imprime el peso de cada módulo generado y
una verificación con el número de matrículas, de estudiantes distintos, de períodos y de
planes, que debe contrastarse con la base de origen.

Para actualizar el tablero basta con reemplazar el archivo de datos y volver a ejecutar el
script. No hay que tocar el código de la aplicación.

## 3. Estructura de la salida

La salida se organiza en dos niveles para no publicar la distribución conjunta de todas
las variables, que equivaldría a publicar microdato:

- **Núcleo** (`car_nucleo.js`): combinaciones de período, plan de estudios y las siete
  variables de caracterización declaradas en `DIMENSIONES_NUCLEO` —género, quintil, tipo
  de estudiante, tipo de admisión, estrato, colegio y nivelación—, con el número de
  matrículas, las primeras matrículas y las sumas necesarias para calcular promedios
  exactos de puntaje básico, promedio académico y edad bajo cualquier filtro. Al estar en
  el núcleo, todas esas variables se combinan entre sí y filtran al hacer clic.
- **Marginales** (`car_marginales.js`): hoy vacío. La lista `MARGINALES` del ETL permite
  sacar variables del núcleo si el peso resulta excesivo; las que queden allí seguirán
  respondiendo a los filtros, pero dejarán de filtrar al hacer clic.

El municipio de procedencia también forma parte del núcleo, de modo que los mapas filtran
al hacer clic. Incorporarlo apenas cambió el peso total —las combinaciones de municipio ya
estaban en la tabla marginal— y a cambio el departamento, la categoría de ruralidad y la
condición PDET se derivan de él y también filtran.
- **Catálogos** (`car_meta.js`): atributos de cada plan de estudios —programa, nivel,
  modalidad, facultad, unidad académica básica, área curricular y área de conocimiento— y
  de cada municipio —nombre, departamento, categoría de ruralidad y condición PDET—. Los
  siete filtros del tablero se resuelven contra estos catálogos, sin repetirse en el
  núcleo.
- **Cartografía** (`car_geografia.js`): topología de municipios y departamentos.

La base de origen contiene documento, nombres, correo institucional y fecha de nacimiento.
Ninguna de esas columnas se exporta.

## 4. Secciones

| Sección | Gráfico principal | Gráficos de apoyo |
|---|---|---|
| Matrícula | Matriculados por período, con primera matrícula y matrícula de continuidad | Nivel de formación · Facultad |
| Género | Matriculados por género y período | Participación por período · Distribución |
| PBM | Matriculados por quintil del puntaje básico | Participación por período · Estrato socioeconómico |
| Tipo de estudiante | Vía de acceso a la Universidad | Participación por período · Condición de nivelación |
| Tipo de admisión | Modalidad de admisión | Participación por período · Tipo de colegio |
| Área de conocimiento | Matriculados por área y período | Participación por período · Área curricular |
| Lugar de procedencia | Mapa de municipios y tabla de municipios | Mapa de departamentos · Tabla de departamentos |

## 5. Cartografía

La cartografía se conserva en formato TopoJSON, que pesa unas cuatro veces menos que su
equivalente en GeoJSON, y el tablero la decodifica en el navegador en unos pocos
milisegundos. El identificador de cada municipio en la topología es su código DANE, de
modo que el empate con la base académica es directo y no depende de los nombres.

Los departamentos sí se empatan por nombre, y ahí la nomenclatura del reporte académico no
coincide con la cartográfica en cuatro casos: el archipiélago de San Andrés aparece en dos
formas abreviadas, Bogotá figura como «BOGOTÁ, D.C.» frente a «SANTAFE DE BOGOTA D.C», y
el registro «Extranjero» no tiene geometría posible. Los tres primeros se traducen con la
tabla `ALIAS_DEPTO` de la aplicación; el cuarto queda fuera del mapa pero sí aparece en la
tabla de detalle.

## 6. Interacción

Cinco de los filtros —facultad, área curricular, unidad académica básica, programa y
nivel de formación— se resuelven contra el catálogo de planes, de modo que restringen el
conjunto de planes admitidos; el área de conocimiento hace lo mismo. Los filtros de
período de apertura y de período académico son de selección múltiple y se ofrecen del más
reciente al más antiguo.

Las listas se recalculan con cada cambio: cada desplegable muestra únicamente las
categorías que conservan matrículas bajo el resto de la selección, y el número entre
paréntesis indica cuántas quedan. Los gráficos construidos sobre atributos del plan
—nivel, facultad, área curricular y área de conocimiento— también filtran al hacer clic
sobre una barra. Las variables de caracterización se muestran y responden a los filtros,
pero no filtran de vuelta, porque no se publican cruzadas entre sí.

Cuando las categorías no caben en el contenedor, el lienzo del gráfico crece y se recorre
con la misma barra de desplazamiento nativa que usan las tablas. Todas las tablas se
ordenan por cualquiera de sus columnas y las columnas de período van del más reciente al
más antiguo.

En los gráficos apilados y de participación los rótulos van centrados al pie y se muestran
todos: si no caben en una línea pasan a la siguiente y el área del gráfico se recorta lo
necesario. El cálculo del espacio se hace con el ancho real de la tarjeta una vez montada y con las
métricas reales de la fuente, medidas sobre un lienzo, no con una estimación por número de
caracteres: una misma leyenda ocupa una línea en el gráfico principal y hasta cuatro en
las tarjetas a media columna. Se aplica además un margen del doce por ciento, porque la
fuente que mide el lienzo no siempre es la que termina usando el navegador. Las vistas de participación se dibujan como barras apiladas al cien por ciento,
no como líneas, para que la composición de cada período se lea de un vistazo. El mapa usa una
escala por tramos en lugar de una escala continua, porque la matrícula se concentra en
Medellín y una escala continua dejaría al resto del país en el tono más claro,
indistinguible de los municipios sin estudiantes. Ambos mapas llevan un botón para volver
al encuadre inicial después de acercar o desplazar.

Al seleccionar un municipio o un departamento, sea desde el mapa o desde su tabla, se
registra un mapa reducido con solo esas geometrías, de modo que el territorio elegido
ocupa todo el encuadre en lugar de perderse dentro del país. Retirar la selección devuelve
el mapa completo.

## 7. Notas sobre los datos

- El género y el sexo legal vienen con codificaciones mezcladas en la base: conviven
  `HOMBRE` y `Masculino`, `M` y `F`. El ETL los unifica en Mujer, Hombre y Sin información.
- La primera matrícula se identifica con el campo `matriculas` igual a uno.
- La edad se calcula frente al período cursado, no frente a la fecha de generación del
  reporte, y se descartan los valores fuera del rango de catorce a noventa años.
- Los períodos intersemestrales se unifican con el semestre que los antecede.
- El puntaje básico de matrícula no está asignado para todos los registros; el quintil
  «Sin información» recoge esos casos y se excluye del cálculo de la participación de los
  quintiles uno y dos.
- La cobertura arranca en 2010-1S, controlada por la constante `PERIODO_INICIAL`.
