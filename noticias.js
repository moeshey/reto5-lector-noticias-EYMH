/* ==========================================================================
   ARCHIVO: noticias.js
   RETO 5 – Lector de noticias con Fetch y JSON
   Alumna: Esperanza Yehtenne Monroy Heras
   --------------------------------------------------------------------------
   Este archivo es la FUNCIONALIDAD. Su trabajo, en orden, es:
     1) Pedir las noticias a la API de GNews con fetch() (AJAX).
     2) Convertir la respuesta de texto JSON a objetos de JavaScript.
     3) Limpiar y validar cada noticia.
     4) Dibujar una tarjeta por noticia dentro del área #area-noticias.
     5) Manejar los errores (sin clave, sin internet, límite, sin noticias...).
     6) Reaccionar a los clics: actualizar, cambiar de categoría, filtrar y
        abrir la noticia completa.
   Organización del código (cada sección tiene su propio título):
     A. Configuración   B. Elementos del HTML   C. Estado   D. Errores
     E. Funciones de datos (Fetch + JSON)   F. Funciones de pantalla
     G. Función principal   H. Eventos
   ========================================================================== */

"use strict"; // modo estricto: el navegador avisa de errores de programación comunes


/* ==========================================================================
   A. CONFIGURACIÓN
   Valores fijos que se pueden cambiar en un solo lugar.
   ========================================================================== */

// Dirección (endpoint) de GNews para pedir los titulares principales
const URL_BASE = "https://gnews.io/api/v4/top-headlines";

// Mi clave de GNews: va ENTRE LAS COMILLAS de la línea de abajo y con ella la página muestra
// noticias reales sin configurar nada. Si se deja vacía, la app lo avisa y se puede escribir en la página.
const CLAVE_API = "b69c52c239c84d29f28bc559a0eaf6b3";

const IDIOMA = "es";              // lang=es: noticias en español
const PAIS = "mx";                // country=mx: noticias de México
const MAXIMO_NOTICIAS = 10;       // max=10: cuántas noticias se piden cada vez
const TIEMPO_ESPERA_MS = 10000;   // si la API tarda más de 10 segundos, se cancela la petición
const NOMBRE_ALMACEN = "claveGNews"; // nombre con el que se guarda la clave en el navegador


/* ==========================================================================
   B. ELEMENTOS DEL HTML
   document.querySelector("#id") busca UN elemento por su id y lo guarda en una
   constante para usarlo después sin buscarlo otra vez.
   ========================================================================== */

const selectCategoria = document.querySelector("#categoria");        // lista de categorías
const selectFuente = document.querySelector("#fuente");              // GNews o demostración
const campoFiltro = document.querySelector("#filtro");               // campo de búsqueda local
const botonRefrescar = document.querySelector("#btn-refrescar");     // botón "Actualizar noticias"
const iconoRefrescar = botonRefrescar.querySelector(".icono");       // icono ↻ dentro del botón
const formClave = document.querySelector("#form-clave");             // formulario de la clave
const campoClave = document.querySelector("#clave");                 // campo donde se escribe la clave
const mensajeClave = document.querySelector("#mensaje-clave");       // texto de confirmación de la clave
const infoActualizacion = document.querySelector("#info-actualizacion"); // "Última actualización..."
const aviso = document.querySelector("#aviso");                      // banner de error pequeño
const panelEstado = document.querySelector("#estado");               // panel grande de estado
const estadoIcono = document.querySelector("#estado-icono");         // símbolo del panel
const estadoTitulo = document.querySelector("#estado-titulo");       // título del panel
const estadoMensaje = document.querySelector("#estado-mensaje");     // mensaje del panel
const botonReintentar = document.querySelector("#btn-reintentar");   // botón "Reintentar"
const botonDemo = document.querySelector("#btn-demo");               // botón "Ver noticias de ejemplo"
const areaNoticias = document.querySelector("#area-noticias");       // ¡aquí se muestran las noticias!
const ventanaDetalle = document.querySelector("#detalle");           // <dialog> de la noticia completa
const botonCerrar = document.querySelector("#btn-cerrar");           // botón ✕ de la ventana
const detalleFigura = document.querySelector("#detalle-figura");     // contenedor de la imagen
const detalleImagen = document.querySelector("#detalle-imagen");     // imagen de la noticia
const detalleMeta = document.querySelector("#detalle-meta");         // fuente y fecha
const detalleTitulo = document.querySelector("#detalle-titulo");     // título completo
const detalleDescripcion = document.querySelector("#detalle-descripcion"); // descripción
const detalleTexto = document.querySelector("#detalle-texto");       // fragmento del contenido
const detalleEnlace = document.querySelector("#detalle-enlace");     // enlace a la noticia original


