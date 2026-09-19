import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { CFG, SPEED, slotX, layerY } from './config.js';
import { updateTweens } from './tween.js';
import { World } from './world.js';
import { Engine } from './sim.js';
import * as ui from './ui.js';

// ---------------- 场景 ----------------
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 40, 90);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const centerX = slotX(CFG.cols - 1) / 2;
const centerY = layerY(CFG.layers - 1) / 2;
camera.position.set(centerX + 13, centerY + 11, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(centerX - 2, centerY, 4);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------------- 灯光 ----------------
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f36, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(18, 26, 14);
sun.castShadow = true;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ---------------- 世界与任务引擎 ----------------
const world = new World(scene);
const engine = new Engine(world);
engine.onChange = () => ui.renderCarList(world, engine);
ui.renderCarList(world, engine);

// ---------------- 交互 ----------------
const PLATE_PREFIX = ['京', '沪', '粤', '浙', '川'];
const PLATE_LETTER = 'ABCDEFGHJKLMNP';
function randomPlate() {
  const p = PLATE_PREFIX[Math.floor(Math.random() * PLATE_PREFIX.length)];
  const l = PLATE_LETTER[Math.floor(Math.random() * PLATE_LETTER.length)];
  const n = String(Math.floor(10000 + Math.random() * 90000));
  return `${p}${l}${n}`;
}

function submitStore() {
  const input = document.getElementById('plateInput');
  const plate = input.value.trim() || randomPlate();
  input.value = '';
  engine.submitStore(plate);
}

document.getElementById('btnStore').onclick = submitStore;
document.getElementById('btnRandom').onclick = () => engine.submitStore(randomPlate());
document.getElementById('plateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitStore();
});

const speedRange = document.getElementById('speedRange');
speedRange.addEventListener('input', () => {
  SPEED.mul = parseFloat(speedRange.value);
  document.getElementById('speedText').textContent = `${SPEED.mul.toFixed(1)}x`;
});

// 点击 3D 车位取车
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.slotMeshes);
  if (hits.length === 0) return;
  const slot = hits[0].object.userData.slot;
  if (slot.car) {
    engine.submitRetrieve(slot.car);
  } else {
    ui.log(`车位 ${slot.label} 空闲`);
  }
});

// 操作提示
const tip = document.createElement('div');
tip.id = 'tip';
tip.textContent = '拖拽旋转视角 · 滚轮缩放 · 点击已占用车位可直接取车';
viewport.appendChild(tip);

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05) * SPEED.mul;
  updateTweens(dt);
  world.update(dt);
  controls.update();
  renderer.render(scene, camera);
  ui.refresh(world, engine);
}
animate();

ui.log('系统就绪：3 层 × 5 列，升降机 + 横移台车联动');
