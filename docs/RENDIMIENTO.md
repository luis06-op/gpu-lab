# Informe de uso de la GPU

Medición real tomada sobre el equipo de desarrollo mientras las demos se ejecutaban a pantalla
completa. Los milisegundos de GPU **no son una estimación**: se leen con la extensión
`EXT_disjoint_timer_query_webgl2`, que devuelve el tiempo que la tarjeta gráfica dedica de
verdad a cada fotograma.

## Cómo se mide

El motor compartido envuelve cada llamada de render entre dos consultas de tiempo:

```js
// assets/js/lab-core.js  ->  LAB.gpuTimer(renderer)
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');

// antes de renderizar
const q = gl.createQuery();
gl.beginQuery(ext.TIME_ELAPSED_EXT, q);

// … renderer.render(escena, cámara) …

// después de renderizar
gl.endQuery(ext.TIME_ELAPSED_EXT);

// más tarde (sin bloquear la GPU)
if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
  const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;   // ns -> ms
}
```

Cada consulta abarca **una llamada de render completa**, incluidos los pases internos
(ping-pong de la simulación, sombras, los seis pases del bloom…). El resultado se muestra en
vivo en el panel del HUD de cada demo, junto a los FPS, el tiempo de CPU, la resolución, el
número de llamadas de dibujo y la geometría procesada.

`LAB.gpuTimer` está en [`assets/js/lab-core.js`](../assets/js/lab-core.js) y no depende de que
la extensión exista: si el navegador no la expone, el HUD muestra `n/d` y las demos siguen
funcionando igual.

## Equipo

| Dato | Valor |
|---|---|
| GPU dedicada | **AMD Radeon RX 9060 XT** |
| GPU integrada | AMD Radeon 760M |
| Controlador | 32.0.31041.1004 (16/08/2026) |
| Pantalla | 1920 × 1080 @ **120 Hz** |
| API de render | WebGL 2.0 (OpenGL ES 3.0) vía **ANGLE / Direct3D 11** |
| Procesador | 12 hilos lógicos · 16 GB de RAM |
| Memoria de vídeo dedicada en uso | 1 217 MB (todo el sistema, no solo el navegador) |

### Capacidades que aprovechan las demos

| Capacidad | Valor | Se usa en |
|---|---|---|
| `MAX_TEXTURE_SIZE` | 16 384 px | sombras 2048², texturas de simulación |
| Unidades de textura en vertex shader | 16 | demos 02 y 04 (lectura de texturas en el vértice) |
| `EXT_color_buffer_float` | sí | GPGPU (demos 04 y 08) |
| `OES_texture_float_linear` | sí | desenfoques del bloom |
| `EXT_float_blend` | sí | mezcla aditiva sobre texturas flotantes |
| `MAX_SAMPLES` | 8 | antialias de todas las demos |
| Anisotropía máxima | 16× | visor de modelos |
| `EXT_disjoint_timer_query_webgl2` | sí | cronómetro de GPU del HUD |
| Hilos de CPU | 12 | generación de geometría procedural |

## Presupuesto de fotograma

A 120 Hz cada fotograma dispone de **8,33 ms**. Ese es el techo real:

```
presupuesto  ████████████████████████████████████████  8,33 ms
uso de GPU   █                                          0,07 – 0,48 ms
```

En el peor caso la tarjeta gráfica ocupa el **5,8 %** del presupuesto de fotograma.
El resto del tiempo está esperando a la sincronización vertical: el cuello de botella
es el monitor, no la GPU.

## Medición por demo

Todas las cifras están tomadas a 949 × 886 píxeles (ventana del navegador) y 120 Hz.
Los rangos indican varias tandas de medición de la misma demo.

| # | Demo | GPU / fotograma | Llamadas de dibujo | Geometría | Trabajo que hace la GPU |
|---|---|---|---|---|---|
| 01 | Árbol neón | **0,07 ms** | 9 | 5 928 pts · 434 tri | puntos con mezcla aditiva y anillos de radar |
| 02 | Galaxia de partículas | **0,20 ms** | 3 | 180 000 pts | rotación diferencial de 180 000 vértices por fotograma |
| 03 | Raymarching SDF | **0,48 ms** | 1 | 2 tri (¡todo el shader!) | ~100 pasos × 841 000 píxeles ≈ **84 millones de evaluaciones SDF por fotograma** |
| 04 | Partículas GPGPU | **0,08–0,19 ms** | 3 | 66 136 pts | 2 pases de simulación en texturas flotantes + dibujo leyendo la textura |
| 05 | Terreno procedural | **0,13–0,21 ms** | 11 | 155 700 tri | 78 400 vértices × 3 evaluaciones de altura + normales |
| 06 | Ciudad instanciada | **0,24–0,33 ms** | 5 (1 para los 8 100 edificios) | 97 204 tri | ventanas, onda de energía y niebla por fragmento |
| 07 | Visor de modelos | **0,28 ms** | 5 | 20 072 tri | PBR + mapa de sombras 2048² + entorno PMREM |
| 08 | Bloom y post-proceso | **0,18 ms** | 1 + 6 pases | 2 tri | 6 pases de pantalla completa sobre 841 000 píxeles |