/* ==========================================================================
   C. ESTADO
   Variables que recuerdan qué está pasando en la aplicación.
   ========================================================================== */

let noticias = [];          // lista de noticias ya limpias que se muestran en pantalla
let cargando = false;       // true mientras hay una petición en curso (evita pedir dos veces a la vez)
let avisoPlan = "";         // texto sobre el plan de GNews (por ejemplo, el retraso de 12 horas del plan gratuito)
let claveEnMemoria = "";    // respaldo de la clave si el navegador no deja guardarla


/* ==========================================================================
   D. ERRORES
   ErrorNoticias es un error propio: además del mensaje trae un "tipo" para
   saber qué le pasó a la petición y mostrar el texto adecuado.
   ========================================================================== */

class ErrorNoticias extends Error {            // "extends Error": hereda todo lo de un error normal
  constructor(tipo, mensaje) {                 // se ejecuta al crear el error con new ErrorNoticias(...)
    super(mensaje);                            // super() llama al constructor de Error y guarda el mensaje
    this.name = "ErrorNoticias";               // nombre del error (aparece en la consola)
    this.tipo = tipo;                          // tipo de problema: "red", "limite", "vacio", etc.
  }
}

// Textos que se muestran a la persona según el tipo de error.
// icono: símbolo; ofrecerDemo: si tiene sentido proponer las noticias de ejemplo.
const MENSAJES = {
  "sin-clave": {
    icono: "🔑", titulo: "Falta tu clave de GNews", clase: "estado-info", ofrecerDemo: true,
    texto: "Para ver noticias reales necesitas una clave gratuita. Regístrate en gnews.io, abre la sección \"Configurar mi clave de GNews\" y pégala ahí. Mientras tanto puedes ver noticias de ejemplo."
  },
  "clave-invalida": {
    icono: "⚠", titulo: "La clave no es válida", clase: "estado-error", ofrecerDemo: true,
    texto: "GNews rechazó la clave. Revisa que esté copiada completa, sin espacios, y vuelve a guardarla."
  },
  "limite": {
    icono: "⚠", titulo: "Se alcanzó el límite de peticiones", clase: "estado-error", ofrecerDemo: true,
    texto: "GNews limita cuántas veces se puede consultar con la cuenta gratuita, o la clave no tiene permiso para esta consulta. Espera un poco (o hasta mañana) e inténtalo de nuevo."
  },
  "servidor": {
    icono: "⚠", titulo: "El servicio de noticias no está disponible", clase: "estado-error", ofrecerDemo: true,
    texto: "El servidor de GNews tuvo un problema. No es un error de tu computadora; intenta de nuevo en unos minutos."
  },
  "red": {
    icono: "⚠", titulo: "No se pudo conectar", clase: "estado-error", ofrecerDemo: true,
    texto: "No hubo respuesta de GNews. Revisa tu conexión a internet. Si abriste el archivo haciendo doble clic, prueba abrirlo con un servidor local (por ejemplo, la extensión Live Server de VS Code), porque algunos navegadores bloquean la petición."
  },
  "tiempo": {
    icono: "⏱", titulo: "La respuesta tardó demasiado", clase: "estado-error", ofrecerDemo: true,
    texto: "GNews no respondió en 10 segundos y la petición se canceló. Intenta de nuevo."
  },
  "formato": {
    icono: "⚠", titulo: "La respuesta no se pudo leer", clase: "estado-error", ofrecerDemo: true,
    texto: "GNews respondió, pero los datos no llegaron en el formato JSON esperado."
  },
  "http": {
    icono: "⚠", titulo: "La petición no se pudo completar", clase: "estado-error", ofrecerDemo: true,
    texto: "GNews devolvió un error inesperado. Intenta de nuevo."
  },
  "vacio": {
    icono: "📭", titulo: "No hay noticias disponibles", clase: "estado-info", ofrecerDemo: false,
    texto: "La consulta funcionó, pero no devolvió noticias para esta categoría. Prueba con otra categoría o actualiza más tarde."
  },
  "inesperado": {
    icono: "⚠", titulo: "Ocurrió un error inesperado", clase: "estado-error", ofrecerDemo: false,
    texto: "Algo salió mal en la aplicación. Intenta actualizar de nuevo."
  }
};


/* ==========================================================================
   E. FUNCIONES DE DATOS (Fetch + JSON)
   ========================================================================== */

