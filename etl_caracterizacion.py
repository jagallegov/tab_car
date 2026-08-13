# -*- coding: utf-8 -*-
"""
ETL de la base de matrícula de la Sede Medellín al conjunto de datos que
alimenta el tablero de caracterización estudiantil.

    python3 etl_caracterizacion.py <archivo.csv|.csv.gz> <carpeta_de_salida> [topojson]

La base de origen es el único insumo: para actualizar el tablero basta con
reemplazar el archivo y volver a ejecutar el script.

LECTURA POR BLOQUES
    El archivo completo pesa varios gigabytes, de modo que nunca se carga en
    memoria. Se lee por bloques de TAMANO_BLOQUE filas, tomando únicamente las
    columnas necesarias, y los conteos se acumulan en diccionarios. El consumo
    de memoria depende del número de combinaciones distintas, no del tamaño del
    archivo.

UNIDAD DE ANÁLISIS
    Cada registro es una matrícula: un estudiante en un período académico y un
    plan de estudios. Un mismo estudiante aparece tantas veces como períodos
    haya cursado, que es justamente lo que mide el indicador de matrícula.

ESTRUCTURA DE LA SALIDA
    nucleo      combinaciones de período y plan de estudios, con el número de
                matrículas, las primeras matrículas y las sumas necesarias para
                calcular promedios exactos bajo cualquier filtro.
    marginales  una tabla por variable de caracterización, condicionada al
                núcleo. Se muestran y responden a los filtros, pero nunca
                aparecen cruzadas entre sí: la salida no permite vincular el
                estrato con el género de un mismo registro.
    planes      atributos de cada plan: programa, nivel, modalidad, facultad,
                unidad académica básica, área curricular y área de conocimiento.
                Resuelve los seis filtros sin repetirlos en el núcleo.
    municipios  atributos de cada municipio: nombre, departamento, categoría de
                ruralidad y condición PDET.

PROTECCIÓN DE DATOS
    La base contiene documento, nombres, correo institucional y fecha de
    nacimiento. Ninguna de esas columnas se exporta. La salida son conteos.
"""

import gzip
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import pandas as pd

ENTRADA = sys.argv[1] if len(sys.argv) > 1 else 'datos.csv.gz'
SALIDA = sys.argv[2] if len(sys.argv) > 2 else 'datos'
TOPOJSON = sys.argv[3] if len(sys.argv) > 3 else 'COLOMBIA-MUNICIPIOS.json'

TAMANO_BLOQUE = 200000
PERIODO_INICIAL = '2010-1S'

# --------------------------------------------------------------- columnas

COLUMNAS = [
    'periodo', 'apertura', 'cod_plan', 'plan', 'programa_curricular', 'nivel', 'modalidad',
    'facultad', 'uab', 'area_curricular', 'area_conocimiento', 'matriculas',
    'genero', 'sexo_legal', 'c_pbm', 'pbm', 'acceso', 'subacceso_det',
    'cod_dane', 'depto_procedencia', 'municipio_procedencia', 'cat_ruralidad',
    'pdet', 'estrato', 'tipcolegio', 'nivelacion', 'fecha_nacimiento',
    'papa_periodo', 'creditos_aprobados', 'documento',
]

# Variables de caracterización que entran al núcleo. Al estar en él pueden
# combinarse entre sí, de modo que al seleccionar una categoría en cualquier
# gráfico se filtran todos los demás. El costo es el tamaño de la salida: cada
# variable añadida multiplica el número de combinaciones. Si al correr el script
# sobre la base completa el peso resulta excesivo, basta con mover variables de
# esta lista a MARGINALES; las que queden allí seguirán respondiendo a los
# filtros, pero dejarán de filtrar al hacer clic sobre ellas.
DIMENSIONES_NUCLEO = ['apertura', 'genero', 'quintil', 'acceso', 'admision',
                      'estrato', 'colegio', 'nivelacion', 'municipio']

# Variables que se publican condicionadas al núcleo: responden a los filtros
# pero no filtran al hacer clic sobre ellas. Hoy no hay ninguna.
MARGINALES = []

# Umbral de aviso sobre el peso total de los módulos generados.
PESO_MAXIMO_MB = 12

