/* ====================================================================== */
/*  Tablero de caracterización estudiantil                                */
/*  Universidad Nacional de Colombia · Sede Medellín                      */
/*                                                                        */
/*  Este archivo se transpila en el navegador con Babel standalone.       */
/*  Los datos provienen de los módulos declarados en datos/*.js y se      */
/*  consultan a través del objeto global window.CAR.                      */
/* ====================================================================== */

const { useState, useMemo, useRef, useEffect, useCallback } = React;

const D = window.CAR;
const DEF = D.definiciones;
const N = D.nucleo;
const M = D.marginales;
const META = D.meta;
const GEO = D.geografia;

const DIM = N.dimensiones;                 // periodo, plan y las de caracterización
const CAT = N.categorias;
const K = {};
DIM.forEach((d, i) => { K[d] = i; });
const COL = {};
N.metricas.forEach((m, i) => { COL[m] = DIM.length + i; });

const PERIODOS = CAT.periodo;

/* Dimensiones de caracterización que viven en el núcleo y por lo tanto pueden
   combinarse entre sí: seleccionar una filtra todos los demás gráficos. */
const PROPIAS = DIM.slice(2);

/* Atributos de cada plan, alineados con los índices de CAT.plan. */
const PLAN = CAT.plan.map(cod => {
  const p = META.planes.find(x => x.cod === cod);
  return p || { cod: cod, plan: cod, programa: cod, nivel: '', modalidad: '',
    facultad: '', uab: '', areaCurricular: '', areaConocimiento: '' };
});

/* Filtros que no viven en el núcleo: se resuelven contra el plan de estudios. */
const DERIVADAS = {
  modalidad: { lista: META.modalidades, valor: i => PLAN[i].modalidad },
  facultad: { lista: META.facultades, valor: i => PLAN[i].facultad },
  areaCurricular: { lista: META.areasCurriculares, valor: i => PLAN[i].areaCurricular },
  uab: { lista: META.uabs, valor: i => PLAN[i].uab },
  programa: { lista: META.programas, valor: i => PLAN[i].programa },
  nivel: { lista: META.niveles, valor: i => PLAN[i].nivel },
  areaConocimiento: { lista: META.areasConocimiento, valor: i => PLAN[i].areaConocimiento }
};

/* Atributos de cada municipio, indexados por código DANE. */
const MUNI = {};
META.municipios.forEach(m => { MUNI[m.cod] = m; });

/* Dimensiones que se derivan del municipio de procedencia. Al seleccionar un
   departamento o una categoría de ruralidad se restringe el conjunto de
   municipios admitidos, igual que los filtros derivados del plan. */
const DERIV_MUNI = {
  departamento: { valor: c => (MUNI[c] ? MUNI[c].departamento : 'Sin información') },
  ruralidad: { valor: c => (MUNI[c] ? MUNI[c].ruralidad : 'Sin información') },
  pdet: { valor: c => (MUNI[c] ? MUNI[c].pdet : 'Sin información') }
};

/* ------------------------------------------------------------ formatos */
const fEnt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const vacio = v => v === null || v === undefined;
const num = v => (vacio(v) ? '—' : fEnt.format(Math.round(v)));
const pct = (v, n = 1) => (vacio(v) ? '—' : v.toFixed(n).replace('.', ',') + ' %');
const dec = (v, n = 1) => (vacio(v) ? '—' : v.toFixed(n).replace('.', ','));

const etiquetaDim = d => (DEF.dimensiones[d] || {}).etiqueta || d;
const cortoDim = d => (DEF.dimensiones[d] || {}).corto || d;
const nivelColor = k => (DEF.niveles[k] || {}).color || '#a2a3a4';
const colorCat = i => DEF.paleta[i % DEF.paleta.length];

/* Algunas dimensiones tienen colores propios declarados en el diccionario. */
const colorDe = (dim, categoria, i) => {
  const propios = (DEF.colores || {})[dim];
  return (propios && propios[categoria]) || colorCat(i);
};