/* ---- Clave de la API ---------------------------------------------------- */

// Devuelve la clave a usar: primero la del código, luego la guardada, luego la de memoria
function obtenerClave() {
  if (CLAVE_API) return CLAVE_API;             // si pegué la clave en el código, se usa esa
  try {                                        // try/catch: localStorage puede estar bloqueado en algunos navegadores
    return localStorage.getItem(NOMBRE_ALMACEN) || claveEnMemoria; // clave guardada o la de memoria
  } catch (error) {
    return claveEnMemoria;                     // si falla el almacenamiento, uso la de memoria
  }
}

// Guarda la clave en el navegador (o en memoria si no se puede)
function guardarClave(clave) {
  claveEnMemoria = clave;                      // siempre la dejo también en memoria
  try {
    if (clave) localStorage.setItem(NOMBRE_ALMACEN, clave);   // guarda la clave
    else localStorage.removeItem(NOMBRE_ALMACEN);             // si está vacía, la borra
  } catch (error) {
    // Si el navegador no permite guardar, no pasa nada: la clave sigue en memoria
  }
}

/* ---- Construcción de la dirección -------------------------------------- */

// Arma la URL completa con sus parámetros, por ejemplo:
// https://gnews.io/api/v4/top-headlines?category=general&lang=es&country=mx&max=10&apikey=...
function construirUrl(categoria, clave) {
  const parametros = new URLSearchParams({     // URLSearchParams arma y codifica los parámetros por mí
    category: categoria,                       // categoría elegida
    lang: IDIOMA,                              // idioma
    country: PAIS,                             // país
    max: String(MAXIMO_NOTICIAS),              // cantidad de noticias (los parámetros van como texto)
    apikey: clave                              // mi clave personal
  });
  return `${URL_BASE}?${parametros.toString()}`; // une la dirección base con los parámetros
}

/* ---- Traducción de códigos HTTP a mi tipo de error ---------------------- */

function errorPorEstado(codigo, detalle) {
  let tipo = "http";                                          // por defecto: otro código inesperado
  if (codigo === 401) tipo = "clave-invalida";                // no autorizado: clave mala
  else if (codigo === 403 || codigo === 429) tipo = "limite"; // sin permiso o demasiadas peticiones
  else if (codigo >= 500) tipo = "servidor";                  // falla del servidor
  const error = new ErrorNoticias(tipo, `HTTP ${codigo}`);    // creo el error con su tipo
  error.estado = codigo;                                      // guardo el código HTTP para mostrarlo en pantalla
  error.detalle = detalle || "";                              // guardo lo que explicó GNews (si dijo algo)
  return error;
}

/* ---- PETICIÓN PRINCIPAL CON FETCH --------------------------------------- */

// async: la función trabaja de forma asíncrona (puede "esperar" sin congelar la página)
async function pedirNoticias(categoria) {
  const clave = obtenerClave();                // obtengo la clave guardada
  if (!clave) {                                // si no hay clave, no tiene caso hacer la petición
    throw new ErrorNoticias("sin-clave", "No hay clave de API");
  }

  const url = construirUrl(categoria, clave);  // armo la dirección completa

  // AbortController permite cancelar la petición si tarda demasiado
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS); // a los 10 s cancela

  let respuesta;                               // aquí guardaré el objeto Response
  try {
    // fetch() hace la petición HTTP. await espera la respuesta sin bloquear la página.
    // signal conecta la petición con el controlador para poder cancelarla.
    respuesta = await fetch(url, { signal: controlador.signal });
  } catch (error) {
    // fetch solo lanza error si falla la red o si se cancela (no por un 404 o 500)
    if (error.name === "AbortError") {         // se canceló por el tiempo de espera
      throw new ErrorNoticias("tiempo", "Tiempo de espera agotado");
    }
    throw new ErrorNoticias("red", "Falla de red");
  } finally {
    clearTimeout(temporizador);                // limpio el temporizador, haya salido bien o mal
  }

  // response.ok es true si el código HTTP está entre 200 y 299.
  // Si no lo es, aunque fetch no haya fallado, la respuesta es un error.
  if (!respuesta.ok) {
    let detalle = "";                          // aquí guardo la explicación que da GNews
    try {
      const cuerpoError = await respuesta.json();            // GNews suele explicar el error en un JSON
      detalle = JSON.stringify(cuerpoError.errors || cuerpoError.error || cuerpoError).slice(0, 200); // máximo 200 caracteres
    } catch (error) {
      // si el cuerpo no es JSON, no pasa nada: me quedo solo con el código
    }
    throw errorPorEstado(respuesta.status, detalle);         // respuesta.status es el código (400, 401, 429, 500...)
  }

  let datos;                                   // aquí quedará el objeto JavaScript
  try {
    datos = await respuesta.json();            // .json() lee el cuerpo y lo convierte de texto JSON a objeto
  } catch (error) {
    throw new ErrorNoticias("formato", "El cuerpo no es JSON válido"); // si no era JSON válido
  }

  // Compruebo que el JSON tenga la forma esperada: un objeto con la lista "articles"
  if (!datos || !Array.isArray(datos.articles)) {
    throw new ErrorNoticias("formato", "Falta la lista articles");
  }

  // GNews agrega un objeto "information" cuando el plan es gratuito: lo aprovecho para avisar del retraso
  avisoPlan = (datos.information && datos.information.realTimeArticles)
    ? " · Plan gratuito de GNews: las noticias pueden tener hasta 12 horas de retraso"
    : "";

  return datos.articles;                       // devuelvo solo la lista de artículos
}

