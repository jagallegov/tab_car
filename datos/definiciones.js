/* Diccionario de textos, rótulos y colores del tablero de caracterización
   estudiantil.

   Marco normativo: Acuerdo 008 de 2008 del Consejo Superior Universitario,
   Estatuto Estudiantil en sus disposiciones académicas.
   Fuente de los datos: Dirección Nacional de Información Académica, Registro y
   Matrícula (DINARA).
*/
window.CAR = window.CAR || {};

window.CAR.definiciones = {

  secciones: {
    "matricula": {
      "titulo": "Caracterización estudiantil"
    },
    "genero": {
      "titulo": "Género"
    },
    "pbm": {
      "titulo": "Puntaje básico de matrícula"
    },
    "acceso": {
      "titulo": "Tipo de estudiante"
    },
    "admision": {
      "titulo": "Tipo de admisión"
    },
    "conocimiento": {
      "titulo": "Área de conocimiento"
    },
    "procedencia": {
      "titulo": "Lugar de procedencia"
    }
  },

  dimensiones: {
    "periodo": {
      "etiqueta": "Período académico",
      "corto": "Período"
    },
    "apertura": {
      "etiqueta": "Período de apertura",
      "corto": "Apertura"
    },
    "modalidad": {
      "etiqueta": "Nivel académico",
      "corto": "Nivel académico"
    },
    "facultad": {
      "etiqueta": "Facultad",
      "corto": "Facultad"
    },
    "areaCurricular": {
      "etiqueta": "Área curricular",
      "corto": "Área curricular"
    },
    "uab": {
      "etiqueta": "Unidad académica básica",
      "corto": "UAB"
    },
    "programa": {
      "etiqueta": "Programa curricular",
      "corto": "Programa"
    },
    "nivel": {
      "etiqueta": "Nivel de formación",
      "corto": "Nivel de formación"
    },
    "areaConocimiento": {
      "etiqueta": "Área de conocimiento",
      "corto": "Área"
    },
    "genero": {
      "etiqueta": "Género",
      "corto": "Género"
    },
    "quintil": {
      "etiqueta": "Quintil del puntaje básico de matrícula",
      "corto": "Quintil"
    },
    "acceso": {
      "etiqueta": "Tipo de estudiante",
      "corto": "Tipo de estudiante"
    },
    "admision": {
      "etiqueta": "Tipo de admisión",
      "corto": "Admisión"
    },
    "estrato": {
      "etiqueta": "Estrato socioeconómico",
      "corto": "Estrato"
    },
    "colegio": {
      "etiqueta": "Tipo de colegio",
      "corto": "Colegio"
    },
    "nivelacion": {
      "etiqueta": "Condición de nivelación",
      "corto": "Nivelación"
    },
    "municipio": {
      "etiqueta": "Municipio de procedencia",
      "corto": "Municipio"
    },
    "departamento": {
      "etiqueta": "Departamento de procedencia",
      "corto": "Departamento"
    },
    "ruralidad": {
      "etiqueta": "Categoría de ruralidad",
      "corto": "Ruralidad"
    },
    "pdet": {
      "etiqueta": "Municipio PDET",
      "corto": "PDET"
    }
  },

  niveles: {
    "Pregrado": {
      "nombre": "Pregrado",
      "color": "#677d29"
    },
    "Tecnología": {
      "nombre": "Tecnología",
      "color": "#87a436"
    },
    "Especializacion": {
      "nombre": "Especialización",
      "color": "#289a64"
    },
    "Especialización": {
      "nombre": "Especialización",
      "color": "#289a64"
    },
    "Maestria": {
      "nombre": "Maestría",
      "color": "#2ba6cb"
    },
    "Maestría": {
      "nombre": "Maestría",
      "color": "#2ba6cb"
    },
    "Doctorado": {
      "nombre": "Doctorado",
      "color": "#d49d00"
    }
  },

  /* Tramos del mapa. La distribución está muy concentrada en Medellín, de modo
     que una escala continua dejaría al resto del país en el tono más claro. */
  tramosMapa: [
    { max: 9, color: '#c9dc8f', rotulo: '1 a 9' },
    { min: 10, max: 49, color: '#9dbf58', rotulo: '10 a 49' },
    { min: 50, max: 199, color: '#7ba32f', rotulo: '50 a 199' },
    { min: 200, max: 999, color: '#5c7f22', rotulo: '200 a 999' },
    { min: 1000, color: '#3f5a15', rotulo: '1.000 o más' }
  ],

  colores: {
    "genero": {
      "Mujer": "#677d29",
      "Hombre": "#a2a3a4",
      "Sin información": "#d4d5d6"
    }
  },

  paleta: ['#677d29','#2ba6cb','#d49d00','#289a64','#4fc5e9','#d40f00','#87a436','#3d4041','#a2a3a4','#c9dc8f'],

  escalaMapa: ['#f4fddd','#d7e6a8','#b0cc6a','#87a436','#677d29','#4a5c1d'],

  nota: 'Fuente: Sistema de Información Académico (SIA). Cálculos propios.'
};