ORDENES = {
    'genero': ['Mujer', 'Hombre', 'Sin información'],
    'quintil': ['Quintil 1', 'Quintil 2', 'Quintil 3', 'Quintil 4', 'Quintil 5',
                'Sin información'],
    'estrato': ['1', '2', '3', '4', '5', '6', 'No estratificado', 'Sin información'],
    'colegio': ['Oficial', 'Privado', 'No oficial', 'Indígena', 'Otro',
                'Sin información'],
}

COLEGIO = {'OFI': 'Oficial', 'PRV': 'Privado', 'NOC': 'No oficial',
           'IND': 'Indígena', 'OTR': 'Otro'}

MINUSCULAS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para',
              'con', 'por', 'al', 'o', 'u'}

# Siglas que conservan la mayúscula sostenida.
SIGLAS = {'PEAMA', 'PAES', 'PAET', 'PBM', 'PDET', 'UNAL', 'ICFES', 'SIA',
          'TIC', 'PEC', 'DANE', 'D.C.'}

# Denominaciones que la base registra de forma inconsistente o sin tildes.
EQUIVALENCIAS = {
    'Facultad de Ciencias Agropecuarias': 'Facultad de Ciencias Agrarias',
    'Victimas del conflicto': 'Víctimas del conflicto',
    'Doble titulacion': 'Doble titulación',
    'Admision especial': 'Admisión especial',
    'Transito entre programas de posgrado': 'Tránsito entre programas de posgrado',
    'Admision automatica en posgrado': 'Admisión automática en posgrado',
    'Doble titulacion en pregrado': 'Doble titulación en pregrado',
    'Sin Información': 'Sin información',
    'Especializacion': 'Especialización',
    'Maestria': 'Maestría',
    'Tecnologia': 'Tecnología',
}


# --------------------------------------------------------------- utilidades

def titular(texto):
    """Convierte los rótulos en mayúscula sostenida a mayúscula inicial."""
    t = re.sub(r'\s+', ' ', str(texto).strip())
    if not t or t.lower() in ('nan', 'none'):
        return 'Sin información'
    palabras = []
    for i, w in enumerate(t.split(' ')):
        limpio = w.strip('.,()')
        if limpio.upper() in SIGLAS:
            palabras.append(w.upper())
        elif i > 0 and w.lower() in MINUSCULAS:
            palabras.append(w.lower())
        elif '-' in w:
            palabras.append('-'.join(x[:1].upper() + x[1:].lower()
                                     for x in w.split('-')))
        else:
            palabras.append(w[:1].upper() + w[1:].lower())
    salida = ' '.join(palabras)
    return EQUIVALENCIAS.get(salida, salida)


def oracion(texto):
    """Mayúscula inicial y el resto en minúscula, conservando las siglas. Se usa
    en las categorías descriptivas, donde la mayúscula en cada palabra se lee
    como si fueran nombres propios."""
    t = re.sub(r'\s+', ' ', str(texto).strip())
    if not t or t.lower() in ('nan', 'none'):
        return 'Sin información'
    palabras = []
    for i, w in enumerate(t.split(' ')):
        if w.strip('.,()').upper() in SIGLAS:
            palabras.append(w.upper())
        elif i == 0:
            palabras.append(w[:1].upper() + w[1:].lower())
        else:
            palabras.append(w.lower())
    salida = ' '.join(palabras)
    return EQUIVALENCIAS.get(salida, salida)


def normalizar(texto):
    t = unicodedata.normalize('NFD', str(texto).upper())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn').strip()


def homogenizar(periodo):
    """Unifica los períodos intersemestrales con el semestre que los antecede."""
    m = re.match(r'^(\d{4})-([12])[SI]$', str(periodo).strip().upper())
    return '%s-%sS' % (m.group(1), m.group(2)) if m else None


def indice(periodo):
    a, s = periodo.split('-')
    return int(a) * 2 + (2 if s.startswith('2') else 1)


def limpiar_genero(g, sexo):
    t = normalizar(g if pd.notna(g) else sexo)
    if t.startswith('M') and not t.startswith('MU'):
        return 'Hombre'
    if t.startswith('H'):
        return 'Hombre'
    if t.startswith('F') or t.startswith('MU'):
        return 'Mujer'
    return 'Sin información'


def quintil(v):
    try:
        q = int(float(v))
        return 'Quintil %d' % q if 1 <= q <= 5 else 'Sin información'
    except (TypeError, ValueError):
        return 'Sin información'


def texto_o_vacio(v, defecto='Sin información'):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return defecto
    t = str(v).strip()
    return t if t and t.lower() not in ('nan', 'none') else defecto