/* ---- MODO DEMOSTRACIÓN (sin internet) ------------------------------------
   Estas noticias son de EJEMPLO, no reales. Tienen la misma forma (JSON) que
   las de GNews, así el resto del programa las procesa igual. Sirven para
   probar la página sin clave y sin conexión. */

// Función que fabrica una fecha de hace "horas" horas, en el formato ISO que usa GNews
function haceHoras(horas) {
  return new Date(Date.now() - horas * 3600000).toISOString(); // Date.now() son milisegundos; 3600000 ms = 1 hora
}

// Lista de noticias de ejemplo; "categoria" solo se usa para filtrar en este modo
function crearDatosDemo() {
  return [
    { categoria: "technology", title: "Ejemplo: Fetch permite pedir datos sin recargar la página", description: "Noticia de demostración. La API Fetch devuelve una promesa con la respuesta del servidor, y así la página se actualiza sin recargarse.", content: "Noticia de demostración. Con fetch() la página pide datos en segundo plano y, cuando llegan, JavaScript los muestra donde corresponde. Es la base de las aplicaciones web que se actualizan solas.", url: "https://developer.mozilla.org/es/docs/Web/API/Fetch_API", image: "", publishedAt: haceHoras(1), source: { name: "Demostración" } },
    { categoria: "technology", title: "Ejemplo: JSON, el formato favorito para intercambiar datos", description: "Noticia de demostración. JSON representa objetos, listas, números y textos de forma sencilla y legible.", content: "Noticia de demostración. Las APIs de noticias suelen responder en JSON; JavaScript lo convierte en objetos con JSON.parse o con el método json() de la respuesta.", url: "https://developer.mozilla.org/es/docs/Web/JavaScript/Referencia/Objetos_globales/JSON", image: "", publishedAt: haceHoras(2), source: { name: "Demostración" } },
    { categoria: "technology", title: "Ejemplo: La ventana nativa <dialog> simplifica las pantallas emergentes", description: "Noticia de demostración. El elemento dialog abre ventanas modales sin librerías externas.", content: "", url: "https://developer.mozilla.org/es/docs/Web/HTML/Elemento/dialog", image: "", publishedAt: haceHoras(3), source: { name: "Demostración" } },
    { categoria: "world", title: "Ejemplo: Escuelas de varios países comparten su biblioteca digital", description: "Noticia ficticia de demostración sobre cooperación educativa entre escuelas.", content: "Noticia ficticia de demostración. No corresponde a un hecho real; sirve para probar la sección Mundo.", url: "", image: "", publishedAt: haceHoras(5), source: { name: "Demostración" } },
    { categoria: "nation", title: "Ejemplo: Una universidad virtual estrena su nuevo campus en línea", description: "Noticia ficticia de demostración para probar la categoría Nacional.", content: "", url: "", image: "", publishedAt: haceHoras(6), source: { name: "Demostración" } },
    { categoria: "business", title: "Ejemplo: Crece el interés por aprender a programar en línea", description: "Noticia ficticia de demostración para probar la categoría Negocios.", content: "Noticia ficticia de demostración. Sirve para ver cómo se muestra un texto un poco más largo dentro de la ventana de detalle.", url: "", image: "", publishedAt: haceHoras(8), source: { name: "Demostración" } },
    { categoria: "entertainment", title: "Ejemplo: Un festival de cine estudiantil abre su convocatoria", description: "Noticia ficticia de demostración para probar la categoría Entretenimiento.", content: "", url: "", image: "", publishedAt: haceHoras(10), source: { name: "Demostración" } },
    { categoria: "sports", title: "Ejemplo: Torneo universitario de ajedrez reúne a cientos de participantes", description: "Noticia ficticia de demostración para probar la categoría Deportes.", content: "", url: "", image: "", publishedAt: haceHoras(12), source: { name: "Demostración" } },
    { categoria: "science", title: "Ejemplo: Estudiantes presentan un proyecto de ciencia de datos", description: "Noticia ficticia de demostración para probar la categoría Ciencia.", content: "", url: "", image: "", publishedAt: haceHoras(14), source: { name: "Demostración" } },
    { categoria: "health", title: "Ejemplo: Consejos para descansar la vista al trabajar con pantallas", description: "Noticia ficticia de demostración para probar la categoría Salud.", content: "", url: "", image: "", publishedAt: haceHoras(16), source: { name: "Demostración" } }
  ];
}