Todas las demos sostienen **119–120 FPS** (medido en el HUD).

## Rendimiento derivado (por segundo a 120 FPS)

| Demo | Trabajo por segundo |
|---|---|
| 02 · Galaxia | 21 600 000 de vértices de partícula |
| 03 · Raymarching | ≈ 10 000 millones de evaluaciones de SDF |
| 05 · Terreno | 9 400 000 vértices + 18 700 000 triángulos |
| 06 · Ciudad | 8 100 instancias × 12 triángulos × 120 = 11 700 000 triángulos |
| 04 · GPGPU | ≈ 7 900 000 actualizaciones de partícula (2 pases cada una) |
| 08 · Bloom | ≈ 22 000 000 de muestras de textura por fotograma |

## Uso a nivel del sistema operativo

Contadores de Windows (`\GPU Engine(*)\Utilization Percentage`) durante la ejecución
del terreno procedural:

```
7,3 | 7,3 | 7,4 | 7,0 | 7,0 | 7,3 | 7,8 | 6,9   (% del motor 3D)
```

| Proceso | Uso del motor 3D |
|---|---|
| Navegador con la demo | 5,69 – 6,28 % |
| `dwm` (compositor de Windows) | 0,71 % |
| Rainmeter (escritorio) | 0,44 % |

Es decir: **menos del 7 % de la GPU** con una escena de 155 700 triángulos a 120 FPS.

## Verificación en vivo

Estas cifras no son de una máquina aislada: la versión publicada en GitHub Pages
([luis06-op.github.io/gpu-lab](https://luis06-op.github.io/gpu-lab/)) se midió igual y da los
mismos valores, sin errores de consola.

| Demo (desde Pages) | FPS | GPU / fotograma | Llamadas | Geometría |
|---|---|---|---|---|
| 02 · Galaxia de partículas | 120 | 0,20 ms | 3 | 2 tri · 181 200 pts |
| 04 · Partículas GPGPU | 120 | 0,19 ms | 3 | 2 tri · 66 136 pts |
| 06 · Ciudad instanciada | 120 | 0,29 ms | 5 | 97 204 tri · 900 pts · 106 lin |

## Cómo reproducirlo

1. Abre cualquier demo (en local o en GitHub Pages).
2. Deja la pestaña en primer plano unos segundos: el HUD refresca cada 420 ms.
3. Lee la fila **GPU** del panel: es el tiempo medio de GPU de las últimas tandas de
   fotogramas, medido con la consulta de tiempo.

Si tu equipo no expone `EXT_disjoint_timer_query_webgl2` (ocurre sobre todo en navegadores
sobre OpenGL, no sobre ANGLE/D3D11), la fila mostrará `n/d`; los FPS y el resto de datos
siguen siendo válidos.

## Notas metodológicas

- La medición de GPU se toma con una consulta de tiempo (`TIME_ELAPSED_EXT`) que
  abarca **una llamada completa de render**, incluidos los pases internos.
- En el modo de captura para GIF el motor fija `pixelRatio = 1` y renderiza a
  **840 × 345**, por lo que el coste por fotograma es aún menor que el de estas tablas.
- Las consultas se encolan y se leen de forma asíncrona: nunca se llama a `QUERY_RESULT`
  sin comprobar antes `QUERY_RESULT_AVAILABLE`, para no bloquear la tubería de la GPU.
- Los datos de sistema se obtuvieron con `Get-Counter` y `Get-CimInstance`
  (Windows PowerShell) mientras el navegador mantenía la demo en primer plano.
- Las capacidades de WebGL se leen del propio contexto (`gl.getParameter`), no de una
  lista predefinida: si cambias de equipo, la portada del proyecto te mostrará tu GPU real.