# ---------------------------------------------------------- acumuladores

class Acumulador(object):
    """Reúne los conteos de todos los bloques leídos."""

    def __init__(self):
        self.nucleo = Counter()                 # combinación -> matrículas
        self.primeras = Counter()               # combinación -> primeras matrículas
        self.sumas = defaultdict(lambda: [0.0, 0] * 3)
        self.marg = {m: Counter() for m in MARGINALES}
        self.planes = {}
        self.municipios = {}
        self.estudiantes = set()
        self.filas = 0
        self.descartadas = 0

    def agregar(self, df):
        self.filas += len(df)

        columnas = ['periodo', 'plan_cod'] + DIMENSIONES_NUCLEO
        llaves = list(zip(*[df[c] for c in columnas]))
        self.nucleo.update(llaves)
        for k, es in zip(llaves, df['primera']):
            if es:
                self.primeras[k] += 1

        for var in MARGINALES:
            self.marg[var].update(zip(llaves, df[var]))

        # sumas para promedios: puntaje básico, promedio académico y edad
        for i, campo in enumerate(('pbm_num', 'papa_num', 'edad')):
            serie = df[campo]
            for k, v in zip(llaves, serie):
                if pd.notna(v):
                    reg = self.sumas[k]
                    reg[i * 2] += float(v)
                    reg[i * 2 + 1] += 1

        for r in df[['plan_cod', 'plan_nombre', 'programa', 'nivel', 'modalidad',
                     'facultad', 'uab', 'area_curricular',
                     'area_conocimiento']].drop_duplicates('plan_cod').itertuples(index=False):
            self.planes.setdefault(r.plan_cod, {
                'cod': r.plan_cod, 'plan': r.plan_nombre, 'programa': r.programa,
                'nivel': r.nivel, 'modalidad': r.modalidad, 'facultad': r.facultad,
                'uab': r.uab, 'areaCurricular': r.area_curricular,
                'areaConocimiento': r.area_conocimiento,
            })

        for r in df[['municipio', 'mun_nombre', 'departamento', 'ruralidad',
                     'pdet']].drop_duplicates('municipio').itertuples(index=False):
            self.municipios.setdefault(r.municipio, {
                'cod': r.municipio, 'nombre': r.mun_nombre,
                'departamento': r.departamento, 'ruralidad': r.ruralidad,
                'pdet': r.pdet,
            })

        self.estudiantes.update(df['documento'].dropna().astype(str))


# ------------------------------------------------------------ preparación

def preparar(df):
    """Normaliza un bloque y deriva las variables del tablero."""
    df = df.copy()
    df['periodo'] = df['periodo'].map(homogenizar)
    df = df[df['periodo'].notna()]
    df = df[df['periodo'].map(indice) >= indice(PERIODO_INICIAL)]
    if df.empty:
        return df

    df['plan_cod'] = df['cod_plan'].astype(str).str.strip().str.replace(
        r'\.0$', '', regex=True)
    df['plan_nombre'] = df['plan'].map(titular)
    df['programa'] = df['programa_curricular'].map(titular)
    df['nivel'] = df['nivel'].map(oracion)
    df['modalidad'] = df['modalidad'].map(oracion)
    df['facultad'] = df['facultad'].map(titular)
    df['uab'] = df['uab'].map(titular)
    df['area_curricular'] = df['area_curricular'].map(titular)
    df['area_conocimiento'] = df['area_conocimiento'].map(oracion)

    # Período de apertura del historial académico: el semestre de ingreso.
    df['apertura'] = df['apertura'].map(homogenizar).fillna('Sin información')

    df['primera'] = pd.to_numeric(df['matriculas'], errors='coerce') == 1

    df['genero'] = [limpiar_genero(g, s)
                    for g, s in zip(df['genero'], df['sexo_legal'])]
    df['quintil'] = df['c_pbm'].map(quintil)
    df['acceso'] = df['acceso'].map(oracion)
    df['admision'] = df['subacceso_det'].map(oracion)
    df['estrato'] = [texto_o_vacio(v).replace('No Informa', 'Sin información')
                     .replace('No Estratificado', 'No estratificado')
                     for v in df['estrato']]
    df['colegio'] = [COLEGIO.get(normalizar(v), 'Sin información')
                     for v in df['tipcolegio']]
    df['nivelacion'] = df['nivelacion'].map(oracion)

    df['municipio'] = df['cod_dane'].astype(str).str.replace(
        r'\.0$', '', regex=True).str.zfill(5)
    df['mun_nombre'] = df['municipio_procedencia'].map(titular)
    df['departamento'] = df['depto_procedencia'].map(titular)
    df['ruralidad'] = df['cat_ruralidad'].map(oracion)
    df['pdet'] = [texto_o_vacio(v, 'Sin información') for v in df['pdet']]

    df['pbm_num'] = pd.to_numeric(df['pbm'], errors='coerce')
    df['papa_num'] = pd.to_numeric(df['papa_periodo'], errors='coerce')
    df['creditos'] = pd.to_numeric(df['creditos_aprobados'], errors='coerce')

    nac = pd.to_datetime(df['fecha_nacimiento'], errors='coerce', utc=True)
    anio = df['periodo'].str[:4].astype(int)
    sem = df['periodo'].str[5].astype(int)
    ref = anio + (sem - 1) * 0.5
    df['edad'] = (ref - (nac.dt.year + (nac.dt.month - 1) / 12.0)).round(1)
    df.loc[(df['edad'] < 14) | (df['edad'] > 90), 'edad'] = None

    return df