// Imita a pedirNoticias(): espera un momento (como si viajara por internet) y devuelve la lista
function pedirNoticiasDemo(categoria) {
  return new Promise((resolver) => {           // Promise: promete devolver un valor más adelante
    setTimeout(() => {                         // espera 700 ms para que se vea la carga
      const todas = crearDatosDemo();          // fabrica las noticias de ejemplo
      // "general" muestra todas; las demás categorías, solo las suyas
      resolver(categoria === "general" ? todas : todas.filter((n) => n.categoria === categoria));
    }, 700);
  });
}

/* ---- Limpieza y validación del JSON ------------------------------------- */

// Acepta una dirección solo si es http o https (evita enlaces peligrosos como javascript:)
function urlSegura(valor) {
  if (typeof valor !== "string" || valor.trim() === "") return ""; // si no es texto o está vacío
  try {
    const direccion = new URL(valor);          // new URL() lanza error si el texto no es una dirección válida
    return (direccion.protocol === "http:" || direccion.protocol === "https:") ? direccion.href : "";
  } catch (error) {
    return "";                                 // dirección inválida: la descarto
  }
}

// Devuelve el texto limpio, o "" si el dato no es texto
function limpiarTexto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

// Convierte UN artículo del JSON en un objeto más simple y seguro para la página.
// Devuelve null si el artículo no sirve (por ejemplo, no tiene título).
function normalizarNoticia(articulo, indice) {
  if (!articulo || limpiarTexto(articulo.title) === "") return null; // sin título no se muestra

  const fuente = articulo.source && limpiarTexto(articulo.source.name) // la fuente es un objeto dentro del artículo
    ? limpiarTexto(articulo.source.name)
    : "Fuente desconocida";                    // valor por defecto si falta

  return {
    id: "n" + indice,                          // identificador propio, p. ej. "n0", "n1"
    titulo: limpiarTexto(articulo.title),
    descripcion: limpiarTexto(articulo.description),
    contenido: limpiarTexto(articulo.content),
    url: urlSegura(articulo.url),
    imagen: urlSegura(articulo.image),
    fecha: limpiarTexto(articulo.publishedAt), // fecha en texto ISO, por ejemplo 2026-10-15T19:38:25Z
    fuente: fuente
  };
}


/* ==========================================================================
   F. FUNCIONES DE PANTALLA
   ========================================================================== */

/* ---- Utilidades --------------------------------------------------------- */

// Crea un elemento HTML con clase y texto. Uso textContent (no innerHTML) para que
// el texto de la API NUNCA se interprete como código HTML (evita inyección de código).
function crearElemento(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta); // crea la etiqueta, por ejemplo <p>
  if (clase) elemento.className = clase;       // le asigna la clase CSS
  if (texto) elemento.textContent = texto;     // le pone el texto (como texto plano)
  return elemento;
}

