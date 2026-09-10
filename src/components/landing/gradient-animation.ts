/** Local implementation of the reference page's terrain, blur, and color cycle. */
const VERTEX = `#version 300 es
layout(location = 0) in vec2 position;
out vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D image;
uniform vec2 resolution;
uniform float offset;
in vec2 uv;
out vec4 color;
void main() {
  vec2 distance = vec2(offset * 0.12, offset * 4.0) / resolution;
  color = (texture(image, uv + vec2(-distance.x, -distance.y))
    + texture(image, uv + vec2(distance.x, -distance.y))
    + texture(image, uv + vec2(-distance.x, distance.y))
    + texture(image, uv + distance)) * 0.25;
}
`;

const HORIZONTAL_BLUR = `#version 300 es
precision mediump float;
uniform sampler2D image;
uniform vec2 resolution;
uniform float radius;
in vec2 uv;
out vec4 color;
void main() {
  float sigma = radius / 3.0;
  int samples = min(int(radius * 0.5), 16);
  vec4 sum = vec4(0.0);
  float weights = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (abs(i) <= samples) {
      float distance = float(i);
      float weight = exp(-0.5 * distance * distance / (sigma * sigma));
      sum += texture(image, uv + vec2(distance / resolution.x, 0.0)) * weight;
      weights += weight;
    }
  }
  color = sum / max(weights, 0.000001);
}
`;

const COLOR = `#version 300 es
precision mediump float;
uniform sampler2D image;
uniform vec2 resolution;
uniform float time;
uniform float seed;
in vec2 uv;
out vec4 color;
float hash(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  vec2 smoothFraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), smoothFraction.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), smoothFraction.x),
    smoothFraction.y);
}
void main() {
  vec3 base = texture(image, uv).rgb;
  base += (hash(uv * resolution + seed * 0.1) - 0.5) / 170.0;
  vec2 grainPosition = uv * resolution * 4.0 + vec2(time * 4.0, -time * 3.0);
  float grain = (noise(grainPosition + seed * 10.0)
    + noise(grainPosition * 2.0 + seed * 20.0) * 0.5) / 1.5;
  base += (grain - 0.5) * 2.0 * 0.04;
  float luminance = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float amount = 1.0 - abs(fract(luminance * 1.75 + time / 6.0) * 2.0 - 1.0);
  color = vec4(mix(vec3(227.0, 72.0, 80.0) / 255.0,
    vec3(112.0, 72.0, 216.0) / 255.0, amount), 1.0);
}
`;

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
};