# ------------------------------------------------------------- geografía

def cargar_geografia(ruta):
    """Deja el TopoJSON tal como viene: el tablero lo decodifica en el navegador
    y así se evita multiplicar por cuatro el peso del archivo."""
    if not os.path.exists(ruta):
        print('AVISO: no se encontró %s; el tablero quedará sin mapa.' % ruta)
        return None
    with io.open(ruta, encoding='utf-8') as fh:
        return json.load(fh)


# --------------------------------------------------------------- escritura

def escribir(nombre, variable, objeto, comentario):
    ruta = os.path.join(SALIDA, nombre)
    with io.open(ruta, 'w', encoding='utf-8') as fh:
        fh.write('/* %s\n   Generado por etl_caracterizacion.py. No editar a mano.\n'
                 '   Contiene únicamente conteos agregados: ningún dato personal. */\n'
                 % comentario)
        fh.write('window.CAR = window.CAR || {};\n')
        fh.write('window.CAR.%s = %s;\n'
                 % (variable, json.dumps(objeto, ensure_ascii=False,
                                         separators=(',', ':'))))
    return os.path.getsize(ruta)


def main():
    if not os.path.isdir(SALIDA):
        os.makedirs(SALIDA)

    acc = Acumulador()
    abrir = gzip.open if ENTRADA.endswith('.gz') else io.open
    bloques = pd.read_csv(ENTRADA, usecols=lambda c: c in COLUMNAS,
                          chunksize=TAMANO_BLOQUE, low_memory=False)
    for i, bloque in enumerate(bloques):
        listo = preparar(bloque)
        if not listo.empty:
            acc.agregar(listo)
        print('  bloque %2d · %s filas acumuladas' % (i + 1, format(acc.filas, ',')))

    # ---- núcleo
    columnas = ['periodo', 'plan'] + DIMENSIONES_NUCLEO
    periodos = sorted({k[0] for k in acc.nucleo}, key=indice)
    planes = sorted(acc.planes, key=lambda c: -sum(
        v for k, v in acc.nucleo.items() if k[1] == c))

    categorias = {'periodo': periodos, 'plan': planes}
    for j, var in enumerate(DIMENSIONES_NUCLEO):
        vistos = {}
        for k, v in acc.nucleo.items():
            vistos[k[2 + j]] = vistos.get(k[2 + j], 0) + v
        if var == 'apertura':
            fechas = sorted([c for c in vistos if re.match(r'^\d{4}-[12]S$', c)],
                            key=indice)
            orden = fechas + [c for c in vistos if c not in fechas]
        elif var in ORDENES:
            orden = [c for c in ORDENES[var] if c in vistos]
            orden += sorted(c for c in vistos if c not in orden)
        else:
            orden = sorted(vistos, key=lambda c: -vistos[c])
        categorias[var] = orden

    indices = {c: {v: i for i, v in enumerate(categorias[c])} for c in columnas}

    filas = []
    pos = {}
    for llave in sorted(acc.nucleo, key=lambda k: (indices['periodo'][k[0]],
                                                   indices['plan'].get(k[1], 0))):
        if llave[1] not in indices['plan']:
            continue
        s3 = acc.sumas.get(llave, [0.0, 0] * 3)
        pos[llave] = len(filas)
        fila = [indices[c][llave[i]] for i, c in enumerate(columnas)]
        fila += [acc.nucleo[llave], acc.primeras.get(llave, 0),
                 round(s3[0], 1), s3[1], round(s3[2], 2), s3[3],
                 round(s3[4], 1), s3[5]]
        filas.append(fila)

    nucleo = {
        'dimensiones': columnas,
        'categorias': categorias,
        'metricas': ['n', 'primeras', 'sumaPbm', 'nPbm', 'sumaPapa', 'nPapa',
                     'sumaEdad', 'nEdad'],
        'filas': filas,
    }

    # ---- marginales
    marginales = {}
    for var in MARGINALES:
        vistos = {}
        for (_llave, c), n in acc.marg[var].items():
            vistos[c] = vistos.get(c, 0) + n
        orden = sorted(vistos, key=lambda c: -vistos[c])
        ic = {c: i for i, c in enumerate(orden)}
        cuerpo = []
        for (llave, c), n in acc.marg[var].items():
            if llave in pos:
                cuerpo.append([pos[llave], ic[c], n])
        marginales[var] = {'categorias': orden, 'filas': cuerpo}
        categorias[var] = orden

    # ---- catálogos
    lista_planes = [acc.planes[c] for c in planes]
    lista_mun = [acc.municipios[c] for c in categorias.get('municipio', [])
                 if c in acc.municipios]

    meta = {
        'periodoInicial': periodos[0],
        'periodoFinal': periodos[-1],
        'matriculas': acc.filas,
        'estudiantes': len(acc.estudiantes),
        'planes': lista_planes,
        'municipios': lista_mun,
        'facultades': sorted({p['facultad'] for p in lista_planes}),
        'uabs': sorted({p['uab'] for p in lista_planes}),
        'areasCurriculares': sorted({p['areaCurricular'] for p in lista_planes}),
        'areasConocimiento': sorted({p['areaConocimiento'] for p in lista_planes}),
        'programas': sorted({p['programa'] for p in lista_planes}),
        'niveles': sorted({p['nivel'] for p in lista_planes}),
        'modalidades': sorted({p['modalidad'] for p in lista_planes}),
        'dimensionesNucleo': DIMENSIONES_NUCLEO,
        'marginales': MARGINALES,
    }

    t1 = escribir('car_nucleo.js', 'nucleo', nucleo,
                  'Combinaciones de período y plan de estudios con sus conteos')
    t2 = escribir('car_marginales.js', 'marginales', marginales,
                  'Distribuciones de caracterización condicionadas al núcleo')
    t3 = escribir('car_meta.js', 'meta', meta,
                  'Catálogos de planes y municipios, y totales generales')

    geo = cargar_geografia(TOPOJSON)
    t4 = escribir('car_geografia.js', 'geografia', geo,
                  'Topología de municipios y departamentos de Colombia') if geo else 0

    print()
    for n, t in (('car_nucleo.js', t1), ('car_marginales.js', t2),
                 ('car_meta.js', t3), ('car_geografia.js', t4)):
        print('%-22s %9.1f KB' % (n, t / 1024.0))
    total_mb = (t1 + t2 + t3 + t4) / 1048576.0
    print('%-22s %9s combinaciones en el núcleo' % ('núcleo', format(len(filas), ',')))
    print('%-22s %9s celdas en las marginales'
          % ('marginales', format(sum(len(m['filas']) for m in marginales.values()), ',')))
    print('%-22s %9s matrículas · %s estudiantes distintos'
          % ('verificación', format(acc.filas, ','), format(len(acc.estudiantes), ',')))
    print('%-22s %9s a %s (%d períodos · %d planes)'
          % ('cobertura', periodos[0], periodos[-1], len(periodos), len(planes)))
    print('%-22s %9.1f MB en total' % ('peso', total_mb))
    if total_mb > PESO_MAXIMO_MB:
        print()
        print('AVISO: la salida supera %d MB. Considere mover variables de'
              % PESO_MAXIMO_MB)
        print('       DIMENSIONES_NUCLEO a MARGINALES para reducir el número de')
        print('       combinaciones. Las variables que queden en MARGINALES')
        print('       seguirán respondiendo a los filtros, pero dejarán de')
        print('       filtrar al hacer clic sobre ellas.')


if __name__ == '__main__':
    main()
