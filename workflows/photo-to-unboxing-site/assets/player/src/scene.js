import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const ease = value => 1 - Math.pow(1 - clamp(value), 3);

/** A UI-independent, stage-sized unboxing scene. Supplied model ownership transfers here. */
export function createScene({ onPhase = () => {}, onProgress = () => {} } = {}) {
  const canvas = document.querySelector('#scene');
  const stage = document.querySelector('#stage');
  if (!canvas || !stage) throw new Error('The unboxing scene requires #stage and #scene.');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#f5f5f3', 18, 35);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf5f6ff, 0xb9b1a8, 0.9));
  const key = new THREE.DirectionalLight(0xfff8ed, 2);
  key.position.set(-3, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -5 });
  Object.assign(key.shadow, { normalBias: 0.035, bias: -0.0001, radius: 7, blurSamples: 12 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe6edff, 1.5);
  rim.position.set(3, 5, -4);
  scene.add(rim);
  RectAreaLightUniformsLib.init();
  for (const [color, intensity, width, height, position] of [
    [0xffffff, 2.3, 5, 7, [-3, 4, 5]], [0xf0f4ff, 2.1, 2, 6, [4, 3, -2]],
  ]) {
    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.position.fromArray(position); light.lookAt(0, 1.5, 0); scene.add(light);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.14 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.035; floor.receiveShadow = true; scene.add(floor);
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = contactCanvas.height = 128;
  const contactContext = contactCanvas.getContext('2d');
  const gradient = contactContext.createRadialGradient(64, 64, 3, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,.23)'); gradient.addColorStop(0.4, 'rgba(0,0,0,.11)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  contactContext.fillStyle = gradient; contactContext.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 3.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }));
  contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = -0.018; scene.add(contactShadow);

  const root = new THREE.Group(); root.rotation.y = -0.25; scene.add(root);
  const packRig = new THREE.Group(); root.add(packRig);
  const pack = new THREE.Group(); packRig.add(pack);
  const R = 1.22, H = 3.3, apothem = R * Math.cos(Math.PI / 6);
  let paperColor = '#bd9466', inkColor = '#171717';
  const paper = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.96, side: THREE.DoubleSide });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(paperColor).multiplyScalar(0.76), roughness: 1 });
  const bottomMaterial = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.95 });
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.045, 6), bottomMaterial);
  bottom.rotation.y = Math.PI / 6; bottom.position.y = 0.018; bottom.receiveShadow = true; pack.add(bottom);
  const texture = image => {
    const value = new THREE.CanvasTexture(image); value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return value;
  };
  function plainCanvas(width, height, color) {
    const image = document.createElement('canvas'); image.width = width; image.height = height;
    const context = image.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, width, height); return image;
  }
  const panels = [], outerMaterials = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3, pivot = new THREE.Group();
    pivot.position.set(Math.sin(angle) * apothem, 0.035, Math.cos(angle) * apothem); pivot.rotation.y = angle;
    const material = new THREE.MeshStandardMaterial({ map: texture(plainCanvas(512, 1024, paperColor)), roughness: 0.68, metalness: 0.01 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(R, H, 0.026), [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, material, paper]);
    mesh.position.y = H / 2; mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh); pack.add(pivot); panels.push(pivot); outerMaterials.push(material);
  }
  const lid = new THREE.Group(); lid.position.y = H + 0.06; pack.add(lid);
  const lidMaterial = new THREE.MeshStandardMaterial({ map: texture(plainCanvas(1024, 1024, paperColor)), roughness: 0.7 });
  const lidSideMaterial = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.65 });
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.24, 6), [lidSideMaterial, lidMaterial, paper]);
  lidMesh.rotation.y = Math.PI / 6; lidMesh.castShadow = true; lid.add(lidMesh);
  const lidBandMaterial = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.85, side: THREE.DoubleSide });
  const lidBand = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.025, 6, 1, true), lidBandMaterial);
  lidBand.rotation.y = Math.PI / 6; lidBand.position.y = -0.07; lid.add(lidBand);

  function perimeter(u, radius = R + 0.034) {
    u = (((u + 0.13) % 1) + 1) % 1;
    const f = u * 6, k = Math.floor(f), t = f - k, a = k * Math.PI / 3 - Math.PI / 6, b = a + Math.PI / 3;
    return [mix(Math.sin(a) * radius, Math.sin(b) * radius, t), mix(Math.cos(a) * radius, Math.cos(b) * radius, t)];
  }
  const columns = 96, rows = 22, filmGeometry = new THREE.BufferGeometry();
  const filmPositions = new Float32Array((columns + 1) * (rows + 1) * 3), filmUV = new Float32Array((columns + 1) * (rows + 1) * 2), filmIndices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const k = j * (columns + 1) + i; filmUV[k * 2] = i / columns; filmUV[k * 2 + 1] = j / rows;
    if (i < columns && j < rows) { const n = k + columns + 1; filmIndices.push(k, k + 1, n, k + 1, n + 1, n); }
  }
  filmGeometry.setAttribute('position', new THREE.BufferAttribute(filmPositions, 3));
  filmGeometry.setAttribute('uv', new THREE.BufferAttribute(filmUV, 2)); filmGeometry.setIndex(filmIndices);
  const filmMaterial = new THREE.MeshPhysicalMaterial({ color: '#fafcff', roughness: 0.085, metalness: 0.12, transparent: true, opacity: 0.22, transmission: 0.38, thickness: 0.012, ior: 1.38, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.1 });
  const film = new THREE.Mesh(filmGeometry, filmMaterial); film.frustumCulled = false; packRig.add(film);
  const topFilm = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.02, 6, 5), filmMaterial.clone());
  topFilm.rotation.y = Math.PI / 6; topFilm.position.y = H + 0.19; packRig.add(topFilm);

  const stripSegments = 160, stripGeometry = new THREE.BufferGeometry();
  const stripPositions = new Float32Array((stripSegments + 1) * 2 * 3), stripUV = new Float32Array((stripSegments + 1) * 2 * 2), stripIndices = [];
  for (let i = 0; i <= stripSegments; i++) {
    for (let j = 0; j < 2; j++) { stripUV[(i * 2 + j) * 2] = i / stripSegments * 8; stripUV[(i * 2 + j) * 2 + 1] = j; }
    if (i < stripSegments) { const k = i * 2; stripIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  stripGeometry.setAttribute('position', new THREE.BufferAttribute(stripPositions, 3)); stripGeometry.setAttribute('uv', new THREE.BufferAttribute(stripUV, 2)); stripGeometry.setIndex(stripIndices);
  function stripCanvas() {
    const image = plainCanvas(512, 64, paperColor), context = image.getContext('2d');
    context.fillStyle = inkColor; context.font = 'bold 25px sans-serif'; context.fillText('PULL  /  OPEN  /  RIP', 16, 42);
    context.setLineDash([7, 5]); context.strokeStyle = inkColor; context.beginPath();
    context.moveTo(0, 4); context.lineTo(512, 4); context.moveTo(0, 60); context.lineTo(512, 60); context.stroke(); return image;
  }
  const stripMaterial = new THREE.MeshStandardMaterial({ map: texture(stripCanvas()), roughness: 0.93, side: THREE.DoubleSide });
  const strip = new THREE.Mesh(stripGeometry, stripMaterial); strip.frustumCulled = false; packRig.add(strip);
  const tabBase = new THREE.Vector3(perimeter(0, R + 0.047)[0], H - 0.28, perimeter(0, R + 0.047)[1] + 0.035);
  const tab = new THREE.Group(); tab.position.copy(tabBase); packRig.add(tab);
  const tabMaterial = new THREE.MeshStandardMaterial({ color: paperColor, roughness: 0.9 });
  const tabMesh = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.21, 0.018), tabMaterial); tabMesh.rotation.y = -0.2; tab.add(tabMesh);
  function tabCanvas() { const c = plainCanvas(256, 128, paperColor), context = c.getContext('2d'); context.fillStyle = inkColor; context.font = 'bold 74px sans-serif'; context.fillText('PULL', 10, 90); return c; }
  const tabTextMaterial = new THREE.MeshBasicMaterial({ map: texture(tabCanvas()) });
  const tabText = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.14), tabTextMaterial); tabText.position.z = 0.012; tab.add(tabText);
  const originalMaterials = new Map();
  packRig.traverse(object => { if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (!originalMaterials.has(material)) originalMaterials.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite }); });
  let revealedAt = -1;
  function resetPackaging() {
    revealedAt = -1; packRig.visible = true;
    for (const [material, original] of originalMaterials) { Object.assign(material, original); material.needsUpdate = true; }
    packRig.traverse(object => { if (object.isMesh) object.castShadow = true; });
  }
  function fadePackaging(time) {
    if (revealedAt < 0) return;
    const alpha = 1 - smooth((time - revealedAt - 0.55) / 0.85);
    if (alpha <= 0) { packRig.visible = false; return; }
    for (const [material, original] of originalMaterials) { if (!material.transparent) { material.transparent = true; material.depthWrite = false; material.needsUpdate = true; } material.opacity = original.opacity * alpha; }
    if (alpha < 0.5) packRig.traverse(object => { if (object.isMesh) object.castShadow = false; });
  }
  const debris = [];
  for (let i = 0; i < 34; i++) {
    const fragment = new THREE.Mesh(new THREE.PlaneGeometry(0.018 + i % 5 * 0.012, 0.014 + i % 4 * 0.01), new THREE.MeshStandardMaterial({ color: i % 3 ? paperColor : inkColor, roughness: 1, side: THREE.DoubleSide }));
    fragment.visible = false; root.add(fragment); debris.push(fragment);
  }

  const characterGroup = new THREE.Group(); characterGroup.visible = false; root.add(characterGroup);
  const figurePivot = new THREE.Group(); figurePivot.position.y = 1.425; characterGroup.add(figurePivot);
  const restingOrientation = figurePivot.quaternion.clone(), releasedOrientation = new THREE.Quaternion();
  const pitchAxis = new THREE.Vector3(), yawAxis = new THREE.Vector3(), rotationDelta = new THREE.Quaternion(), verticalAxis = new THREE.Vector3(0, 1, 0);
  const modelHalfSize = new THREE.Vector3(0, 1.425, 0), modelRotationMatrix = new THREE.Matrix4();
  let character = null, characterWrapper = null, returnStartedAt = null;
  let phase = 'wrap', wrapProgress = 0, tearProgress = 0, automatic = false, opening = 0, wrapReleased = -1, tearReleased = -1, zoom = 1;
  let pointerDown = false, lastX = 0, lastY = 0, dragStartX = 0, dragStartY = 0, wrapStart = 0, tearVelocity = 0, lastSound = 0;
  let soundEnabled = true, audio = null, previous = performance.now() / 1000, clock = 0, animationFrame, destroyed = false;
  const handOffset = new THREE.Vector3(), filmPull = new THREE.Vector3(3, -1, 1), dragWorldStart = new THREE.Vector3(), dragWorldNow = new THREE.Vector3();
  const dragPlane = new THREE.Plane(), raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const labels = { grabWrap: 'Grab', grabTear: 'Pull' };
  const grab = document.createElement('button'); grab.id = 'grab-point'; grab.type = 'button';
  const grabLabel = document.createElement('span'); grab.append(grabLabel); stage.append(grab);
  let view = { width: 1, height: 1 };
  function resize() {
    const rect = canvas.getBoundingClientRect(); view = { width: Math.max(1, rect.width || stage.clientWidth), height: Math.max(1, rect.height || stage.clientHeight) };
    renderer.setSize(view.width, view.height, false); camera.aspect = view.width / view.height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(stage); observer.observe(canvas); resize();
  function pointerWorld(event, output) {
    const rect = canvas.getBoundingClientRect(); ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera); return raycaster.ray.intersectPlane(dragPlane, output);
  }
  function noise(kind, amount = 1) {
    if (!soundEnabled) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const duration = kind === 'pop' ? 0.18 : 0.065, buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
      const source = audio.createBufferSource(); source.buffer = buffer;
      const filter = audio.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = kind === 'wrap' ? 4500 : kind === 'tear' ? 2200 : 220; filter.Q.value = 0.8;
      const gain = audio.createGain(); gain.gain.value = (kind === 'pop' ? 0.3 : 0.08) * amount;
      source.connect(filter).connect(gain).connect(audio.destination); source.start();
    } catch { /* Audio is optional on browsers without an available output. */ }
  }
  function setPhase(next) {
    phase = next; canvas.dataset.phase = next; stage.dataset.phase = next;
    grabLabel.textContent = next === 'tear' ? labels.grabTear : labels.grabWrap;
    grab.setAttribute('aria-label', grabLabel.textContent);
    if (next === 'opening') noise('pop');
    if (next === 'reveal') { revealedAt = clock; characterGroup.visible = true; }
    onPhase(next);
  }
  function transitionCheck() {
    if (phase === 'wrap' && wrapProgress >= 1) {
      wrapProgress = 1; wrapReleased = clock; filmPull.copy(handOffset); if (filmPull.length() < 1) filmPull.set(3, -1, 1);
      pointerDown = automatic = false; handOffset.set(0, 0, 0); noise('wrap', 1.5); setPhase('tear'); onProgress(0);
    }
    if (phase === 'tear' && tearProgress >= 0.8) { tearReleased = clock; automatic = pointerDown = false; opening = 0; setPhase('opening'); }
  }
  function disposeCharacter() {
    if (!character) return;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    character.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); });
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const value of textures) value.dispose(); for (const value of materials) value.dispose(); for (const value of geometries) value.dispose();
    characterWrapper?.removeFromParent(); character = characterWrapper = null;
  }
  function replay() {
    automatic = pointerDown = false; wrapProgress = tearProgress = tearVelocity = opening = 0;
    wrapReleased = tearReleased = -1; handOffset.set(0, 0, 0); packRig.rotation.set(0, 0, 0); pack.visible = film.visible = topFilm.visible = strip.visible = tab.visible = true;
    topFilm.position.set(0, H + 0.19, 0); topFilm.rotation.set(0, Math.PI / 6, 0);
    characterGroup.visible = false; characterGroup.position.set(0, 0, 0); characterGroup.scale.setScalar(1);
    figurePivot.quaternion.copy(restingOrientation); figurePivot.position.y = modelHalfSize.y + 0.05; returnStartedAt = null; zoom = 1; root.rotation.set(0, -0.25, 0);
    debris.forEach(object => { object.visible = false; }); resetPackaging(); setPhase('wrap'); onProgress(0);
  }
  function setModel(object) {
    if (object === character) { replay(); return; }
    disposeCharacter(); modelHalfSize.set(0, 1.425, 0);
    if (object) {
      character = object; character.removeFromParent(); character.updateMatrixWorld(true);
      characterWrapper = new THREE.Group(); characterWrapper.add(character);
      const bounds = new THREE.Box3().setFromObject(characterWrapper), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      // Fit every axis into the closed box rather than scaling only by height.
      // A flat or wide upload must remain small enough to rotate without clipping.
      const fitRatio = Math.max(size.x / 1.9, size.y / 2.85, size.z / 1.9);
      const scale = Number.isFinite(fitRatio) && fitRatio > 1e-8 ? 1 / fitRatio : 1;
      if (!Number.isFinite(center.x + center.y + center.z)) center.set(0, 0, 0);
      characterWrapper.scale.setScalar(scale);
      characterWrapper.position.copy(center).multiplyScalar(-scale);
      modelHalfSize.copy(size).multiplyScalar(scale * 0.5);
      figurePivot.position.y = modelHalfSize.y + 0.05;
      character.traverse(object => { if (object.isMesh) { object.castShadow = object.receiveShadow = true; for (const material of Array.isArray(object.material) ? object.material : [object.material]) { if ('envMapIntensity' in material) material.envMapIntensity = 0.7; material.needsUpdate = true; } } });
      figurePivot.add(characterWrapper);
    }
    replay();
  }
  function replaceMap(material, image) { material.map?.dispose(); material.map = texture(image); material.needsUpdate = true; }
  function setPackaging({ panels: images, lid: lidImage, paper: nextPaper, ink: nextInk, background } = {}) {
    if (nextPaper) paperColor = nextPaper; if (nextInk) inkColor = nextInk;
    paper.color.set(paperColor); bottomMaterial.color.set(paperColor); lidBandMaterial.color.set(paperColor); tabMaterial.color.set(paperColor); lidSideMaterial.color.set(paperColor);
    edgeMaterial.color.set(paperColor).multiplyScalar(0.76);
    if (images) for (let i = 0; i < 6; i++) if (images[i]) replaceMap(outerMaterials[i], images[i]);
    if (lidImage) replaceMap(lidMaterial, lidImage);
    replaceMap(stripMaterial, stripCanvas()); replaceMap(tabTextMaterial, tabCanvas());
    debris.forEach((object, i) => object.material.color.set(i % 3 ? paperColor : inkColor));
    if (background) { scene.background = new THREE.Color(background); scene.fog.color.set(background); }
  }
  function advance() { if (phase !== 'wrap' && phase !== 'tear') return; noise(phase); automatic = true; }
  function setSound(enabled) { soundEnabled = Boolean(enabled); if (!soundEnabled && audio) audio.suspend(); }
  function setLabels(next = {}) { Object.assign(labels, next); grabLabel.textContent = phase === 'tear' ? labels.grabTear : labels.grabWrap; grab.setAttribute('aria-label', grabLabel.textContent); }

  function startDrag(event) {
    if (automatic || phase === 'opening') return;
    dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, H - 0.3, 0));
    pointerWorld(event, dragWorldStart);
    if (event.currentTarget !== grab && phase !== 'reveal') {
      const anchor = tab.getWorldPosition(new THREE.Vector3()).project(camera), rect = canvas.getBoundingClientRect();
      const screenX = rect.left + (anchor.x + 1) * rect.width / 2, screenY = rect.top + (1 - anchor.y) * rect.height / 2;
      const near = Math.hypot(event.clientX - screenX, event.clientY - screenY) < 85;
      if (phase === 'tear' && !near && raycaster.intersectObject(strip).length === 0) return;
      if (phase === 'wrap' && raycaster.intersectObjects([film, topFilm], false).length === 0) return;
    }
    event.preventDefault(); pointerDown = true; lastX = dragStartX = event.clientX; lastY = dragStartY = event.clientY; wrapStart = wrapProgress;
    handOffset.set(0, 0, 0); event.currentTarget.setPointerCapture(event.pointerId); noise(phase, 0.3);
  }
  function moveDrag(event) {
    if (!pointerDown) return;
    const dx = event.clientX - lastX, dy = event.clientY - lastY; lastX = event.clientX; lastY = event.clientY;
    if (phase === 'reveal') {
      pitchAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).applyAxisAngle(verticalAxis, 0.25).normalize();
      yawAxis.set(0, 1, 0).applyQuaternion(camera.quaternion).applyAxisAngle(verticalAxis, 0.25).normalize();
      rotationDelta.setFromAxisAngle(yawAxis, dx * 0.008); figurePivot.quaternion.premultiply(rotationDelta);
      rotationDelta.setFromAxisAngle(pitchAxis, dy * 0.008); figurePivot.quaternion.premultiply(rotationDelta); figurePivot.quaternion.normalize(); return;
    }
    const netX = event.clientX - dragStartX, netY = event.clientY - dragStartY;
    pointerWorld(event, dragWorldNow); handOffset.copy(dragWorldNow).sub(dragWorldStart).applyAxisAngle(verticalAxis, 0.25).multiplyScalar(0.87);
    if (phase === 'wrap') wrapProgress = clamp(wrapStart + (Math.max(0, netX) + Math.max(0, netY) * 0.65) / Math.min(view.width * 0.43, 310));
    if (phase === 'tear') { let progress = Math.max(0, netX + Math.max(0, -netY) * 0.3) / Math.min(view.width * 0.46, 330); if (progress > 0.68) progress = 0.68 + (progress - 0.68) * 0.65; tearProgress = clamp(progress, 0, 0.82); tearVelocity = 0; }
    if (performance.now() - lastSound > 42) { noise(phase, clamp(Math.hypot(dx, dy) / 7, 0.2, 1)); lastSound = performance.now(); }
  }
  function pointerEnd() {
    if (!pointerDown) return; pointerDown = false;
    if (phase === 'reveal') { releasedOrientation.copy(figurePivot.quaternion); returnStartedAt = performance.now(); }
  }
  const targets = [canvas, grab];
  for (const target of targets) {
    target.addEventListener('pointerdown', startDrag); target.addEventListener('pointermove', moveDrag);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, pointerEnd);
  }
  grab.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); } });
  function onWheel(event) { if (phase === 'reveal') { event.preventDefault(); zoom = clamp(zoom + event.deltaY * 0.0006, 0.75, 1.35); } }
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function updateFilm(time) {
    if (!film.visible) return;
    const fallen = wrapReleased < 0 ? 0 : clamp((time - wrapReleased) / 1.2), progress = wrapProgress;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      const u = i / columns, v = j / rows, k = (j * (columns + 1) + i) * 3;
      const [px, pz] = perimeter(u); let x = px, y = 0.02 + v * (H + 0.19), z = pz;
      const free = clamp((progress - u) / Math.max(0.01, progress));
      if (free > 0) {
        const f = smooth(free), curl = Math.sin(free * Math.PI * 3.5 + v * 8 + time * 2) * 0.2, crinkle = Math.sin(i * 1.8 + j * 1.1) * Math.sin(free * Math.PI) * 0.16;
        const pull = wrapReleased < 0 ? handOffset : filmPull;
        x += f * (pull.x || progress * 3.1) + curl * f;
        y = mix(y, 0.12 + Math.sin(v * 9 + i * 0.6) * 0.18, fallen * f); y -= f * progress * 1.35 + crinkle; y += Math.sin(v * Math.PI) * f * 0.4;
        z += f * (Math.max(0.5, pull.z) + Math.sin(v * 8 + free * 8) * 0.4) + crinkle;
        if (fallen > 0) { x += fallen * f * 0.7; z += fallen * f * 0.5; y = Math.max(0.018, y - fallen * 1.2 * f); }
      }
      filmPositions[k] = x; filmPositions[k + 1] = y; filmPositions[k + 2] = z;
    }
    filmGeometry.attributes.position.needsUpdate = true; filmGeometry.computeVertexNormals();
    filmMaterial.opacity = 0.22 * (1 - smooth((fallen - 0.65) / 0.35)); if (fallen >= 1) film.visible = false;
    topFilm.material.opacity = 0.25 * (1 - smooth(progress * 1.4)); topFilm.position.x = progress * 0.7; topFilm.rotation.z = progress * 0.4; if (progress > 0.8) topFilm.visible = false;
  }
  function updateStrip(time) {
    if (!strip.visible) return;
    const fly = tearReleased < 0 ? 0 : clamp((time - tearReleased) / 1.2);
    for (let i = 0; i <= stripSegments; i++) {
      const u = i / stripSegments, [px, pz] = perimeter(u, R + 0.047), free = clamp((tearProgress - u) / Math.max(0.001, tearProgress));
      for (let j = 0; j < 2; j++) {
        const k = (i * 2 + j) * 3, jagged = Math.sin(i * 7.3) * 0.008 + Math.sin(i * 3.5) * 0.004;
        let x = px, y = H - 0.28 + (j - 0.5) * (0.15 + jagged), z = pz;
        if (free > 0) {
          const w = smooth(free); x += w * handOffset.x; y += w * handOffset.y + Math.sin(free * Math.PI) * 0.1; z += w * handOffset.z + Math.sin(free * Math.PI) * 0.42;
          x += Math.sin(free * Math.PI * 2) * Math.sin(free * Math.PI) * 0.17; y -= fly * (1 + free) * 2.5; z += fly * free * 1.2; x += fly * free * 2;
        }
        stripPositions[k] = x; stripPositions[k + 1] = y; stripPositions[k + 2] = z;
      }
    }
    stripGeometry.attributes.position.needsUpdate = true; stripGeometry.computeVertexNormals();
    tab.visible = phase === 'wrap' || phase === 'tear'; tab.position.copy(tabBase).add(handOffset);
    tab.rotation.y = clamp(handOffset.x * 0.2, -0.35, 0.35); tab.rotation.z = clamp(handOffset.y * 0.2, -0.2, 0.2); if (fly >= 1) strip.visible = false;
  }
  function frame(nowMilliseconds) {
    if (destroyed) return; animationFrame = requestAnimationFrame(frame);
    const now = nowMilliseconds / 1000, dt = Math.min(0.04, now - previous); previous = now; clock += dt;
    if (automatic) {
      if (phase === 'wrap') { wrapProgress = clamp(wrapProgress + dt * 0.8); handOffset.set(wrapProgress * 3, -wrapProgress * 0.8, wrapProgress * 0.6); }
      if (phase === 'tear') { tearProgress = clamp(tearProgress + dt * 0.5); handOffset.set(tearProgress * 3.7, tearProgress * 0.08, tearProgress * 0.65); }
      if (Math.floor(clock * 24) !== Math.floor((clock - dt) * 24)) noise(phase, 0.35);
    }
    if (phase === 'tear' && !pointerDown && !automatic && tearProgress > 0) {
      const before = tearProgress; tearVelocity += (-110 * tearProgress - 19 * tearVelocity) * dt; tearProgress = Math.max(0, tearProgress + tearVelocity * dt);
      if (tearProgress < 0.001) tearProgress = tearVelocity = 0; handOffset.multiplyScalar(before > 0 ? tearProgress / before : 0);
    }
    transitionCheck();
    if (phase === 'wrap' || phase === 'tear') onProgress(clamp(phase === 'wrap' ? wrapProgress : tearProgress / 0.8));
    if (phase === 'opening') { opening = clamp(opening + dt / (reduced ? 1 : 3.15)); tearProgress = 0.8 + 0.2 * smooth(opening / 0.35); onProgress(opening); if (opening === 1) setPhase('reveal'); }
    const lidProgress = clamp((opening - 0.38) / 0.48), lidEase = ease(lidProgress);
    for (let i = 0; i < 6; i++) { const local = clamp((opening - 0.52 - i * 0.018) / 0.4), bounce = 1 - Math.exp(-6 * local) * Math.cos(6 * local); panels[i].rotation.x = clamp(local === 1 ? 1 : bounce, 0, 1.045) * 1.55; }
    packRig.rotation.y = opening > 0 ? -Math.PI * 2 * smooth(opening / 0.53) : 0;
    lid.position.set(lidEase * 2.8, H + 0.06 + Math.sin(Math.min(1, lidProgress * 1.35) * Math.PI) * 3.2 - lidEase * 3.1, -lidEase * 2.1);
    lid.rotation.set(lidEase * 1.7, lidEase * 0.8, lidEase * 1.3); lid.visible = opening < 0.96;
    if (opening > 0.54 || phase === 'reveal') { const rise = ease((opening - 0.54) / 0.38); characterGroup.visible = true; characterGroup.position.y = (1 - rise) * -0.2; characterGroup.scale.setScalar(0.94 + 0.06 * rise); }
    root.rotation.y = -0.25;
    if (phase !== 'reveal' || pointerDown) returnStartedAt = null;
    else if (returnStartedAt !== null) { const progress = reduced ? 1 : clamp((nowMilliseconds - returnStartedAt) / 550); figurePivot.quaternion.slerpQuaternions(releasedOrientation, restingOrientation, smooth(progress)); if (progress === 1) returnStartedAt = null; }
    // Keep the rotated asset above the floor while preserving a true centre pivot.
    modelRotationMatrix.makeRotationFromQuaternion(figurePivot.quaternion);
    const rotation = modelRotationMatrix.elements;
    figurePivot.position.y = 0.05 + Math.abs(rotation[1]) * modelHalfSize.x + Math.abs(rotation[5]) * modelHalfSize.y + Math.abs(rotation[9]) * modelHalfSize.z;
    if (tearProgress > 0.02) for (let i = 0; i < debris.length; i++) {
      const object = debris[i], start = i / debris.length * 0.85, time = tearProgress - start + (phase === 'opening' || phase === 'reveal' ? (clock - tearReleased) * 0.65 : 0);
      object.visible = time > 0 && time < 1.5;
      if (object.visible) { object.position.set(1 + time * 2 + Math.sin(i * 2.7) * 0.3, H - 0.25 - time * time * 2.6 + Math.sin(i) * 0.12, 1 + Math.cos(i * 3.1) * time); object.rotation.set(time * 5 + i, time * 3 + i, time * 7); }
    }
    updateFilm(clock); updateStrip(clock);
    const narrow = camera.aspect < 0.62 ? 1 + (0.62 - camera.aspect) * 0.8 : 1;
    const distance = 12.8 * zoom;
    const revealFraming = smooth((opening - 0.54) / 0.46);
    const targetHeight = mix(1.3, Math.max(0.35, figurePivot.position.y), revealFraming);
    camera.position.set(4.1 * distance / 11.4, 5.1 * distance / 11.4, 8.9 * distance / 11.4 * narrow); camera.lookAt(0, targetHeight, 0);
    root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const anchor = tab.getWorldPosition(new THREE.Vector3()).project(camera), canvasRect = canvas.getBoundingClientRect(), stageRect = stage.getBoundingClientRect();
    grab.hidden = automatic || !(phase === 'wrap' || phase === 'tear');
    grab.style.left = (canvasRect.left - stageRect.left + (anchor.x + 1) * canvasRect.width / 2) + 'px';
    grab.style.top = (canvasRect.top - stageRect.top + (1 - anchor.y) * canvasRect.height / 2) + 'px'; grab.dataset.phase = phase;
    canvas.dataset.progress = (phase === 'wrap' ? wrapProgress : tearProgress).toFixed(3); canvas.dataset.opening = opening.toFixed(3);
    canvas.dataset.modelReady = String(Boolean(character)); fadePackaging(clock); canvas.dataset.packagingVisible = String(packRig.visible);
    renderer.render(scene, camera);
  }
  replay(); animationFrame = requestAnimationFrame(frame);

  return { setModel, setPackaging, replay, advance, setSound, setLabels,
    dispose() {
      destroyed = true; cancelAnimationFrame(animationFrame); observer.disconnect(); disposeCharacter(); grab.remove();
      for (const target of targets) { target.removeEventListener('pointerdown', startDrag); target.removeEventListener('pointermove', moveDrag); for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.removeEventListener(type, pointerEnd); }
      canvas.removeEventListener('wheel', onWheel); scene.traverse(object => { object.geometry?.dispose(); if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.map?.dispose(); material.dispose(); } });
      environment.dispose(); renderer.dispose(); audio?.close();
    },
  };
}