const clave = t =>
  't-' + String(t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const normalizar = t =>
  String(t).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/* La nomenclatura del reporte académico no coincide con la de la cartografía
   en cuatro departamentos. Se traducen aquí para que el mapa los coloree. */
const ALIAS_DEPTO = {
  'ARCH. DE SAN ANDRES': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  'SAN ANDRES': 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
  'BOGOTA, D.C.': 'SANTAFE DE BOGOTA D.C',
  'BOGOTA D.C.': 'SANTAFE DE BOGOTA D.C',
  'BOGOTA': 'SANTAFE DE BOGOTA D.C'
};

const llaveDepto = d => {
  const t = normalizar(d);
  return ALIAS_DEPTO[t] || t;
};

const totalDe = a => a.reduce((x, y) => x + y, 0);

const mayor = (cats, vals) => {
  let i = -1, m = -1;
  vals.forEach((v, j) => { if (v > m) { m = v; i = j; } });
  return i < 0 ? { etiqueta: '—', valor: 0 } : { etiqueta: cats[i], valor: m };
};

const parteDe = (cats, vals, nombre) => {
  const t = totalDe(vals);
  const i = cats.indexOf(nombre);
  return t && i >= 0 ? 100 * vals[i] / t : null;
};

/* ==================================================================== */
/*  Configuración de las secciones                                       */
/* ==================================================================== */

const SECCIONES = [
  {
    id: 'matricula', rotulo: 'Matrícula',
    hero: { tipo: 'matricula', titulo: 'Estudiantes matriculados por período' },
    apoyoA: { dim: 'nivel', origen: 'plan', forma: 'barrasH',
      titulo: 'Matrículas por nivel de formación' },
    apoyoB: { dim: 'facultad', origen: 'plan', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por facultad' },
    tabla: { dim: 'nivel', origen: 'plan', titulo: 'Nivel de formación por período' }
  },
  {
    id: 'genero', rotulo: 'Género',
    hero: { dim: 'genero', forma: 'apiladas', titulo: 'Estudiantes matriculados por género' },
    apoyoA: { dim: 'genero', forma: 'participacion',
      titulo: 'Participación de cada género por período' },
    apoyoB: { dim: 'genero', forma: 'barrasH', titulo: 'Matrículas por género' },
    tabla: { dim: 'genero', titulo: 'Género por período' }
  },
  {
    id: 'pbm', rotulo: 'PBM',
    hero: { dim: 'quintil', forma: 'apiladas',
      titulo: 'Estudiantes matriculados por quintil del puntaje básico de matrícula' },
    apoyoA: { dim: 'quintil', forma: 'participacion',
      titulo: 'Participación de cada quintil por período' },
    apoyoB: { dim: 'estrato', forma: 'barrasH', titulo: 'Matrículas por estrato socioeconómico' },
    tabla: { dim: 'quintil', titulo: 'Quintil del puntaje básico por período' }
  },
  {
    id: 'acceso', rotulo: 'Tipo de estudiante',
    hero: { dim: 'acceso', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por tipo de estudiante' },
    apoyoA: { dim: 'acceso', forma: 'participacion',
      titulo: 'Participación de cada tipo de estudiante por período' },
    apoyoB: { dim: 'nivelacion', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por condición de nivelación' },
    tabla: { dim: 'acceso', titulo: 'Tipo de estudiante por período' }
  },
  {
    id: 'admision', rotulo: 'Tipo de admisión',
    hero: { dim: 'admision', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por tipo de admisión' },
    apoyoA: { dim: 'admision', forma: 'participacion',
      titulo: 'Participación de cada tipo de admisión por período' },
    apoyoB: { dim: 'colegio', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por tipo de colegio de origen' },
    tabla: { dim: 'admision', titulo: 'Tipo de admisión por período' }
  },
  {
    id: 'conocimiento', rotulo: 'Área de conocimiento',
    hero: { dim: 'areaConocimiento', origen: 'plan', forma: 'apiladas',
      titulo: 'Estudiantes matriculados por área de conocimiento' },
    apoyoA: { dim: 'areaConocimiento', origen: 'plan', forma: 'participacion',
      titulo: 'Participación de cada área por período' },
    apoyoB: { dim: 'areaCurricular', origen: 'plan', forma: 'barrasH', ordenar: true,
      titulo: 'Matrículas por área curricular' },
    tabla: { dim: 'areaConocimiento', origen: 'plan', titulo: 'Área de conocimiento por período' }
  },
  {
    id: 'procedencia', rotulo: 'Lugar de procedencia',
    mapaConTabla: true,
    hero: { tipo: 'mapa', titulo: 'Estudiantes por municipio de procedencia' },
    apoyoA: { tipo: 'mapaDepto', titulo: 'Estudiantes por departamento de procedencia' },
    apoyoB: { tipo: 'tablaDepto', titulo: 'Estudiantes por departamento' },
    tabla: { dim: 'departamento', origen: 'municipio', titulo: 'Departamento por período' }
  }
];

/* ==================================================================== */
/*  Motor de consulta                                                    */
/* ==================================================================== */

function crearConsulta(seleccion) {
  const cache = {};

  /* Índices de plan admitidos por los filtros derivados del plan de estudios. */
  const planesOk = omitir => {
    const llave = 'plan:' + (omitir || '');
    if (cache[llave]) return cache[llave];
    const dims = Object.keys(DERIVADAS).filter(d => d !== omitir);
    const ok = {};
    PLAN.forEach((p, i) => {
      const pasa = dims.every(d => {
        const sel = seleccion[d];
        return !sel || !sel.length || sel.indexOf(DERIVADAS[d].valor(i)) >= 0;
      });
      if (pasa) ok[i] = true;
    });
    cache[llave] = ok;
    return ok;
  };

  /* Índices admitidos en cada dimensión propia del núcleo. */
  const propiasOk = omitir => {
    const llave = 'prop:' + (omitir || '');
    if (cache[llave]) return cache[llave];
    const mapa = {};
    PROPIAS.forEach(d => {
      if (d === omitir) { mapa[d] = null; return; }
      const sel = seleccion[d];
      if (!sel || !sel.length) { mapa[d] = null; return; }
      const ok = {};
      sel.forEach(c => {
        const i = CAT[d].indexOf(c);
        if (i >= 0) ok[i] = true;
      });
      mapa[d] = ok;
    });
    // Departamento, ruralidad y condición PDET restringen los municipios.
    Object.keys(DERIV_MUNI).forEach(d => {
      if (d === omitir) return;
      const sel = seleccion[d];
      if (!sel || !sel.length) return;
      const previo = mapa.municipio;
      const ok = {};
      CAT.municipio.forEach((cod, i) => {
        if (sel.indexOf(DERIV_MUNI[d].valor(cod)) >= 0 && (!previo || previo[i])) {
          ok[i] = true;
        }
      });
      mapa.municipio = ok;
    });
    cache[llave] = mapa;
    return mapa;
  };

  const periodosOk = omitir => {
    const llave = 'per:' + (omitir === 'periodo' ? 'si' : 'no');
    if (cache[llave]) return cache[llave];
    const sel = omitir === 'periodo' ? null : seleccion.periodo;
    const ok = {};
    PERIODOS.forEach((p, i) => {
      if (!sel || !sel.length || sel.indexOf(p) >= 0) ok[i] = true;
    });
    cache[llave] = ok;
    return ok;
  };

  /**
   * Filas del núcleo que sobreviven a la selección. La dimensión indicada en
   * `omitir` no se aplica, de modo que su propio gráfico conserva todas las
   * categorías y solo atenúa las no elegidas.
   */
  const activas = omitir => {
    const llave = 'act:' + (omitir || '');
    if (cache[llave]) return cache[llave];
    const pl = planesOk(omitir);
    const pe = periodosOk(omitir);
    const pr = propiasOk(omitir);
    const out = [];
    for (let f = 0; f < N.filas.length; f++) {
      const fila = N.filas[f];
      if (!pe[fila[0]] || !pl[fila[1]]) continue;
      let pasa = true;
      for (let j = 0; j < PROPIAS.length; j++) {
        const m = pr[PROPIAS[j]];
        if (m && !m[fila[2 + j]]) { pasa = false; break; }
      }
      if (pasa) out.push(f);
    }
    cache[llave] = out;
    return out;
  };

  /** Distribución de una dimensión propia del núcleo. */
  const distribucionPropia = dim => {
    const k = K[dim];
    const out = CAT[dim].map(() => 0);
    const propio = seleccion[dim] && seleccion[dim].length;
    (propio ? activas(dim) : activas()).forEach(f => {
      out[N.filas[f][k]] += N.filas[f][COL.n];
    });
    return { categorias: CAT[dim], valores: out };
  };

  /** Distribución de un atributo del plan de estudios. */
  const distribucionPlan = dim => {
    const { lista, valor } = DERIVADAS[dim];
    const pos = {};
    lista.forEach((c, i) => { pos[c] = i; });
    const out = lista.map(() => 0);
    const propio = seleccion[dim] && seleccion[dim].length;
    (propio ? activas(dim) : activas()).forEach(f => {
      const fila = N.filas[f];
      const i = pos[valor(fila[1])];
      if (i !== undefined) out[i] += fila[COL.n];
    });
    return { categorias: lista, valores: out };
  };

  /** Distribución de un atributo derivado del municipio de procedencia. */
  const distribucionMunicipio = campo => {
    const propio = seleccion[campo] && seleccion[campo].length;
    const suma = {};
    (propio ? activas(campo) : activas()).forEach(f => {
      const fila = N.filas[f];
      const c = DERIV_MUNI[campo].valor(CAT.municipio[fila[K.municipio]]);
      suma[c] = (suma[c] || 0) + fila[COL.n];
    });
    const cats = Object.keys(suma).sort((a, b) => suma[b] - suma[a]);
    return { categorias: cats, valores: cats.map(c => suma[c]) };
  };

  const distribucion = spec => {
    if (spec.origen === 'plan') return distribucionPlan(spec.dim);
    if (spec.origen === 'municipio') return distribucionMunicipio(spec.dim);
    return distribucionPropia(spec.dim);
  };

  /** Matriz categoría por período. Respeta todos los filtros. */
  const porPeriodo = spec => {
    if (spec.origen === 'plan') {
      const { lista, valor } = DERIVADAS[spec.dim];
      const pos = {};
      lista.forEach((c, i) => { pos[c] = i; });
      const m = lista.map(() => PERIODOS.map(() => 0));
      activas().forEach(f => {
        const fila = N.filas[f];
        const i = pos[valor(fila[1])];
        if (i !== undefined) m[i][fila[0]] += fila[COL.n];
      });
      return { categorias: lista, matriz: m };
    }
    if (spec.origen === 'municipio') {
      const suma = {};
      activas().forEach(f => {
        const fila = N.filas[f];
        const c = DERIV_MUNI[spec.dim].valor(CAT.municipio[fila[K.municipio]]);
        if (!suma[c]) suma[c] = PERIODOS.map(() => 0);
        suma[c][fila[0]] += fila[COL.n];
      });
      const cats = Object.keys(suma).sort((a, b) => totalDe(suma[b]) - totalDe(suma[a]));
      return { categorias: cats, matriz: cats.map(c => suma[c]) };
    }
    const k = K[spec.dim];
    const m = CAT[spec.dim].map(() => PERIODOS.map(() => 0));
    activas().forEach(f => {
      const fila = N.filas[f];
      m[fila[k]][fila[0]] += fila[COL.n];
    });
    return { categorias: CAT[spec.dim], matriz: m };
  };

  /** Matrículas totales y primeras matrículas por período. */
  const serieMatricula = () => {
    const total = PERIODOS.map(() => 0);
    const primeras = PERIODOS.map(() => 0);
    activas().forEach(f => {
      const fila = N.filas[f];
      total[fila[0]] += fila[COL.n];
      primeras[fila[0]] += fila[COL.primeras];
    });
    return { total, primeras, otras: total.map((v, i) => v - primeras[i]) };
  };

  /** Conteo por municipio, para el mapa y la tabla de procedencia. */
  const porMunicipio = () => {
    const suma = {};
    const propio = seleccion.municipio && seleccion.municipio.length;
    (propio ? activas('municipio') : activas()).forEach(f => {
      const fila = N.filas[f];
      const cod = CAT.municipio[fila[K.municipio]];
      suma[cod] = (suma[cod] || 0) + fila[COL.n];
    });
    return suma;
  };

  const agregados = () => {
    let n = 0, pr = 0, sP = 0, nP = 0, sA = 0, nA = 0, sE = 0, nE = 0;
    const planes = {};
    const periodos = {};
    activas().forEach(f => {
      const r = N.filas[f];
      n += r[COL.n]; pr += r[COL.primeras];
      sP += r[COL.sumaPbm]; nP += r[COL.nPbm];
      sA += r[COL.sumaPapa]; nA += r[COL.nPapa];
      sE += r[COL.sumaEdad]; nE += r[COL.nEdad];
      planes[r[1]] = true;
      periodos[r[0]] = true;
    });
    const per = Object.keys(periodos).map(Number).sort((a, b) => a - b);
    return {
      n, primeras: pr, planes: Object.keys(planes).length,
      pbm: nP ? sP / nP : null, papa: nA ? sA / nA : null,
      edad: nE ? sE / nE : null,
      rango: per.length
        ? (per.length === 1 ? PERIODOS[per[0]]
          : PERIODOS[per[0]] + ' a ' + PERIODOS[per[per.length - 1]])
        : '—'
    };
  };

  /** Categorías con matrículas bajo el resto de la selección. */
  const opciones = dim => {
    const r = DERIVADAS[dim] ? distribucionPlan(dim) : distribucionPropia(dim);
    return r.categorias.filter((c, i) => r.valores[i] > 0);
  };

  return {
    distribucion, porPeriodo, serieMatricula, porMunicipio, agregados, opciones,
    activas
  };
}

/* ==================================================================== */
/*  Geografía                                                            */
/* ==================================================================== */

/**
 * Decodifica la topología a GeoJSON dentro del navegador. Se conserva el
 * formato TopoJSON en disco porque pesa cuatro veces menos que su equivalente
 * en GeoJSON, y la conversión toma unos pocos milisegundos.
 */
function decodificarTopo(topo, objeto, propiedadNombre) {
  if (!topo || !topo.objects || !topo.objects[objeto]) return null;
  const t = topo.transform;
  const arcos = topo.arcs.map(arco => {
    let x = 0, y = 0;
    return arco.map(d => {
      x += d[0]; y += d[1];
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]];
    });
  });
  const linea = idx => {
    let pts = [];
    idx.forEach(i => {
      let a = i < 0 ? arcos[~i].slice().reverse() : arcos[i];
      if (pts.length) a = a.slice(1);
      pts = pts.concat(a);
    });
    return pts;
  };
  const features = topo.objects[objeto].geometries.map(g => {
    const props = Object.assign({}, g.properties);
    props.codigo = g.id !== undefined ? String(g.id) : props[propiedadNombre];
    props.llave = normalizar(props[propiedadNombre] || props.codigo);
    return {
      type: 'Feature',
      properties: props,
      geometry: g.type === 'Polygon'
        ? { type: 'Polygon', coordinates: g.arcs.map(linea) }
        : { type: 'MultiPolygon', coordinates: g.arcs.map(p => p.map(linea)) }
    };
  });
  return { type: 'FeatureCollection', features: features };
}

let mapasListos = false;
const GEOJSON = {};

function registrarMapas() {
  if (mapasListos || !window.echarts || !GEO) return mapasListos;
  const mun = decodificarTopo(GEO, 'mpios', 'name');
  const dep = decodificarTopo(GEO, 'depts', 'dpt');
  if (mun) { GEOJSON.municipios = mun; window.echarts.registerMap('municipios', mun); }
  if (dep) { GEOJSON.departamentos = dep; window.echarts.registerMap('departamentos', dep); }
  mapasListos = !!(mun && dep);
  return mapasListos;
}

/**
 * Cuando hay una selección territorial se registra un mapa reducido con solo
 * esas geometrías, de modo que el municipio o el departamento elegido ocupe
 * todo el encuadre en lugar de perderse dentro del país.
 */
function mapaFiltrado(base, llaves) {
  if (!GEOJSON[base] || !llaves || !llaves.length) return base;
  const permitidas = {};
  llaves.forEach(k => { permitidas[k] = true; });
  const features = GEOJSON[base].features.filter(f => {
    const p = f.properties;
    return permitidas[base === 'municipios' ? p.codigo : p.llave];
  });
  if (!features.length) return base;
  const nombre = base + '_seleccion';
  window.echarts.registerMap(nombre, { type: 'FeatureCollection', features: features });
  return nombre;
}

/* ==================================================================== */
/*  Piezas de interfaz                                                   */
/* ==================================================================== */

function Tarjeta({ titulo, accion, children }) {
  return (
    <section className="dsh-card">
      <div className="dsh-card-h">
        <h2>{titulo}</h2>
        {accion || null}
      </div>
      <div className="dsh-cuerpo">{children}</div>
    </section>
  );
}

function descargarCsv(nombreArchivo, encabezados, filas) {
  const celda = v => {
    if (vacio(v)) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const t = String(v);
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const texto = [encabezados].concat(filas).map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreArchivo = partes =>
  partes.filter(Boolean).map(clave).join('_').replace(/^t-/, '').replace(/_t-/g, '_');

const TIPO_LETRA = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function descargarPng(ec, nombreSalida, titulo) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 74 * pr, pie = 34 * pr, margen = 20 * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.textBaseline = 'middle';
    c.fillStyle = '#242627';
    c.font = '600 ' + 15 * pr + 'px ' + TIPO_LETRA;
    c.fillText(titulo, margen, 30 * pr);
    c.fillStyle = '#677d29';
    c.font = '600 ' + 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText('Universidad Nacional de Colombia · Sede Medellín', margen, 54 * pr);
    c.strokeStyle = '#dcdcdc';
    c.lineWidth = 1 * pr;
    c.beginPath();
    c.moveTo(margen, cabecera - 6 * pr);
    c.lineTo(lienzo.width - margen, cabecera - 6 * pr);
    c.stroke();
    c.drawImage(img, 0, cabecera);
    c.fillStyle = '#a2a3a4';
    c.font = 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText(DEF.nota, margen, img.height + cabecera + pie / 2);
    const a = document.createElement('a');
    a.href = lienzo.toDataURL('image/png');
    a.download = nombreSalida + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = base;
}

function Descargas({ csv, instancia, nombre, titulo }) {
  return (
    <span className="dsh-acc">
      {csv ? (
        <button type="button" className="dsh-ico" title="Descargar los datos agregados en CSV"
          aria-label="Descargar los datos agregados en CSV"
          onClick={() => { const d = csv(); if (d) descargarCsv(nombre, d.encabezados, d.filas); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L12 13.2V3h0ZM5 18h14v2H5v-2Z" />
          </svg>
        </button>
      ) : null}
      {instancia ? (
        <button type="button" className="dsh-ico" title="Descargar el gráfico en PNG"
          aria-label="Descargar el gráfico en PNG"
          onClick={() => { const ec = instancia.current; if (ec) descargarPng(ec, nombre, titulo); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5-2.2-2.7L5 17Zm3.2-6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

function Grafico({ opcion, alto, instancia, alSeleccionar, ancho, altoLienzo }) {
  const caja = useRef(null);
  const inst = useRef(null);
  const cb = useRef(alSeleccionar);
  cb.current = alSeleccionar;
  const opcionRef = useRef(opcion);
  opcionRef.current = opcion;

  useEffect(() => {
    if (!window.echarts || !caja.current) return undefined;
    inst.current = window.echarts.init(caja.current, null, { renderer: 'canvas' });
    if (instancia) instancia.current = inst.current;
    inst.current.on('click', p => { if (cb.current) cb.current(p.name); });
    const redimensionar = () => {
      if (!inst.current) return;
      inst.current.resize();
      ajustarLeyenda(inst.current, opcionRef.current);
    };
    let obs = null;
    if (window.ResizeObserver) {
      obs = new window.ResizeObserver(redimensionar);
      obs.observe(caja.current);
    }
    window.addEventListener('resize', redimensionar);
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  useEffect(() => {
    if (inst.current && opcion) {
      inst.current.setOption(opcion, true);
      ajustarLeyenda(inst.current, opcion);
    }
  }, [opcion]);

  useEffect(() => { if (inst.current) inst.current.resize(); }, [ancho, altoLienzo]);

  if (!window.echarts) {
    return <p className="dsh-vacio">Los gráficos no están disponibles en esta sesión.</p>;
  }

  const estilo = { cursor: alSeleccionar ? 'pointer' : 'default' };
  if (ancho) estilo.width = ancho + 'px';
  if (altoLienzo) estilo.height = altoLienzo + 'px';

  return (
    <div className="dsh-scroll" style={{ maxHeight: altoLienzo ? 420 : undefined }}>
      <div ref={caja} className={'dsh-grafico ' + (alto || '')} style={estilo} />
    </div>
  );
}

function TarjetaGrafico({ titulo, alto, opcion, csv, archivo, alSeleccionar,
  ancho, altoLienzo, centrable }) {
  const instancia = useRef(null);
  const centrar = () => {
    const ec = instancia.current;
    if (ec) ec.dispatchAction({ type: 'restore' });
  };
  return (
    <Tarjeta titulo={titulo}
      accion={
        <span className="dsh-acc">
          {centrable ? (
            <button type="button" className="dsh-ico" title="Centrar el mapa"
              aria-label="Centrar el mapa" onClick={centrar}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm9-3h-2.1a7 7 0 0 0-5.9-5.9V3h-2v2.1A7 7 0 0 0 5.1 11H3v2h2.1a7 7 0 0 0 5.9 5.9V21h2v-2.1a7 7 0 0 0 5.9-5.9H21v-2Zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
              </svg>
            </button>
          ) : null}
          <Descargas csv={csv} instancia={instancia} nombre={archivo} titulo={titulo} />
        </span>
      }>
      {opcion
        ? <Grafico opcion={opcion} alto={alto} instancia={instancia}
            alSeleccionar={alSeleccionar} ancho={ancho} altoLienzo={altoLienzo} />
        : <p className="dsh-vacio">Sin datos para la selección vigente.</p>}
    </Tarjeta>
  );
}

function TablaMatriz({ rotFila, filas, columnas, matriz, descendente }) {
  const [orden, setOrden] = useState({ col: -1, asc: !descendente });

  const indices = useMemo(() => {
    const idx = filas.map((f, j) => j);
    const valor = i => {
      if (orden.col === -1) return filas[i];
      if (orden.col === columnas.length) return totalDe(matriz[i]);
      return matriz[i][orden.col];
    };
    idx.sort((a, b) => {
      const va = valor(a), vb = valor(b);
      const r = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      return orden.asc ? r : -r;
    });
    return idx;
  }, [filas, matriz, columnas, orden]);

  const clic = c => setOrden(o =>
    (o.col === c ? { col: c, asc: !o.asc } : { col: c, asc: c === -1 }));
  const flecha = c => (orden.col === c
    ? <span className="ord"> {orden.asc ? '▲' : '▼'}</span> : null);

  return (
    <div className="dsh-tabla-wrap" style={{ maxHeight: 430 }}>
      <table className="dsh-tabla ancha">
        <thead>
          <tr>
            <th className="fija" onClick={() => clic(-1)}>{rotFila}{flecha(-1)}</th>
            {columnas.map((c, j) => (
              <th key={c} className="num" onClick={() => clic(j)}>{c}{flecha(j)}</th>
            ))}
            <th className="num" onClick={() => clic(columnas.length)}>
              Total{flecha(columnas.length)}
            </th>
          </tr>
        </thead>
        <tbody>
          {indices.map(i => (
            <tr key={filas[i]}>
              <td className="fija">{filas[i]}</td>
              {columnas.map((c, j) => (
                <td key={c} className="num">{matriz[i][j] ? num(matriz[i][j]) : '·'}</td>
              ))}
              <td className="num">{num(totalDe(matriz[i]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Listado de municipios que acompaña al mapa, ordenable por cualquier columna. */
function TablaRanking({ filas, alSeleccionar, rotulos }) {
  const columnas = (rotulos || ['Municipio', 'Departamento']).map((r, i) => (
    i === 0 ? { rot: r, campo: 'nombre', fija: true } : { rot: r, campo: 'departamento' }
  )).concat([
    { rot: 'Estudiantes', campo: 'valor', num: true },
    { rot: '%', campo: 'parte', num: true }
  ]);
  const [orden, setOrden] = useState({ col: 2, asc: false });

  const ordenadas = useMemo(() => {
    const c = columnas[orden.col];
    const copia = filas.slice();
    copia.sort((a, b) => {
      const va = a[c.campo], vb = b[c.campo];
      const r = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      return orden.asc ? r : -r;
    });
    return copia;
  }, [filas, orden]);

  const clic = i => setOrden(o =>
    (o.col === i ? { col: i, asc: !o.asc } : { col: i, asc: !columnas[i].num }));

  if (!filas.length) {
    return <p className="dsh-vacio">Sin municipios en la selección vigente.</p>;
  }
  return (
    <div className="dsh-tabla-wrap" style={{ maxHeight: 520 }}>
      <table className="dsh-tabla">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c.rot} className={(c.fija ? 'fija' : '') + (c.num ? ' num' : '')}
                onClick={() => clic(i)}>
                {c.rot}
                {orden.col === i ? <span className="ord"> {orden.asc ? '▲' : '▼'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(m => (
            <tr key={m.cod} style={{ cursor: 'pointer' }}
              onClick={() => alSeleccionar && alSeleccionar(m.cod)}>
              <td className="fija">{m.nombre}</td>
              {columnas.length > 3 ? <td>{m.departamento}</td> : null}
              <td className="num">{num(m.valor)}</td>
              <td className="num">{pct(m.parte)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ icono, fondo, etiqueta, valor, pie }) {
  return (
    <div className="dsh-kpi">
      <span className="dsh-kpi-ic" style={{ background: fondo }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icono} /></svg>
      </span>
      <span>
        <span className="dsh-kpi-lab">{etiqueta}</span>
        <span className="dsh-kpi-val">{valor}</span>
        {pie ? <span className="dsh-kpi-pie">{pie}</span> : null}
      </span>
    </div>
  );
}

const IC = {
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Z',
  persona: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5Z',
  tasa: 'M3.5 18.5 9 13l4 4 7.5-7.5-1.4-1.4L13 14.2l-4-4-6.9 6.9 1.4 1.4Z',
  reloj: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.6 4.2 2.5-.9 1.5L11 13.4V6h2v6.6Z',
  malla: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  libro: 'M4 4h7v16H4V4Zm9 0h7v16h-7V4Zm1.6 2.4v1.7h3.8V6.4h-3.8Z',
  cinta: 'm12 17.3-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z',
  mapa: 'M15 4 9 2 3 4v18l6-2 6 2 6-2V2l-6 2Zm0 15.6-6-2V4.4l6 2v13.2Z',
  variacion: 'M12 4 4 12h5v8h6v-8h5L12 4Z'
};

/* ==================================================================== */
/*  Opciones de los gráficos                                             */
/* ==================================================================== */

const baseOpcion = () => ({
  textStyle: { fontFamily: TIPO_LETRA, fontSize: 11, color: '#4e5254' },
  animationDuration: 300,
  grid: { left: 66, right: 26, top: 42, bottom: 64, containLabel: false },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff',
    borderColor: '#dcdcdc',
    borderWidth: 1,
    textStyle: { color: '#242627', fontSize: 11, fontFamily: TIPO_LETRA },
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(103,125,41,.06)' } },
    valueFormatter: v => num(v)
  },
  legend: {
    top: 0, icon: 'roundRect', itemWidth: 11, itemHeight: 11, itemGap: 14,
    textStyle: { color: '#4e5254', fontSize: 11 }
  }
});

const rotacionX = etiquetas => {
  const largo = etiquetas.reduce((a, e) => Math.max(a, String(e).length), 0);
  return etiquetas.length > 10 && largo <= 10 ? 90 : 0;
};

const ejeCategoria = etiquetas => ({
  type: 'category',
  data: etiquetas,
  boundaryGap: true,
  axisLine: { lineStyle: { color: '#dcdcdc' } },
  axisTick: { show: false },
  axisLabel: { color: '#4e5254', rotate: rotacionX(etiquetas), fontSize: 10, interval: 0 }
});

const ejeValor = (esPct) => ({
  type: 'value',
  max: esPct ? 100 : null,
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: '#f0f0f0' } },
  axisLabel: {
    color: '#4e5254', fontSize: 10,
    formatter: v => (esPct ? v + ' %' : fEnt.format(v))
  }
});

function opcionLineas(etiquetas, series, esPct) {
  const o = baseOpcion();
  o.xAxis = ejeCategoria(etiquetas);
  o.yAxis = ejeValor(esPct);
  o.tooltip.axisPointer = { type: 'line', lineStyle: { color: '#a2a3a4', type: 'dashed' } };
  o.tooltip.valueFormatter = v => (esPct ? pct(v) : num(v));
  o.series = series.map(s => ({
    name: s.nombre, type: 'line', data: s.datos,
    smooth: 0.35, smoothMonotone: 'x', symbol: 'circle', symbolSize: 6,
    lineStyle: { width: 2, color: s.color, cap: 'round', join: 'round' },
    itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 1.4 },
    emphasis: { focus: 'series', scale: 1.4 },
    areaStyle: series.length <= 2 ? { color: s.color, opacity: 0.13 } : null
  }));
  return series.length > 2 ? leyendaAbajo(o, series.map(s => s.nombre)) : o;
}

/** Barras apiladas al cien por ciento, para las vistas de participación. */
function opcionApiladasPct(etiquetas, series) {
  const o = baseOpcion();
  o.xAxis = ejeCategoria(etiquetas);
  o.yAxis = ejeValor(true);
  o.tooltip.valueFormatter = v => pct(v);
  o.series = series.map(s => ({
    name: s.nombre, type: 'bar', stack: 'pct', data: s.datos,
    barMaxWidth: 26, itemStyle: { color: s.color },
    emphasis: { focus: 'series' }
  }));
  if (o.series.length) {
    const ultima = o.series[o.series.length - 1];
    ultima.itemStyle = { color: ultima.itemStyle.color, borderRadius: [4, 4, 0, 0] };
  }
  return leyendaAbajo(o, series.map(s => s.nombre));
}

function leyendaAbajo(o, nombres) {
  /* Los rótulos van centrados al pie y se muestran todos. El número de líneas
     que ocupan depende del ancho real de la tarjeta, que no se conoce al armar
     la configuración: se guarda la lista y el envoltorio del gráfico recalcula
     el margen inferior una vez montado y en cada redimensionamiento. */
  o.legend = Object.assign({}, o.legend, {
    top: null, bottom: 6, left: 'center', width: '94%',
    type: 'plain', orient: 'horizontal', itemGap: 18, padding: [2, 6]
  });
  o.grid = Object.assign({}, o.grid, { top: 16, bottom: MARGEN_EJE + ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA });
  o.rotulosLeyenda = nombres || [];
  return o;
}

/* Espacio reservado bajo el área de dibujo: rótulos del eje horizontal, que van
   verticales, más el alto de cada línea de leyenda. */
const MARGEN_EJE = 74;
const ALTO_LINEA_LEYENDA = 24;
const HOLGURA_LEYENDA = 10;

/* Medidor de texto con las métricas reales de la fuente. Estimar el ancho por
   número de caracteres subestimaba las leyendas largas y estas terminaban
   montadas sobre las barras. */
let medidor = null;
function anchoTexto(texto, fuente) {
  if (!medidor) {
    const lienzo = document.createElement('canvas');
    medidor = lienzo.getContext ? lienzo.getContext('2d') : null;
  }
  if (!medidor) return String(texto).length * 7;
  medidor.font = fuente;
  return medidor.measureText(String(texto)).width;
}

/**
 * Ajusta el margen inferior al espacio que realmente ocupa la leyenda. El
 * número de líneas depende del ancho de la tarjeta, que no se conoce al armar
 * la configuración, de modo que el cálculo se hace una vez montado el gráfico
 * y se repite en cada redimensionamiento.
 */
function ajustarLeyenda(inst, opcion) {
  if (!inst || !opcion || !opcion.rotulosLeyenda || !opcion.rotulosLeyenda.length) return;
  if (typeof inst.getWidth !== 'function') return;

  const disponible = Math.max(200, inst.getWidth() * 0.90 - 32);
  const fuente = '11px ' + TIPO_LETRA;
  /* Cada elemento ocupa el ícono, su separación con el texto y el texto mismo.
     Se aplica un margen del doce por ciento porque la fuente que mide el lienzo
     no siempre es la que termina usando el navegador: quedarse corto monta la
     leyenda sobre las barras, mientras que pasarse solo deja algo de aire. */
  const anchos = opcion.rotulosLeyenda.map(
    n => (11 + 5 + anchoTexto(n, fuente)) * 1.12);
  const separacion = 18;

  let lineas = 1;
  let usado = 0;
  anchos.forEach(a => {
    const necesita = usado ? usado + separacion + a : a;
    if (necesita > disponible && usado > 0) {
      lineas += 1;
      usado = a;
    } else {
      usado = necesita;
    }
  });

  inst.setOption({
    grid: { bottom: MARGEN_EJE + lineas * ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA }
  });
}

function opcionApiladas(etiquetas, series) {
  const o = baseOpcion();
  o.xAxis = ejeCategoria(etiquetas);
  o.yAxis = ejeValor(false);
  o.series = series.map(s => ({
    name: s.nombre, type: 'bar', stack: 'total', data: s.datos,
    barMaxWidth: 26,
    itemStyle: { color: s.color },
    emphasis: { focus: 'series' }
  }));
  if (o.series.length) {
    o.series[o.series.length - 1].itemStyle = {
      color: o.series[o.series.length - 1].itemStyle.color,
      borderRadius: [4, 4, 0, 0]
    };
  }
  return leyendaAbajo(o, series.map(s => s.nombre));
}

function opcionBarras(etiquetas, datos, colores, seleccion) {
  const o = baseOpcion();
  o.xAxis = ejeCategoria(etiquetas);
  o.yAxis = ejeValor(false);
  o.legend = { show: false };
  o.grid.top = 18;
  o.tooltip.trigger = 'item';
  o.tooltip.formatter = p => p.name + '<br/>' + num(p.value);
  o.series = [{
    type: 'bar',
    data: datos.map((v, i) => ({
      value: v,
      itemStyle: {
        color: colores ? colores[i] : '#677d29',
        borderRadius: [4, 4, 1, 1],
        opacity: seleccion && seleccion.length && seleccion.indexOf(etiquetas[i]) < 0 ? 0.3 : 1
      }
    })),
    barMaxWidth: 34,
    emphasis: { focus: 'self' }
  }];
  return o;
}

function opcionBarrasH(etiquetas, datos, colores, seleccion) {
  const o = baseOpcion();
  const ancho = etiquetas.reduce((a, e) => Math.max(a, String(e).length), 0);
  // Con pocas categorías las barras quedarían repartidas por todo el alto; se
  // recogen hacia el centro dejando margen arriba y abajo.
  const holgura = etiquetas.length <= 6 ? 60 : 12;
  o.grid = {
    left: Math.min(250, 20 + ancho * 5.6), right: 62,
    top: holgura, bottom: Math.max(26, holgura)
  };
  o.legend = { show: false };
  o.xAxis = ejeValor(false);
  const eti = etiquetas.slice().reverse();
  o.yAxis = {
    type: 'category', data: eti,
    axisLine: { lineStyle: { color: '#dcdcdc' } },
    axisTick: { show: false },
    axisLabel: { color: '#4e5254', fontSize: 10, interval: 0 }
  };
  o.tooltip.trigger = 'item';
  o.tooltip.formatter = p => p.name + '<br/>' + num(p.value);
  const inv = datos.slice().reverse();
  const col = colores ? colores.slice().reverse() : null;
  o.series = [{
    type: 'bar',
    data: inv.map((v, i) => ({
      value: v,
      itemStyle: {
        color: col ? col[i] : '#677d29',
        borderRadius: [1, 4, 4, 1],
        opacity: seleccion && seleccion.length && seleccion.indexOf(eti[i]) < 0 ? 0.3 : 1
      }
    })),
    barMaxWidth: 22,
    label: { show: true, position: 'right', fontSize: 10, color: '#4e5254',
      formatter: p => num(p.value) },
    emphasis: { focus: 'self' }
  }];
  return o;
}

/** Barras apiladas de primera matrícula y matrículas de continuidad. */
function opcionMatricula(etiquetas, primeras, otras, total) {
  const o = baseOpcion();
  o.xAxis = ejeCategoria(etiquetas);
  o.yAxis = ejeValor(false);
  o.series = [
    {
      name: 'Primera matrícula', type: 'bar', stack: 'm', data: primeras,
      barMaxWidth: 26, itemStyle: { color: '#d4626a' }
    },
    {
      name: 'Otras matrículas', type: 'bar', stack: 'm', data: otras,
      barMaxWidth: 26, itemStyle: { color: '#a2a3a4', borderRadius: [4, 4, 0, 0] }
    },
    {
      name: 'Matrícula total', type: 'line', data: total,
      smooth: 0.35, smoothMonotone: 'x', symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 2, color: '#1f5c3d', type: 'dashed' },
      itemStyle: { color: '#1f5c3d', borderColor: '#fff', borderWidth: 1.4 }
    }
  ];
  return o;
}

function opcionMapa(nombreMapa, datos, maximo, formatoNombre, propiedad) {
  const tramos = DEF.tramosMapa.map(t => {
    const p = { color: t.color, label: t.rotulo };
    if (t.min !== undefined) p.min = t.min;
    if (t.max !== undefined) p.max = t.max;
    return p;
  });
  return {
    textStyle: { fontFamily: TIPO_LETRA, fontSize: 11, color: '#4e5254' },
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#ffffff',
      borderColor: '#dcdcdc',
      borderWidth: 1,
      textStyle: { color: '#242627', fontSize: 11, fontFamily: TIPO_LETRA },
      formatter: p => formatoNombre(p.name) + '<br/>' +
        (vacio(p.value) || isNaN(p.value) ? 'Sin estudiantes' : num(p.value) + ' estudiantes')
    },
    /* Escala por tramos: la matrícula se concentra en Medellín y una escala
       continua dejaría al resto del país en el tono más claro, indistinguible
       de los municipios sin estudiantes. */
    visualMap: {
      type: 'piecewise',
      pieces: tramos,
      orient: 'vertical', left: 10, bottom: 20,
      itemWidth: 14, itemHeight: 12, itemGap: 6,
      textStyle: { color: '#4e5254', fontSize: 10 },
      outOfRange: { color: '#ececec' }
    },
    series: [{
      type: 'map',
      map: nombreMapa,
      nameProperty: propiedad,
      roam: true,
      zoom: 1.15,
      data: datos,
      itemStyle: { areaColor: '#ececec', borderColor: '#ffffff', borderWidth: 0.4 },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: '#d49d00', borderColor: '#242627', borderWidth: 1 }
      },
      select: { disabled: true }
    }]
  };
}

/* ==================================================================== */
/*  Contexto y filtros                                                   */
/* ==================================================================== */

function Definicion({ def }) {
  return (
    <div className="dsh-definicion">
      <h1>{def.titulo}</h1>
      <p>{def.texto}</p>
    </div>
  );
}

function Seleccion({ seleccion, quitar, limpiar }) {
  const fichas = [];
  Object.keys(seleccion).forEach(d => {
    (seleccion[d] || []).forEach(c => fichas.push({ dim: d, cat: c }));
  });
  if (!fichas.length) return null;
  return (
    <div className="dsh-seleccion">
      <b>Selección activa:</b>
      {fichas.map(f => (
        <button key={f.dim + '|' + f.cat} type="button" className="dsh-quitar"
          onClick={() => quitar(f.dim, f.cat)}>
          {cortoDim(f.dim)}: {f.dim === 'municipio' && MUNI[f.cat]
            ? MUNI[f.cat].nombre : f.cat}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="dsh-limpiar-sel" onClick={limpiar}>Quitar todo</button>
    </div>
  );
}

function SelectorMultiple({ etiqueta, opciones, valores, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const esc = e => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const resumen = !valores.length ? 'Todos (' + opciones.length + ')'
    : valores.length === 1 ? valores[0] : valores.length + ' seleccionados';

  const alternar = v => {
    const s = valores.slice();
    const i = s.indexOf(v);
    if (i >= 0) s.splice(i, 1); else s.push(v);
    onCambio(opciones.filter(o => s.indexOf(o) >= 0));
  };

  return (
    <div className="dsh-multi" ref={caja}>
      <button type="button" aria-haspopup="true" aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)}>{resumen}</button>
      {abierto ? (
        <div className="dsh-multi-panel" role="group" aria-label={etiqueta}>
          <div className="dsh-multi-acc">
            <button type="button" onClick={() => onCambio([])}>Todos</button>
            <button type="button" onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          <div className="dsh-multi-lista">
            {opciones.map(o => (
              <label key={o}>
                <input type="checkbox" checked={valores.indexOf(o) >= 0}
                  onChange={() => alternar(o)} />
                {o}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Filtros({ seleccion, fijar, limpiar, Q }) {
  const unico = dim => {
    const vigentes = Q.opciones(dim);
    const elegida = (seleccion[dim] || [])[0];
    const lista = elegida && vigentes.indexOf(elegida) < 0
      ? [elegida].concat(vigentes) : vigentes;
    return (
      <select className="dsh-select" value={elegida || ''}
        onChange={e => fijar(dim, e.target.value ? [e.target.value] : [])}>
        <option value="">Todos ({lista.length})</option>
        {lista.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  };

  const campo = (etiqueta, control) => (
    <div className="dsh-campo">
      <span className="dsh-leyenda">{etiqueta}</span>
      {control}
    </div>
  );

  return (
    <section className="dsh-filtros" aria-label="Filtros">
      <div className="dsh-grid-f f-4">
        {campo('Facultad', unico('facultad'))}
        {campo('Área curricular', unico('areaCurricular'))}
        {campo('Unidad académica básica', unico('uab'))}
        {campo('Programa', unico('programa'))}
        {campo('Nivel de formación', unico('nivel'))}
        {campo('Área de conocimiento', unico('areaConocimiento'))}
        {campo('Período de apertura',
          <SelectorMultiple etiqueta="Período de apertura"
            opciones={CAT.apertura.slice().reverse()}
            valores={seleccion.apertura || []} onCambio={v => fijar('apertura', v)} />)}
        {campo('Período',
          <SelectorMultiple etiqueta="Período" opciones={PERIODOS.slice().reverse()}
            valores={seleccion.periodo || []} onCambio={v => fijar('periodo', v)} />)}
      </div>
      <div className="dsh-acciones">
        <button className="dsh-btn" type="button" onClick={limpiar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" />
          </svg>
          Restablecer
        </button>
      </div>
    </section>
  );
}

/* ==================================================================== */
/*  Panel                                                                */
/* ==================================================================== */

function Panel({ sec, seleccion, alternar, Q }) {
  const agg = useMemo(() => Q.agregados(), [Q]);
  const hayMapas = useMemo(() => registrarMapas(), [Q]);

  const construir = spec => {
    // Las tarjetas que muestran una tabla no construyen opciones de gráfico.
    if (!spec || (!spec.dim && !spec.tipo) || spec.tipo === 'tablaDepto') {
      return { opcion: null, csv: null };
    }
    if (spec.tipo === 'matricula') {
      const s = Q.serieMatricula();
      return {
        opcion: opcionMatricula(PERIODOS, s.primeras, s.otras, s.total),
        csv: () => ({
          encabezados: ['Período', 'Primera matrícula', 'Otras matrículas', 'Matrícula total'],
          filas: PERIODOS.map((p, i) => [p, s.primeras[i], s.otras[i], s.total[i]])
        }),
        alSeleccionar: n => alternar('periodo', n)
      };
    }
    if (spec.tipo === 'mapa' || spec.tipo === 'mapaDepto') {
      if (!hayMapas) return { opcion: null, csv: null };
      const conteo = Q.porMunicipio();
      if (spec.tipo === 'mapa') {
        const datos = Object.keys(conteo).map(c => ({ name: c, value: conteo[c] }));
        const maximo = datos.reduce((a, d) => Math.max(a, d.value), 0);
        const nombreMapa = mapaFiltrado('municipios', seleccion.municipio);
        return {
          opcion: opcionMapa(nombreMapa, datos, maximo,
            n => (MUNI[n] ? MUNI[n].nombre + ' · ' + MUNI[n].departamento : n), 'codigo'),
          csv: () => ({
            encabezados: ['Código DANE', 'Municipio', 'Departamento', 'Estudiantes'],
            filas: Object.keys(conteo).map(c => [c,
              MUNI[c] ? MUNI[c].nombre : '', MUNI[c] ? MUNI[c].departamento : '',
              conteo[c]])
          }),
          // El mapa devuelve el código DANE, que es la categoría del núcleo.
          alSeleccionar: cod => { if (MUNI[cod]) alternar('municipio', cod); }
        };
      }
      const porDepto = {};
      Object.keys(conteo).forEach(c => {
        const d = MUNI[c] ? MUNI[c].departamento : 'Sin información';
        porDepto[d] = (porDepto[d] || 0) + conteo[c];
      });
      // Los departamentos sin correspondencia cartográfica, como el registro
      // «Extranjero», quedan fuera del mapa pero sí aparecen en la tabla.
      const datos = Object.keys(porDepto).map(d => ({
        name: llaveDepto(d), value: porDepto[d]
      }));
      const maximo = datos.reduce((a, d) => Math.max(a, d.value), 0);
      // El mapa devuelve la llave normalizada; se traduce al nombre del reporte.
      const desdeLlave = {};
      Object.keys(porDepto).forEach(d => { desdeLlave[llaveDepto(d)] = d; });
      const nombreDepto = mapaFiltrado('departamentos',
        (seleccion.departamento || []).map(llaveDepto));
      return {
        opcion: opcionMapa(nombreDepto, datos, maximo,
          n => desdeLlave[n] || n, 'llave'),
        csv: () => ({
          encabezados: ['Departamento', 'Estudiantes'],
          filas: Object.keys(porDepto).sort((a, b) => porDepto[b] - porDepto[a])
            .map(d => [d, porDepto[d]])
        }),
        alSeleccionar: llave => {
          const d = desdeLlave[llave];
          if (d) alternar('departamento', d);
        }
      };
    }
    if (spec.forma === 'apiladas' || spec.forma === 'participacion') {
      const r = Q.porPeriodo(spec);
      const vis = r.categorias.map((c, i) => i).filter(i => totalDe(r.matriz[i]) > 0);
      const esPct = spec.forma === 'participacion';
      const totales = PERIODOS.map((p, j) =>
        vis.reduce((a, i) => a + r.matriz[i][j], 0));
      const series = vis.map((i, k) => ({
        nombre: r.categorias[i], color: colorDe(spec.dim, r.categorias[i], k),
        datos: r.matriz[i].map((v, j) => (esPct ? (totales[j] ? 100 * v / totales[j] : null) : v))
      }));
      const filtrable = spec.origen === 'plan' || PROPIAS.indexOf(spec.dim) >= 0
        || DERIV_MUNI[spec.dim];
      return {
        opcion: esPct
          ? opcionApiladasPct(PERIODOS, series)
          : opcionApiladas(PERIODOS, series),
        csv: () => ({
          encabezados: ['Período'].concat(series.map(s => s.nombre)),
          filas: PERIODOS.map((p, j) => [p].concat(series.map(s => s.datos[j])))
        }),
        // En estos gráficos el eje son los períodos y las series las categorías:
        // el clic sobre el eje selecciona el período correspondiente.
        alSeleccionar: n => (PERIODOS.indexOf(n) >= 0
          ? alternar('periodo', n)
          : (filtrable ? alternar(spec.dim, n) : null))
      };
    }
    const r = Q.distribucion(spec);
    let idx = r.categorias.map((c, i) => i).filter(i => r.valores[i] > 0);
    if (spec.ordenar) idx.sort((a, b) => r.valores[b] - r.valores[a]);
    const cc = idx.map(i => r.categorias[i]);
    const vv = idx.map(i => r.valores[i]);
    const colores = spec.dim === 'nivel'
      ? cc.map(c => nivelColor(c))
      : cc.map((c, i) => colorDe(spec.dim, c, i));
    const sel = seleccion[spec.dim] || [];
    return {
      opcion: spec.forma === 'barrasH'
        ? opcionBarrasH(cc, vv, colores, sel)
        : opcionBarras(cc, vv, colores, sel),
      csv: () => ({
        encabezados: [etiquetaDim(spec.dim), 'Matrículas'],
        filas: cc.map((c, i) => [c, vv[i]])
      }),
      alSeleccionar: (spec.origen === 'plan' || PROPIAS.indexOf(spec.dim) >= 0
        || DERIV_MUNI[spec.dim]) ? (n => alternar(spec.dim, n)) : null,
      categorias: cc
    };
  };

  const hero = useMemo(() => construir(sec.hero), [sec.id, Q, hayMapas]);
  const apoyoA = useMemo(() => construir(sec.apoyoA), [sec.id, Q, hayMapas]);
  const apoyoB = useMemo(() => construir(sec.apoyoB), [sec.id, Q, hayMapas]);

  const medidas = (spec, r) => {
    if (!r || !r.categorias) return {};
    const n = r.categorias.length;
    if (spec.forma === 'barrasH') return n > 12 ? { altoLienzo: 60 + n * 26 } : {};
    if (spec.forma === 'barras') return n > 20 ? { ancho: 120 + n * 34 } : {};
    return {};
  };

  const departamentos = useMemo(() => {
    if (!sec.mapaConTabla) return { filas: [] };
    const r = Q.distribucion({ dim: 'departamento', origen: 'municipio' });
    const total = totalDe(r.valores);
    const filas = r.categorias.map((c, i) => ({
      cod: c, nombre: c, departamento: c, valor: r.valores[i],
      parte: total ? Math.round(1000 * r.valores[i] / total) / 10 : null
    }));
    return { filas: filas };
  }, [sec.id, Q]);

  const municipios = useMemo(() => {
    if (!sec.mapaConTabla) return { filas: [] };
    const conteo = Q.porMunicipio();
    const total = Object.keys(conteo).reduce((a, c) => a + conteo[c], 0);
    const filas = Object.keys(conteo)
      .sort((a, b) => conteo[b] - conteo[a])
      .map(c => ({
        cod: c,
        nombre: MUNI[c] ? MUNI[c].nombre : c,
        departamento: MUNI[c] ? MUNI[c].departamento : 'Sin información',
        valor: conteo[c],
        parte: total ? Math.round(1000 * conteo[c] / total) / 10 : null
      }));
    return { filas: filas, total: total };
  }, [sec.id, Q]);

  const tabla = useMemo(() => {
    const r = Q.porPeriodo(sec.tabla);
    const con = r.categorias.map((c, i) => i).filter(i => totalDe(r.matriz[i]) > 0);
    const orden = PERIODOS.map((p, j) => j).reverse();
    return {
      rotFila: etiquetaDim(sec.tabla.dim),
      filas: con.map(i => r.categorias[i]),
      columnas: orden.map(j => PERIODOS[j]),
      matriz: con.map(i => orden.map(j => r.matriz[i][j]))
    };
  }, [sec.id, Q]);

  /* --------------------------------------------------------------- KPI */
  const kpis = useMemo(() => {
    const g = {
      n: agg.n, primeras: agg.primeras, pbm: agg.pbm, edad: agg.edad,
      papa: agg.papa, planes: agg.planes, rango: agg.rango
    };
    if (sec.id === 'genero') {
      const r = Q.distribucion({ dim: 'genero' });
      g.mujer = parteDe(r.categorias, r.valores, 'Mujer');
      g.hombre = parteDe(r.categorias, r.valores, 'Hombre');
    } else if (sec.id === 'pbm') {
      const r = Q.distribucion({ dim: 'quintil' });
      const t = totalDe(r.valores);
      const bajos = ['Quintil 1', 'Quintil 2'].reduce((a, q) => {
        const i = r.categorias.indexOf(q);
        return a + (i < 0 ? 0 : r.valores[i]);
      }, 0);
      const sinDato = r.categorias.indexOf('Sin información');
      g.bajos = t ? 100 * bajos / (t - (sinDato < 0 ? 0 : r.valores[sinDato])) : null;
      g.dominante = mayor(r.categorias, r.valores);
    } else if (sec.id === 'acceso' || sec.id === 'admision') {
      const r = Q.distribucion({ dim: sec.id === 'acceso' ? 'acceso' : 'admision' });
      g.dominante = mayor(r.categorias, r.valores);
      g.participacion = totalDe(r.valores)
        ? 100 * g.dominante.valor / totalDe(r.valores) : null;
      g.categorias = r.categorias.filter((c, i) => r.valores[i] > 0).length;
    } else if (sec.id === 'conocimiento') {
      const r = Q.distribucion({ dim: 'areaConocimiento', origen: 'plan' });
      g.dominante = mayor(r.categorias, r.valores);
      g.participacion = totalDe(r.valores)
        ? 100 * g.dominante.valor / totalDe(r.valores) : null;
    } else if (sec.id === 'procedencia') {
      const conteo = Q.porMunicipio();
      const cods = Object.keys(conteo);
      const total = cods.reduce((a, c) => a + conteo[c], 0);
      const porDepto = {};
      let antioquia = 0, medellin = 0;
      cods.forEach(c => {
        const m = MUNI[c];
        const d = m ? m.departamento : 'Sin información';
        porDepto[d] = (porDepto[d] || 0) + conteo[c];
        if (m && normalizar(m.departamento) === 'ANTIOQUIA') antioquia += conteo[c];
        if (c === '05001') medellin += conteo[c];
      });
      g.municipios = cods.length;
      g.departamentos = Object.keys(porDepto).length;
      g.antioquia = total ? 100 * antioquia / total : null;
      g.medellin = total ? 100 * medellin / total : null;
    }
    return g;
  }, [sec.id, Q]);

  const tarjetas = () => {
    const base = [
      [IC.doc, 'var(--dsh-primary)', 'Matrículas', num(kpis.n), kpis.rango],
      [IC.persona, 'var(--dsh-azul)', 'Primeras matrículas', num(kpis.primeras),
        'Estudiantes que ingresan']
    ];
    if (sec.id === 'genero') {
      return base.concat([
        [IC.persona, 'var(--dsh-aprobada)', 'Participación de mujeres', pct(kpis.mujer), 'Del total'],
        [IC.persona, 'var(--dsh-cancelada)', 'Participación de hombres', pct(kpis.hombre), 'Del total'],
        [IC.reloj, 'var(--dsh-verde)', 'Edad promedio',
          vacio(kpis.edad) ? '—' : Math.round(kpis.edad) + ' años', 'En el período cursado']
      ]);
    }
    if (sec.id === 'pbm') {
      return base.concat([
        [IC.tasa, 'var(--dsh-aprobada)', 'PBM promedio', dec(kpis.pbm), 'Escala de 0 a 100'],
        [IC.malla, 'var(--dsh-reprobada)', 'Quintiles 1 y 2', pct(kpis.bajos),
          'Del total con puntaje asignado'],
        [IC.cinta, 'var(--dsh-cancelada)', 'Quintil más frecuente',
          kpis.dominante ? kpis.dominante.etiqueta : '—', num(kpis.dominante && kpis.dominante.valor)]
      ]);
    }
    if (sec.id === 'acceso' || sec.id === 'admision') {
      return base.concat([
        [IC.cinta, 'var(--dsh-aprobada)', 'Categoría más frecuente', pct(kpis.participacion),
          kpis.dominante ? kpis.dominante.etiqueta : '—'],
        [IC.malla, 'var(--dsh-verde)', 'Categorías con registros', num(kpis.categorias),
          'En la selección vigente'],
        [IC.reloj, 'var(--dsh-cancelada)', 'Promedio académico', dec(kpis.papa, 2),
          kpis.rango]
      ]);
    }
    if (sec.id === 'conocimiento') {
      return base.concat([
        [IC.libro, 'var(--dsh-aprobada)', 'Área con mayor participación', pct(kpis.participacion),
          kpis.dominante ? kpis.dominante.etiqueta : '—'],
        [IC.malla, 'var(--dsh-verde)', 'Planes de estudio', num(kpis.planes), 'En la selección'],
        [IC.reloj, 'var(--dsh-cancelada)', 'Promedio académico', dec(kpis.papa, 2),
          kpis.rango]
      ]);
    }
    if (sec.id === 'procedencia') {
      return base.concat([
        [IC.mapa, 'var(--dsh-aprobada)', 'Municipios de procedencia', num(kpis.municipios),
          num(kpis.departamentos) + ' departamentos'],
        [IC.malla, 'var(--dsh-verde)', 'Procedencia de Antioquia', pct(kpis.antioquia), 'Del total'],
        [IC.cinta, 'var(--dsh-cancelada)', 'Procedencia de Medellín', pct(kpis.medellin), 'Del total']
      ]);
    }
    return base.concat([
      [IC.malla, 'var(--dsh-verde)', 'Planes de estudio', num(kpis.planes), 'En la selección'],
      [IC.tasa, 'var(--dsh-aprobada)', 'PBM promedio', dec(kpis.pbm), 'Escala de 0 a 100'],
      [IC.reloj, 'var(--dsh-cancelada)', 'Promedio académico', dec(kpis.papa, 2), kpis.rango]
    ]);
  };

  const arch = [sec.id];

  return (
    <React.Fragment>
      <section className="dsh-kpis" aria-label="Indicadores">
        {tarjetas().map((t, i) => (
          <Kpi key={i} icono={t[0]} fondo={t[1]} etiqueta={t[2]} valor={t[3]} pie={t[4]} />
        ))}
      </section>

      <div className={'dsh-mosaico ' + (sec.mapaConTabla ? 'dsh-mosaico-2' : 'dsh-mosaico-1')}>
        <TarjetaGrafico titulo={sec.hero.titulo}
          alto={sec.hero.tipo === 'mapa' ? 'mapa'
            : sec.hero.forma === 'barrasH' ? 'medio' : 'hero'}
          opcion={hero.opcion} csv={hero.csv} alSeleccionar={hero.alSeleccionar}
          centrable={sec.hero.tipo === 'mapa'}
          {...medidas(sec.hero, hero)}
          archivo={nombreArchivo(arch.concat([sec.hero.dim || sec.hero.tipo]))} />
        {sec.mapaConTabla ? (
          <Tarjeta titulo="Estudiantes por municipio"
            accion={
              <Descargas
                csv={() => ({
                  encabezados: ['Municipio', 'Departamento', 'Estudiantes', 'Participación'],
                  filas: municipios.filas.map(m =>
                    [m.nombre, m.departamento, m.valor, m.parte])
                })}
                nombre={nombreArchivo(arch.concat(['municipios']))} />
            }>
            <TablaRanking filas={municipios.filas}
              alSeleccionar={cod => alternar('municipio', cod)} />
          </Tarjeta>
        ) : null}
      </div>

      <div className="dsh-mosaico dsh-mosaico-2">
        <TarjetaGrafico titulo={sec.apoyoA.titulo}
          alto={sec.apoyoA.tipo === 'mapaDepto' ? 'mapa' : ''}
          opcion={apoyoA.opcion} csv={apoyoA.csv} alSeleccionar={apoyoA.alSeleccionar}
          centrable={sec.apoyoA.tipo === 'mapaDepto'}
          {...medidas(sec.apoyoA, apoyoA)}
          archivo={nombreArchivo(arch.concat([sec.apoyoA.dim || sec.apoyoA.tipo, 'a']))} />
        {sec.apoyoB.tipo === 'tablaDepto' ? (
          <Tarjeta titulo={sec.apoyoB.titulo}
            accion={
              <Descargas
                csv={() => ({
                  encabezados: ['Departamento', 'Estudiantes', 'Participación'],
                  filas: departamentos.filas.map(d => [d.nombre, d.valor, d.parte])
                })}
                nombre={nombreArchivo(arch.concat(['departamentos']))} />
            }>
            <TablaRanking filas={departamentos.filas} rotulos={['Departamento']}
              alSeleccionar={d => alternar('departamento', d)} />
          </Tarjeta>
        ) : (
          <TarjetaGrafico titulo={sec.apoyoB.titulo}
            opcion={apoyoB.opcion} csv={apoyoB.csv} alSeleccionar={apoyoB.alSeleccionar}
            {...medidas(sec.apoyoB, apoyoB)}
            archivo={nombreArchivo(arch.concat([sec.apoyoB.dim || 'b']))} />
        )}
      </div>

      <div className="dsh-mosaico dsh-mosaico-1">
        <Tarjeta titulo={sec.tabla.titulo}
          accion={
            <Descargas
              csv={() => ({
                encabezados: [tabla.rotFila].concat(tabla.columnas).concat(['Total']),
                filas: tabla.filas.map((f, i) =>
                  [f].concat(tabla.matriz[i]).concat([totalDe(tabla.matriz[i])]))
              })}
              nombre={nombreArchivo(arch.concat(['detalle']))} />
          }>
          <TablaMatriz rotFila={tabla.rotFila} filas={tabla.filas}
            columnas={tabla.columnas} matriz={tabla.matriz} descendente />
        </Tarjeta>
      </div>
    </React.Fragment>
  );
}

/* ==================================================================== */
/*  Aplicación                                                           */
/* ==================================================================== */

function App() {
  const [tab, setTab] = useState(0);
  const sec = SECCIONES[tab];
  const [seleccion, setSeleccion] = useState({});
  const refsTab = useRef([]);
  const firma = JSON.stringify(seleccion);
  const Q = useMemo(() => crearConsulta(seleccion), [firma]);

  const fijar = useCallback((dim, valores) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      if (!valores || !valores.length) delete n[dim];
      else n[dim] = valores;
      return n;
    });
  }, []);

  const alternar = useCallback((dim, categoria) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      const actual = (n[dim] || []).slice();
      const i = actual.indexOf(categoria);
      if (i >= 0) actual.splice(i, 1); else actual.push(categoria);
      if (!actual.length) delete n[dim];
      else n[dim] = actual;
      return n;
    });
  }, []);

  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  return (
    <React.Fragment>
      <div className="dsh-tabs" role="tablist" aria-label="Secciones del tablero">
        {SECCIONES.map((p, i) => (
          <button key={p.id} ref={el => (refsTab.current[i] = el)}
            className="dsh-tab" role="tab" id={'tab-' + p.id}
            aria-controls={'panel-' + p.id} aria-selected={i === tab}
            onClick={() => setTab(i)} onKeyDown={e => teclas(e, i)}>
            {p.rotulo}
          </button>
        ))}
      </div>

      {sec.definicion ? <Definicion def={DEF.secciones[sec.id]} /> : null}

      <Filtros seleccion={seleccion} fijar={fijar} limpiar={() => setSeleccion({})} Q={Q} />

      <Seleccion seleccion={seleccion} quitar={alternar} limpiar={() => setSeleccion({})} />

      <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
        <Panel key={sec.id} sec={sec} seleccion={seleccion} alternar={alternar} Q={Q} />
      </div>

      <p className="dsh-nota">{DEF.nota}</p>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