// Convierte la fecha ISO en texto legible en español, p. ej. "15 de octubre de 2026, 13:38"
function formatearFecha(textoIso) {
  const fecha = new Date(textoIso);            // convierte el texto en objeto Date
  if (isNaN(fecha.getTime())) return "Fecha no disponible"; // si la fecha es inválida
  return fecha.toLocaleDateString("es-MX", {   // toLocaleDateString da el formato según el idioma
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// Quita acentos y mayúsculas para que al buscar "tecnologia" también encuentre "Tecnología"
function simplificar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* ---- Estados de la interfaz --------------------------------------------- */

function ocultarAviso() { aviso.hidden = true; aviso.textContent = ""; }   // esconde el banner
function ocultarEstado() { panelEstado.hidden = true; }                    // esconde el panel

// Muestra el panel grande según el tipo de error
function mostrarEstado(tipo, error) {
  const datos = MENSAJES[tipo] || MENSAJES["inesperado"];   // si el tipo no existe, uso el genérico
  panelEstado.className = "estado " + datos.clase;          // aplica la clase de color (info o error)
  estadoIcono.textContent = datos.icono;                    // símbolo
  estadoTitulo.textContent = datos.titulo;                  // título
  estadoMensaje.textContent = datos.texto;                  // mensaje
  if (error && error.estado) {                              // si el error vino de un código HTTP, lo muestro para poder diagnosticar
    estadoMensaje.textContent += ` (Código HTTP ${error.estado}${error.detalle ? ". GNews dice: " + error.detalle : ""})`;
  }
  botonDemo.hidden = !datos.ofrecerDemo || selectFuente.value === "demo"; // botón de ejemplo solo si conviene
  botonReintentar.hidden = false;                           // el botón Reintentar se muestra siempre en este panel
  panelEstado.hidden = false;                               // hace visible el panel
  areaNoticias.replaceChildren();                           // vacía el área de noticias
  infoActualizacion.textContent = "";                       // borra la línea de información
}

// Muestra el banner pequeño (cuando ya hay noticias en pantalla y la actualización falla)
function mostrarAviso(tipo) {
  const datos = MENSAJES[tipo] || MENSAJES["inesperado"];
  aviso.textContent = `${datos.icono} ${datos.titulo}. Se siguen mostrando las últimas noticias cargadas.`;
  aviso.hidden = false;
}

// Dibuja 6 tarjetas "esqueleto" mientras llegan los datos
function mostrarCarga() {
  areaNoticias.replaceChildren();              // vacía el área
  for (let i = 0; i < 6; i++) {                // repite 6 veces
    areaNoticias.appendChild(crearElemento("div", "esqueleto")); // agrega una tarjeta gris animada
  }
}

// Activa o desactiva el modo "cargando" de los controles
function ponerCargando(activo) {
  cargando = activo;                           // actualiza la variable de estado
  botonRefrescar.disabled = activo;            // bloquea el botón mientras carga
  selectCategoria.disabled = activo;           // bloquea las listas para no mezclar peticiones
  selectFuente.disabled = activo;
  iconoRefrescar.classList.toggle("girando", activo); // el icono ↻ gira mientras carga
  areaNoticias.setAttribute("aria-busy", String(activo)); // avisa a lectores de pantalla
  botonRefrescar.lastChild.textContent = activo ? " Actualizando…" : " Actualizar noticias"; // cambia el texto
}

/* ---- Tarjetas de noticias ----------------------------------------------- */

// Construye la tarjeta (un <article>) de UNA noticia
function crearTarjeta(noticia) {
  const tarjeta = crearElemento("article", "tarjeta");      // contenedor de la tarjeta

  // --- imagen (o marcador si la noticia no trae imagen) ---
  const contenedorImagen = crearElemento("div", "tarjeta-imagen");
  if (noticia.imagen) {                                     // si la noticia trae imagen
    const imagen = document.createElement("img");           // crea <img>
    imagen.src = noticia.imagen;                            // dirección de la imagen
    imagen.alt = "";                                        // alt vacío: la imagen es decorativa, el título ya describe la noticia
    imagen.loading = "lazy";                                // carga la imagen solo cuando se acerca a la pantalla
    imagen.addEventListener("error", () => {                // si la imagen falla al cargar...
      imagen.remove();                                      // ...se quita
      contenedorImagen.appendChild(crearElemento("div", "sin-imagen", "Sin imagen")); // ...y se pone el marcador
    });
    contenedorImagen.appendChild(imagen);
  } else {
    contenedorImagen.appendChild(crearElemento("div", "sin-imagen", "Sin imagen")); // marcador
  }

  // --- fuente y fecha ---
  const meta = crearElemento("p", "tarjeta-meta");
  meta.appendChild(crearElemento("span", "etiqueta", noticia.fuente)); // nombre de la fuente
  const hora = document.createElement("time");              // <time> es la etiqueta semántica para fechas
  hora.dateTime = noticia.fecha;                            // valor "para máquinas"
  hora.textContent = formatearFecha(noticia.fecha);         // texto legible
  meta.appendChild(hora);

  // --- título clicable (abre la noticia completa) ---
  const titulo = crearElemento("h2", "tarjeta-titulo");
  const botonTitulo = crearElemento("button", "enlace-titulo", noticia.titulo);
  botonTitulo.type = "button";                              // botón normal
  botonTitulo.dataset.id = noticia.id;                      // data-id: así sé qué noticia se pulsó
  titulo.appendChild(botonTitulo);

  // --- resumen ---
  const resumen = crearElemento("p", "tarjeta-resumen",
    noticia.descripcion || "Esta noticia no incluye descripción.");

  // --- botón "Leer más" ---
  const botonLeer = crearElemento("button", "boton boton-secundario", "Leer más");
  botonLeer.type = "button";
  botonLeer.dataset.id = noticia.id;

  // --- armado de la tarjeta ---
  const cuerpo = crearElemento("div", "tarjeta-cuerpo");
  cuerpo.append(meta, titulo, resumen, botonLeer);          // append agrega varios hijos de una vez
  tarjeta.append(contenedorImagen, cuerpo);
  return tarjeta;
}

// Dibuja en pantalla las noticias, aplicando el filtro de búsqueda si hay texto escrito
function mostrarNoticias() {
  const consulta = simplificar(campoFiltro.value.trim());   // lo que escribió la persona, sin acentos ni mayúsculas

  const visibles = noticias.filter((noticia) =>             // filter deja solo las que coinciden
    simplificar(`${noticia.titulo} ${noticia.descripcion} ${noticia.fuente}`).includes(consulta)
  );

  areaNoticias.replaceChildren();                           // vacía el área antes de dibujar
  ocultarEstado();                                          // asegura que el panel esté oculto

  if (visibles.length === 0 && noticias.length > 0) {       // hay noticias, pero ninguna coincide
    mostrarSinCoincidencias();
    return;
  }

  visibles.forEach((noticia) => areaNoticias.appendChild(crearTarjeta(noticia))); // una tarjeta por noticia
  actualizarInformacion(visibles.length);
}

// Mensaje cuando el filtro no encuentra nada
function mostrarSinCoincidencias() {
  panelEstado.className = "estado estado-info";
  estadoIcono.textContent = "🔍";
  estadoTitulo.textContent = "Ninguna noticia coincide con tu búsqueda";
  estadoMensaje.textContent = "Prueba con otra palabra o borra el texto del buscador.";
  botonReintentar.hidden = true;                            // aquí no tiene sentido reintentar
  botonDemo.hidden = true;
  panelEstado.hidden = false;
  actualizarInformacion(0);
}

// Escribe la línea "Última actualización..." con el conteo de noticias
let horaActualizacion = "";                                 // se guarda la hora de la última carga correcta
function actualizarInformacion(cantidadVisible) {
  const origen = selectFuente.value === "demo" ? "Demostración (noticias de ejemplo)" : "GNews";
  infoActualizacion.textContent =
    `Última actualización: ${horaActualizacion} · Mostrando ${cantidadVisible} de ${noticias.length} noticias · Fuente: ${origen}${avisoPlan}`;
}

/* ---- Ventana de detalle -------------------------------------------------- */

// Rellena y abre la ventana con la noticia completa
function abrirDetalle(id) {
  const noticia = noticias.find((n) => n.id === id);        // find busca la noticia con ese id
  if (!noticia) return;                                     // si no la encuentra, no hace nada

  detalleMeta.textContent = `${noticia.fuente} · ${formatearFecha(noticia.fecha)}`;
  detalleTitulo.textContent = noticia.titulo;
  detalleDescripcion.textContent = noticia.descripcion;

  // Si el contenido es igual a la descripción no lo repito
  detalleTexto.textContent = noticia.contenido !== noticia.descripcion ? noticia.contenido : "";

  if (noticia.imagen) {                                     // muestra la imagen solo si existe
    detalleImagen.src = noticia.imagen;
    detalleFigura.hidden = false;
  } else {
    detalleFigura.hidden = true;
  }

  if (noticia.url) {                                        // muestra el enlace solo si existe
    detalleEnlace.href = noticia.url;
    detalleEnlace.hidden = false;
  } else {
    detalleEnlace.hidden = true;
  }

  ventanaDetalle.showModal();                               // abre el <dialog> como ventana modal
  botonCerrar.focus();                                      // pone el foco en el botón ✕ (accesibilidad)
}


/* ==========================================================================
   G. FUNCIÓN PRINCIPAL
   Une todo: pide, procesa, muestra y maneja errores.
   ========================================================================== */

// "conservar" es true cuando la persona pulsa "Actualizar": si falla, se conservan las noticias anteriores
async function cargarNoticias(conservar = false) {
  if (cargando) return;                                     // si ya hay una petición, no hago otra

  ponerCargando(true);                                      // bloquea controles y gira el icono
  ocultarAviso();                                           // limpia avisos anteriores
  if (!conservar || noticias.length === 0) {                // si no hay nada que conservar...
    ocultarEstado();
    mostrarCarga();                                         // ...muestra los esqueletos
  }

  try {
    // 1) Pido los datos (API real o demostración, según la lista "Fuente de datos")
    if (selectFuente.value === "demo") avisoPlan = ""; // en demostración no aplica el aviso del plan
    const articulos = selectFuente.value === "demo"
      ? await pedirNoticiasDemo(selectCategoria.value)
      : await pedirNoticias(selectCategoria.value);

    // 2) Proceso el JSON: map convierte cada artículo; filter quita los nulos (artículos inválidos)
    const lista = articulos.map(normalizarNoticia).filter((n) => n !== null);

    // 3) Si no quedó ninguna noticia, lanzo mi error "vacio"
    if (lista.length === 0) {
      throw new ErrorNoticias("vacio", "La lista de noticias está vacía");
    }

    // 4) Todo salió bien: guardo, anoto la hora y muestro
    noticias = lista;
    horaActualizacion = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    mostrarNoticias();
  } catch (error) {
    // Cualquier error de arriba llega aquí
    console.error(error);                                   // lo dejo en la consola para depurar
    const tipo = error instanceof ErrorNoticias ? error.tipo : "inesperado"; // ¿es un error mío?

    if (conservar && noticias.length > 0 && tipo !== "vacio") {
      mostrarNoticias();                                    // se quedan las noticias anteriores...
      mostrarAviso(tipo);                                   // ...y se avisa del problema con un banner
    } else {
      noticias = [];                                        // no hay nada que mostrar
      mostrarEstado(tipo, error);                           // panel grande con el mensaje (y el código HTTP si lo hay)
    }
  } finally {
    ponerCargando(false);                                   // pase lo que pase, se desbloquean los controles
  }
}


/* ==========================================================================
   H. EVENTOS
   addEventListener("evento", función) ejecuta la función cuando ocurre el evento.
   ========================================================================== */

// Clic en "Actualizar noticias": refresca SIN recargar la página
botonRefrescar.addEventListener("click", () => cargarNoticias(true));

// Clic en "Reintentar" del panel de estado
botonReintentar.addEventListener("click", () => cargarNoticias(false));

// Clic en "Ver noticias de ejemplo": cambia la fuente a demostración y carga
botonDemo.addEventListener("click", () => {
  selectFuente.value = "demo";
  cargarNoticias(false);
});

// Cambiar la categoría o la fuente: se descartan las noticias anteriores y se piden las nuevas
selectCategoria.addEventListener("change", () => { noticias = []; cargarNoticias(false); });
selectFuente.addEventListener("change", () => { noticias = []; cargarNoticias(false); });

// Escribir en el buscador: filtra las noticias YA cargadas, sin llamar a la API
campoFiltro.addEventListener("input", () => {
  if (noticias.length > 0) mostrarNoticias();
});

// Evitar que Enter en el buscador envíe el formulario y recargue la página
document.querySelector("#controles").addEventListener("submit", (evento) => evento.preventDefault());

// DELEGACIÓN DE EVENTOS: un solo "escuchador" en el área de noticias atiende los clics de TODAS las tarjetas
areaNoticias.addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-id]");   // closest busca el botón con data-id más cercano al clic
  if (boton) abrirDetalle(boton.dataset.id);                // abre la noticia correspondiente
});

// Cerrar la ventana de detalle con el botón ✕
botonCerrar.addEventListener("click", () => ventanaDetalle.close());

// Cerrar al hacer clic fuera del contenido (el clic en el fondo oscuro tiene como objetivo al propio <dialog>)
ventanaDetalle.addEventListener("click", (evento) => {
  if (evento.target === ventanaDetalle) ventanaDetalle.close();
});

// Guardar la clave escrita por la persona
formClave.addEventListener("submit", (evento) => {
  evento.preventDefault();                                  // evita que se recargue la página
  const clave = campoClave.value.trim();                    // trim quita espacios al inicio y al final
  guardarClave(clave);                                      // la guarda
  campoClave.value = "";                                    // limpia el campo
  mensajeClave.textContent = clave ? "✔ Clave guardada en este navegador." : "Clave eliminada.";
  if (clave && selectFuente.value === "gnews") cargarNoticias(false); // si ya había error por falta de clave, vuelve a intentar
});

// Al abrir la página se cargan las noticias automáticamente
cargarNoticias(false);
