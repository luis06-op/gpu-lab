/* =====================================================================
   GPU LAB · núcleo compartido
   ---------------------------------------------------------------------
   Todo el render de este repositorio ocurre en la GPU (WebGL).
   Este archivo concentra: creación del renderer, bucle, modo captura
   determinista para generar los GIF, HUD con la tarjeta gráfica real,
   controles orbitales y utilidades (RNG, brillos, rejillas, estrellas).
   ===================================================================== */
const LAB = (() => {
  const params = new URLSearchParams(location.search);
  const EMBED = params.get('embed') === '1';      // true dentro del arnés de captura

  const PAL = {
    bg: 0x040706,
    green: 0x00ff41,
    mint: 0x9dffc0,
    blue: 0x38bdf8,
    white: 0xf2fff7,
    deep: 0x0b2a1c,
    dark: 0x03110a
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------------------------------------------- RNG determinista */
  function rng(seed = 1) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------- texturas de brillo */
  function glowTexture(inner = 'rgba(0,255,65,1)', outer = 'rgba(0,255,65,0)', size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.35, inner.replace(/,\s*[\d.]+\)$/, ',0.35)'));
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  /* ---------------------------------------------------- HUD */
  function gpuInfo(renderer) {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(raw || 'WebGL');
  }

  function gpuVendor(renderer) {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) || '');
  }

  /* ---------------------------------------------------- cronómetro de GPU
     EXT_disjoint_timer_query_webgl2 permite medir el tiempo que la tarjeta
     gráfica dedica realmente a cada fotograma (no el tiempo del procesador). */
  function gpuTimer(renderer) {
    const gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { ok: false, begin() {}, end() {}, read() { return null; } };

    const cola = [];
    let activo = false;
    let ultimo = null;

    return {
      ok: true,
      begin() {
        if (cola.length > 4) { activo = false; return; }   // no acumular consultas
        activo = true;
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        cola.push(q);
      },
      end() {
        if (!activo) return;
        activo = false;
        gl.endQuery(ext.TIME_ELAPSED_EXT);
      },
      read() {
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        while (cola.length) {
          const q = cola[0];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
          if (!disjoint) ultimo = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;   // ns -> ms
          cola.shift();
          gl.deleteQuery(q);
        }
        return ultimo;
      }
    };
  }

  function hud(renderer, extraRows) {
    const el = document.getElementById('hud');
    if (!el) return { tick() {} };
    const rows = extraRows ? Object.entries(extraRows) : [];
    const row = (k, id, cls) =>
      `<div class="row"><span class="k">${k}</span><span class="v ${cls || ''}" id="${id}">—</span></div>`;

    el.innerHTML =
      row('FPS', 'hud-fps', 'hot') +
      row('cuadro', 'hud-ms') +
      row('GPU', 'hud-gpu', 'hot') +
      row('resolución', 'hud-res') +
      rows.map(([k], i) => row(k, 'hud-x' + i)).join('') +
      row('dibujos', 'hud-calls') +
      row('geometría', 'hud-geo') +
      '<div class="gpu"><span>GPU</span> · ' + gpuInfo(renderer) + '</div>';

    const q = id => el.querySelector('#' + id);
    const f = q('hud-fps'), m = q('hud-ms'), g = q('hud-gpu'), r = q('hud-res');
    const calls = q('hud-calls'), geo = q('hud-geo');
    const xs = rows.map((_, i) => q('hud-x' + i));
    const claves = rows.map(([k]) => k);

    let acc = 0, n = 0, last = performance.now(), gpuAcc = 0, gpuN = 0;
    const num = v => v.toLocaleString('es-CO');

    const pintar = () => {
      r.textContent = renderer.domElement.width + '×' + renderer.domElement.height;
      const info = renderer.info.render;
      calls.textContent = num(info.calls);
      const partes = [];
      if (info.triangles) partes.push(num(info.triangles) + ' tri');
      if (info.points) partes.push(num(info.points) + ' pts');
      if (info.lines) partes.push(num(info.lines) + ' lin');
      geo.textContent = partes.join(' · ') || '—';
    };
    pintar();

    return {
      tick(extra, gpuMs) {
        const now = performance.now();
        acc += now - last; last = now; n++;
        if (gpuMs !== null && gpuMs !== undefined) { gpuAcc += gpuMs; gpuN++; }

        if (acc > 420) {
          f.textContent = (n * 1000 / acc).toFixed(0);
          m.textContent = (acc / n).toFixed(2) + ' ms';
          g.textContent = gpuN ? (gpuAcc / gpuN).toFixed(2) + ' ms' : 'n/d';
          gpuAcc = 0; gpuN = 0;
          pintar();
          if (extra) claves.forEach((k, i) => {
            if (xs[i] && extra[k] !== undefined) xs[i].textContent = extra[k];
          });
          acc = 0; n = 0;
        }
      }
    };
  }

  /* ---------------------------------------------------- controles orbitales */
  function orbit(camera, dom, target, o = {}) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    const minP = o.minPolar !== undefined ? o.minPolar : 0.06;
    const maxP = o.maxPolar !== undefined ? o.maxPolar : Math.PI * 0.92;
    const minR = o.minRadius !== undefined ? o.minRadius : 3;
    const maxR = o.maxRadius !== undefined ? o.maxRadius : 900;
    const speed = o.speed || 1;
    let drag = false, px = 0, py = 0;

    const apply = () => {
      sph.phi = clamp(sph.phi, minP, maxP);
      sph.radius = clamp(sph.radius, minR, maxR);
      camera.position.setFromSpherical(sph).add(target);
      camera.lookAt(target);
    };

    const enabled = !EMBED && o.enabled !== false;
    if (enabled) {
      dom.style.touchAction = 'none';
      dom.addEventListener('pointerdown', e => {
        drag = true; px = e.clientX; py = e.clientY;
        if (dom.setPointerCapture) dom.setPointerCapture(e.pointerId);
      });
      dom.addEventListener('pointerup', () => { drag = false; });
      dom.addEventListener('pointercancel', () => { drag = false; });
      dom.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = (e.clientX - px) / dom.clientHeight;
        const dy = (e.clientY - py) / dom.clientHeight;
        px = e.clientX; py = e.clientY;
        sph.theta -= dx * TAU * speed;
        sph.phi -= dy * Math.PI * speed;
        o.onUser && o.onUser();
        apply();
      });
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        sph.radius *= 1 + Math.sign(e.deltaY) * 0.09;
        o.onUser && o.onUser();
        apply();
      }, { passive: false });
    }

    apply();
    return {
      set(radius, theta, phi) { sph.set(radius, phi, theta); apply(); },
      auto(dt, rate) { sph.theta += rate * dt; apply(); },
      get dragged() { return drag; },
      apply
    };
  }

  /* ---------------------------------------------------- rejilla y estrellas */
  function grid(size = 80, div = 40, color = PAL.green, opacity = 0.16) {
    const g = new THREE.GridHelper(size, div, color, color);
    g.material.transparent = true;
    g.material.opacity = opacity;
    g.material.blending = THREE.AdditiveBlending;
    g.material.depthWrite = false;
    return g;
  }

  function stars(count = 1400, radius = 260, color = PAL.mint, size = 1.1) {
    const pos = new Float32Array(count * 3);
    const r = rng(7);
    for (let i = 0; i < count; i++) {
      const u = r() * TAU, v = Math.acos(2 * r() - 1), rad = radius * (0.55 + r() * 0.45);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * rad;
      pos[i * 3 + 1] = Math.abs(Math.cos(v)) * rad * 0.75 - 20;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * rad;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    return new THREE.Points(geo, mat);
  }

  /* ---------------------------------------------------- arranque */
  function boot(o) {
    const canvas = document.getElementById('view') || o.canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: o.aa !== false, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(EMBED ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(o.bg !== undefined ? o.bg : PAL.bg, 1);
    if (o.sortObjects === false) renderer.sortObjects = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov || 50, 1, o.near || 0.1, o.far || 4000);
    const cam = o.camera || {};
    camera.position.set.apply(camera.position, cam.pos || [0, 4, 26]);
    const target = new THREE.Vector3().set.apply(new THREE.Vector3(), cam.target || [0, 0, 0]);
    camera.lookAt(target);
    scene.add(camera);

    const ctx = { scene, camera, renderer, target, THREE, params, embed: EMBED };

    const hooks = { info: null };
    ctx.report = (obj) => { hooks.info = obj; };

    const built = o.build ? o.build(ctx) : null;
    if (built && typeof built === 'object') Object.assign(ctx, built);

    window.LAB_CTX = ctx;          // punto de inspección desde la consola

    const ctl = o.orbit === false ? null : orbit(camera, canvas, target, o.orbitOpts || {});
    if (ctl) ctx.ctl = ctl;

    const period = o.period || 10;
    // N puede venir del arnés de captura (?n=) para que el bucle del GIF cuadre
    const N = parseInt(params.get('n') || '', 10) || o.frames || 40;
    const info = hud(renderer, o.stats);
    const relojGPU = gpuTimer(renderer);

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (built && built.resize) built.resize(w, h);
    };
    window.addEventListener('resize', resize);
    resize();

    const update = (t, dt) => {
      if (built && built.update) built.update(t, dt, ctx);
      else if (o.update) o.update(t, dt, ctx);
    };

    const render = (t, dt) => {
      update(t, dt);
      if (ctl && ctl.autoRotateRate) ctl.auto(dt, ctl.autoRotateRate);
      relojGPU.begin();
      if (o.customRender) o.customRender(t, dt, ctx);
      else renderer.render(scene, camera);
      relojGPU.end();
    };

    if (EMBED) {
      // Captura determinista: el arnés pide fotogramas concretos y responde con el PNG.
      window.addEventListener('message', ev => {
        const d = ev.data || {};
        if (d.lab !== 'render') return;
        const f = d.frame | 0;
        const t = (f % N) / N * period;
        resize();
        render(t, period / N);
        const url = canvas.toDataURL('image/png');
        parent.postMessage({ lab: 'frame', frame: f, dataUrl: url }, '*');
      });
      parent.postMessage({ lab: 'ready', name: o.name || '' }, '*');
    } else {
      let last = performance.now(), elapsed = 0;
      const loop = (now) => {
        const dt = Math.min((now - last) / 1000, 0.06);
        last = now;
        elapsed += dt;
        render(elapsed % period, dt);
        info.tick(hooks.info, relojGPU.read());
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    return { renderer, scene, camera, ctx, update, render, resize, period, frames: N, embed: EMBED };
  }

  return {
    PAL, TAU, rng, clamp, glowTexture, orbit, grid, stars, boot, hud,
    gpuInfo, gpuVendor, embed: EMBED, params,
    get THREE() { return window.THREE; }
  };
})();
