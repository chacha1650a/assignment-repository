import * as THREE from "three";

const canvas = document.getElementById("scene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (err) {
  document.documentElement.classList.add("no-webgl");
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const BG = new THREE.Color("#12151d");
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 10, 24);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const cameraBase = new THREE.Vector3(0, 0.4, 11);
camera.position.copy(cameraBase);

// 조명: 은은한 푸른 환경광 + 따뜻한 주황 광원 + 차가운 역광
scene.add(new THREE.HemisphereLight("#6f7fa6", "#0a0c11", 0.32));

const rim = new THREE.DirectionalLight("#5a74c9", 0.55);
rim.position.set(-6, 3, -5);
scene.add(rim);

const warmPos = new THREE.Vector3(1.3, 2.5, 0.9);
const warm = new THREE.PointLight("#ff9448", 55, 22, 1.5);
warm.position.copy(warmPos);
warm.castShadow = true;
warm.shadow.mapSize.set(1024, 1024);
warm.shadow.bias = -0.002;
warm.shadow.radius = 6;
scene.add(warm);

const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 48, 48),
  new THREE.MeshBasicMaterial({ color: "#ffd3a1" })
);
scene.add(orb);

function makeGlowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,200,150,0.55)");
  g.addColorStop(0.5, "rgba(255,140,70,0.14)");
  g.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: "#ff9a52",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
glow.scale.set(3.4, 3.4, 1);
scene.add(glow);

// 바닥: 그림자만 받는 어두운 면
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: "#171b24", roughness: 1, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.4;
floor.receiveShadow = true;
scene.add(floor);

// 떠 있는 물체들
const cubeMat = new THREE.MeshStandardMaterial({ color: "#2c3342", roughness: 0.5, metalness: 0.18 });
const darkMat = new THREE.MeshStandardMaterial({ color: "#0f1218", roughness: 0.35, metalness: 0.3 });

const specs = [
  { geo: new THREE.BoxGeometry(2.3, 2.3, 2.3), mat: cubeMat, pos: [0.2, -0.1, -1.2], rot: [0.62, 0.78, 0.1], amp: 0.18, speed: 0.45 },
  { geo: new THREE.BoxGeometry(1.7, 1.7, 1.7), mat: cubeMat, pos: [-3.8, 1.5, -2.8], rot: [0.3, 0.5, 0.2], amp: 0.25, speed: 0.35 },
  { geo: new THREE.BoxGeometry(1.9, 1.9, 1.9), mat: cubeMat, pos: [3.3, -2.0, -1.8], rot: [0.9, 0.2, 0.5], amp: 0.2, speed: 0.4 },
  { geo: new THREE.BoxGeometry(0.85, 0.85, 0.85), mat: cubeMat, pos: [4.2, 2.3, -3.4], rot: [0.4, 0.9, 0.3], amp: 0.3, speed: 0.55 },
  { geo: new THREE.BoxGeometry(1.05, 1.05, 1.05), mat: cubeMat, pos: [-2.9, -2.2, 0.2], rot: [0.2, 0.3, 0.8], amp: 0.22, speed: 0.5 },
  { geo: new THREE.CylinderGeometry(0.38, 0.38, 1.3, 40), mat: darkMat, pos: [2.5, 1.7, -0.6], rot: [0.5, 0, 0.9], amp: 0.16, speed: 0.6 },
];

const objects = specs.map((s, i) => {
  const mesh = new THREE.Mesh(s.geo, s.mat);
  mesh.position.set(...s.pos);
  mesh.rotation.set(...s.rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, baseY: s.pos[1], amp: s.amp, speed: s.speed, phase: i * 1.37, spin: 0.04 + (i % 3) * 0.02 };
});

// 크기 대응
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  cameraBase.z = camera.aspect < 0.8 ? 17 : camera.aspect < 1.2 ? 14 : 11;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// 마우스를 따라 장면이 살짝 기울어짐
const pointer = { x: 0, y: 0 };
window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
});

const clock = new THREE.Clock();

function frame() {
  const t = clock.getElapsedTime();

  for (const o of objects) {
    o.mesh.position.y = o.baseY + Math.sin(t * o.speed + o.phase) * o.amp;
    o.mesh.rotation.y += o.spin * 0.01;
    o.mesh.rotation.x += o.spin * 0.004;
  }

  const lx = warmPos.x + Math.sin(t * 0.3) * 0.25;
  const ly = warmPos.y + Math.sin(t * 0.5) * 0.12;
  warm.position.set(lx, ly, warmPos.z);
  orb.position.copy(warm.position);
  glow.position.copy(warm.position);
  glow.material.opacity = 0.85 + Math.sin(t * 1.4) * 0.08;

  camera.position.x += (cameraBase.x + pointer.x * 0.9 - camera.position.x) * 0.04;
  camera.position.y += (cameraBase.y - pointer.y * 0.5 - camera.position.y) * 0.04;
  camera.position.z += (cameraBase.z - camera.position.z) * 0.06;
  camera.lookAt(0, 0, -0.5);

  renderer.render(scene, camera);
}

function renderStatic() {
  camera.position.copy(cameraBase);
  camera.lookAt(0, 0, -0.5);
  orb.position.copy(warmPos);
  glow.position.copy(warmPos);
  renderer.render(scene, camera);
}

if (reduceMotion) {
  renderStatic();
  window.addEventListener("resize", renderStatic);
} else {
  renderer.setAnimationLoop(frame);
  document.addEventListener("visibilitychange", () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
  });
}

document.documentElement.classList.add("webgl-ready");
