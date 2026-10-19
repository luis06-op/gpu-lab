# Pipeline de captura de los GIF

Los GIF de este repositorio no salen de una grabadora de pantalla. Se generan **renderizando la
escena en la GPU fotograma a fotograma**, a resolución fija y con un tiempo determinista, y luego
se codifican con FFmpeg. Así el resultado no depende de los fotogramas por segundo del equipo:
la animación es idéntica en cualquier máquina.

## Por qué así

| Problema de grabar la pantalla | Cómo lo resuelve el arnés |
|---|---|
| El GIF depende de la velocidad del equipo | El tiempo se calcula por índice de fotograma: `t = (f / N) · periodo` |
| Aparecen el cursor, los paneles y las notificaciones | Solo se captura la lona (`canvas.toDataURL`) |
| Resolución irregular | El iframe se fija a 840 × 345 y `pixelRatio = 1` |
| El bucle da un salto | La demo recibe `n` y mapea exactamente un periodo completo |
| Se pierden fotogramas | El motor deja de usar `requestAnimationFrame` y espera a que se le pida cada fotograma |

## Piezas

| Archivo | Función |
|---|---|
| `tools/capture.html` | Abre la demo en un iframe, pide los fotogramas en orden y sube cada PNG |
| `tools/save.php` | Recibe el PNG en base64 y lo escribe en `tools/frames/` |
| `assets/js/lab-core.js` | En modo captura (`?embed=1`) escucha los mensajes y renderiza el fotograma pedido |
| `tools/build-gifs.ps1` | Une la secuencia de PNG y produce el GIF final con FFmpeg |

## Protocolo entre el arnés y la demo

```
arnés (capture.html)                        demo (index.html?embed=1&n=24)
        │                                              │
        │ ◀──────────── postMessage { lab: 'ready' } ──│  la demo ya está lista
        │                                              │
        │ ── postMessage { lab: 'render', frame: 0 } ─▶│  update(t) + render()
        │                                              │  t = (0 / 24) · periodo
        │ ◀──────── postMessage { lab: 'frame', ───────│  canvas.toDataURL('image/png')
        │              frame: 0, dataUrl }             │
        │                                              │
        │  POST tools/save.php?name=demo_000.png       │
        │                                              │
        │ ── postMessage { lab: 'render', frame: 1 } ─▶│  …y así hasta n-1
        ▼
   document.title = "FRAMES DONE 24"
```

El fotograma `f` se renderiza en el instante `t = (f mod n) / n · periodo`, de forma que el
fotograma `n` coincidiría exactamente con el `0`: **el bucle del GIF no tiene costura**.

## Procedimiento completo

```powershell
# 1 · servidor local (hace falta PHP por save.php)
php -S 127.0.0.1:8080 -t .

# 2 · capturar cada demo: abre en el navegador
#     http://127.0.0.1:8080/tools/capture.html?demo=02-galaxia-particulas&n=24&w=840&h=345
#     (repite cambiando el parámetro demo)
#     Cuando termina, el título de la pestaña pasa a "FRAMES DONE 24"

# 3 · unir los PNG y generar los GIF
powershell -File tools/build-gifs.ps1 -All
# o una sola demo:
powershell -File tools/build-gifs.ps1 -Demo 02-galaxia-particulas
```

`build-gifs.ps1` acepta `-Fps`, `-Colors` y `-Ffmpeg` si tienes FFmpeg en otra ruta.

## Ajustes de codificación

```
ffmpeg -framerate 12.5 -i frames/<demo>_%03d.png
       -filter_complex "[0:v]fps=12.5,split[a][b];\
                        [a]palettegen=max_colors=112:stats_mode=diff[p];\
                        [b][p]paletteuse=dither=none"
       -loop 0 assets/gifs/<demo>.gif
```

| Ajuste | Valor | Motivo |
|---|---|---|
| `framerate` de entrada | `12.5` | Debe coincidir con el de salida para no perder fotogramas |
| `fps` | `12.5` | Fluidez suficiente para animaciones 3D y la mitad de peso que 25 fps |
| `max_colors` | `112` | La paleta baja de 128 a 112 ahorra ~10 % sin pérdida visible |
| `stats_mode` | `diff` | Calcula la paleta sobre lo que cambia entre fotogramas |
| `dither` | `none` | **Clave:** el *dithering* añade ruido y multiplicaba el peso por dos |

Comparativa real sobre la demo 05 (36 fotogramas, 880 × 360):

| Ajustes | Peso |
|---|---|
| 128 colores + `dither=bayer` | 4 637 KB |
| 112 colores + `dither=none` + `stats_mode=diff` | 2 160 KB |

## Resultado

| Demo | Tamaño | Fotogramas |
|---|---|---|
| 01 · Árbol neón | 1 075 KB | 24 |
| 02 · Galaxia de partículas | 1 738 KB | 24 |
| 03 · Raymarching SDF | 1 317 KB | 24 |
| 04 · Partículas GPGPU | 883 KB | 24 |
| 05 · Terreno procedural | 2 638 KB | 24 |
| 06 · Ciudad instanciada | 1 490 KB | 24 |
| 07 · Visor de modelos | 1 291 KB | 24 |
| 08 · Bloom y post-proceso | 4 122 KB | 24 |
| **Total** | **14,2 MB** | 840 × 345 |

Los fotogramas intermedios (`tools/frames/`) y las pruebas (`tools/out/`) están en `.gitignore`:
solo se versionan los GIF finales.
