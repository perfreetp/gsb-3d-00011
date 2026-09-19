import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildWorld } from './world.js';
import { GarageSim } from './sim.js';
import { GarageUI } from './ui.js';

// ---------- 渲染器 / 场景 / 相机 ----------
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2129);
scene.fog = new THREE.Fog(0x1a2129, 60, 130);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
camera.position.set(-20, 15, 24);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(8, 3.5, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.maxDistance = 90;

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x2a2f36, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-18, 30, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);

// ---------- 世界 / 仿真 / UI ----------
const world = buildWorld(scene);
const sim = new GarageSim(scene, world);
const ui = new GarageUI(sim);

// ---------- 点击车位取车 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.slotHitMeshes);
  if (hits.length > 0) {
    const slot = sim.slots.get(hits[0].object.userData.slotKey);
    if (slot && slot.car) sim.requestRetrieve(slot.car.id);
  }
});

// ---------- 自适应尺寸 ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 主循环 ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  sim.update(dt);
  ui.update();

  // 目标车位指示灯闪烁
  if (sim.currentTask) {
    const t = sim.currentTask;
    const key = `${t.slot.f}-${t.slot.c}-${t.slot.s}`;
    const marker = world.slotMarkers.get(key);
    marker.material.emissiveIntensity = 0.6 + 0.5 * Math.sin(performance.now() / 120);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// 演示：预停几辆车
sim.requestPark();
sim.requestPark();
sim.requestPark();