function seededRandom(seed: number) {
  let value = seed | 0;
  return () => {
    let next = (value += 0x6d2b79f5);
    next = Math.imul(next ^ (next >>> 15), 1 | next);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function animateDuneGradient(canvas: HTMLCanvasElement, kind: 'hero' | 'cta') {
  const context = canvas.getContext('webgl2', {
    antialias: false, premultipliedAlpha: false, depth: false, stencil: false,
  });
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.background = 'linear-gradient(180deg, #E34850 0%, #7048D8 100%)';
  if (!context) return () => {};
  const gl = context;
  const mask = document.createElement('canvas');
  const maskContext = mask.getContext('2d');
  if (!maskContext) return () => {};
  const paint = maskContext;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 743px)');
  const seed = kind === 'cta' ? 3920 : Math.floor(Math.random() * 100000);
  const programs: WebGLProgram[] = [];
  const targets: Target[] = [];
  let vertices: WebGLBuffer | null = null;
  let vertexArray: WebGLVertexArrayObject | null = null;
  let blur: WebGLProgram;
  let horizontal: WebGLProgram;
  let color: WebGLProgram;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let lost = false;
  let dirty = true;
  let pointerX = 0;
  let pointerY = 0;
  const shifts = { backX: 0, backY: 0, middleX: 0, middleY: 0, frontX: 0, frontY: 0 };

  function compile(source: string, type: number) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not allocate gradient shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Could not compile gradient shader');
    }
    return shader;
  }

  function program(fragment: string) {
    const vertex = compile(VERTEX, gl.VERTEX_SHADER);
    const pixel = compile(fragment, gl.FRAGMENT_SHADER);
    const result = gl.createProgram();
    if (!result) throw new Error('Could not allocate gradient program');
    gl.attachShader(result, vertex);
    gl.attachShader(result, pixel);
    gl.linkProgram(result);
    gl.deleteShader(vertex);
    gl.deleteShader(pixel);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      gl.deleteProgram(result);
      throw new Error('Could not link gradient program');
    }
    programs.push(result);
    return result;
  }

  function releaseTargets() {
    targets.forEach(({ texture, framebuffer }) => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    });
    targets.length = 0;
  }

  function target(width: number, height: number, framebuffer = true): Target {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Could not allocate gradient texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    const output = framebuffer ? gl.createFramebuffer() : null;
    if (output) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, output);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    const result = { texture, framebuffer: output, width, height };
    targets.push(result);
    return result;
  }

  function initialize() {
    blur = program(BLUR);
    horizontal = program(HORIZONTAL_BLUR);
    color = program(COLOR);
    vertexArray = gl.createVertexArray();
    vertices = gl.createBuffer();
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    canvas.width = Math.min(limit, Math.max(2, Math.floor(bounds.width)));
    canvas.height = Math.min(limit, Math.max(2, Math.floor(bounds.height)));
    const scale = kind === 'hero' ? 0.5 : 0.45;
    mask.width = Math.max(2, Math.floor(canvas.width * scale));
    mask.height = Math.max(2, Math.floor(canvas.height * scale));
    releaseTargets();
    target(mask.width, mask.height, false);
    for (let level = 0; level < 5; level++) {
      target(Math.max(2, Math.floor(mask.width / 2 ** level)), Math.max(2, Math.floor(mask.height / 2 ** level)));
    }
    for (let level = 3; level >= 0; level--) {
      target(Math.max(2, Math.floor(mask.width / 2 ** level)), Math.max(2, Math.floor(mask.height / 2 ** level)));
    }
    target(mask.width, mask.height);
    dirty = false;
  }

  function drawTerrain(time: number) {
    const width = mask.width;
    const height = mask.height;
    const random = seededRandom(seed);
    const parallax = kind === 'cta' && !mobile.matches && !motion.matches;
    const mouseX = parallax ? (pointerX - 0.5) * canvas.width * 0.2 : 0;
    const mouseY = parallax ? (pointerY - 0.5) * canvas.height * 0.16 : 0;
    const sway = parallax ? 0.003 * canvas.width * Math.sin(2 * Math.PI * 0.08 * time) : 0;
    const x = mouseX + sway;
    shifts.backX += (-0.8 * x - shifts.backX) * 0.018;
    shifts.backY += (0.6 * mouseY - shifts.backY) * 0.018;
    shifts.middleX += ((x + Math.sin(2 * Math.PI * 0.0888 * time + 0.7) * 0.002 * canvas.width) * 2.2 - shifts.middleX) * 0.02;
    shifts.middleY += (1.8 * mouseY - shifts.middleY) * 0.02;
    shifts.frontX += ((x + Math.sin(2 * Math.PI * 0.1016 * time + 1.3) * 0.002 * canvas.width) * 4 - shifts.frontX) * 0.035;
    shifts.frontY += (3.2 * mouseY - shifts.frontY) * 0.035;
    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, width, height);

    function layer(fill: string, points: number, amplitude: number, edge: number, skew: boolean, spread: number, shiftX: number, shiftY: number) {
      const extra = (spread - 1) * 0.5 * width;
      const left = -extra + shiftX * width / canvas.width;
      const right = width + extra + shiftX * width / canvas.width;
      const baseline = height + shiftY * height / canvas.height;
      const coordinates: [number, number][] = [];
      for (let point = 0; point < points; point++) {
        const progress = point / (points - 1);
        let offset = (0.35 * (2 * Math.abs(0.5 - progress)) ** (0.8 + 0.8 * random())
          + 0.65 * random() * (0.6 + 0.4 * random())) * amplitude * height;
        if (skew) offset *= 1 + 0.8 * progress;
        coordinates.push([left + (right - left) * progress, baseline - offset]);
      }
      paint.fillStyle = fill;
      paint.beginPath();
      paint.moveTo(left, baseline - random() * edge * height);
      coordinates.forEach(([x, y]) => paint.lineTo(x, y));
      paint.lineTo(right, baseline - random() * edge * height);
      paint.lineTo(right, height + 2);
      paint.lineTo(left, height + 2);
      paint.closePath();
      paint.fill();
    }
    layer('#1e1e1e', 11, 0.8, 0.12, false, 1.2, shifts.backX, shifts.backY);
    layer('#545454', kind === 'hero' && mobile.matches ? 32 : 36, 0.68, 0.1, true, 1.8, shifts.middleX, shifts.middleY);
    layer('#a8a8a8', 7, 0.58, 0.08, false, 2.2, shifts.frontX, shifts.frontY);
  }

  function pass(shader: WebGLProgram, input: Target, output: Target | null, extra: string, value: number) {
    gl.useProgram(shader);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output?.framebuffer ?? null);
    const width = output?.width ?? canvas.width;
    const height = output?.height ?? canvas.height;
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.texture);
    gl.uniform1i(gl.getUniformLocation(shader, 'image'), 0);
    gl.uniform2f(gl.getUniformLocation(shader, 'resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(shader, extra), value);
    if (shader === color) gl.uniform1f(gl.getUniformLocation(shader, 'seed'), seed);
    gl.bindVertexArray(vertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function draw(now: number) {
    frame = 0;
    if (destroyed || lost || !visible) return;
    if (dirty) resize();
    const time = motion.matches ? 0 : now * 0.001;
    drawTerrain(time);
    gl.bindTexture(gl.TEXTURE_2D, targets[0].texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    let input = targets[0];
    [0.4, 0.7, 1, 1.3, 1.6, 1.6, 1.3, 1, 0.7].forEach((offset, index) => {
      const output = targets[index + 1];
      pass(blur, input, output, 'offset', offset);
      input = output;
    });
    const radius = kind === 'hero' && mobile.matches ? 8 : 12;
    pass(horizontal, input, targets[10], 'radius', radius * (kind === 'hero' ? 0.5 : 0.45) * 1.3);
    pass(color, targets[10], null, 'time', time);
    if (!motion.matches) frame = requestAnimationFrame(draw);
  }

  function schedule() {
    if (!frame && !destroyed && !lost && visible) frame = requestAnimationFrame(draw);
  }
  function requestResize() { dirty = true; schedule(); }
  function pointer(event: MouseEvent) {
    const bounds = canvas.getBoundingClientRect();
    pointerX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    pointerY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function contextRestored() {
    programs.length = 0;
    targets.length = 0;
    lost = false;
    try { initialize(); requestResize(); } catch { lost = true; }
  }
  try { initialize(); } catch { programs.forEach((item) => gl.deleteProgram(item)); return () => {}; }
  const resizeObserver = new ResizeObserver(requestResize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
    else { cancelAnimationFrame(frame); frame = 0; }
  }, { rootMargin: '50px' });
  intersectionObserver.observe(canvas);
  motion.addEventListener('change', requestResize);
  mobile.addEventListener('change', requestResize);
  if (kind === 'cta') window.addEventListener('mousemove', pointer, { passive: true });
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  schedule();

  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    motion.removeEventListener('change', requestResize);
    mobile.removeEventListener('change', requestResize);
    window.removeEventListener('mousemove', pointer);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    releaseTargets();
    programs.forEach((item) => gl.deleteProgram(item));
    gl.deleteBuffer(vertices);
    gl.deleteVertexArray(vertexArray);
  };
}
