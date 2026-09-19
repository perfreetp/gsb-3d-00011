import * as THREE from 'three';
import { CFG, LIFT_X, AISLE_Z, SLOT_Z, ENTRANCE_X, slotX, layerY, slotLabel } from './config.js';
import { createCarMesh, randomColor } from './car.js';

// 单轴运动控制器：设备每个轴同一时刻只有一个目标位置，
// 新指令直接取代旧目标，避免多条运动指令互相冲突死锁。
class Axis {
  constructor(get, set, speed) {
    this.get = get;
    this.set = set;
    this.speed = speed;
    this.target = null;
    this.waiters = [];
  }

  moveTo(target) {
    // 被取代的旧指令立即放行（调用方通常不再关心）
    const stale = this.waiters;
    this.waiters = [];
    stale.forEach((resolve) => resolve());
    this.target = target;
    if (Math.abs(this.get() - target) < 1e-4) {
      this.target = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get busy() {
    return this.target !== null;
  }

  update(dt) {
    if (this.target === null) return;
    const cur = this.get();
    const diff = this.target - cur;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), this.speed * dt);
    this.set(cur + step);
    if (Math.abs(this.target - (cur + step)) < 1e-4) {
      this.target = null;
      const done = this.waiters;
      this.waiters = [];
      done.forEach((resolve) => resolve());
    }
  }
}

// ---------------- 升降机 ----------------
class Lift {
  constructor(scene) {
    this.state = '空闲';
    const totalH = CFG.layers * CFG.layerH + 1.0;
    const group = new THREE.Group();
    group.position.set(LIFT_X, 0, AISLE_Z);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xd98e2b, metalness: 0.3, roughness: 0.6 });
    const postGeo = new THREE.BoxGeometry(0.2, totalH, 0.2);
    for (const [x, z] of [[-1.55, -2.4], [1.55, -2.4], [-1.55, 2.4], [1.55, 2.4]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, totalH / 2, z);
      post.castShadow = true;
      group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.25, 5.0), postMat);
    beam.position.y = totalH;
    group.add(beam);

    // 载车平台（含转盘，可绕 y 轴旋转）
    this.platform = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.15, 4.8),
      new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.5, roughness: 0.4 })
    );
    deck.position.y = 0.075;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.platform.add(deck);
    group.add(this.platform);

    scene.add(group);

    this.axisY = new Axis(
      () => this.platform.position.y,
      (v) => (this.platform.position.y = v),
      CFG.liftSpeed
    );
    this.axisR = new Axis(
      () => this.platform.rotation.y,
      (v) => (this.platform.rotation.y = v),
      CFG.rotateSpeed
    );
  }

  get y() { return this.platform.position.y; }
  topY() { return this.platform.position.y + 0.15; }
  rotY() { return this.platform.rotation.y; }
  posX() { return LIFT_X; }
  posZ() { return AISLE_Z; }

  moveYTo(target) {
    return this.axisY.moveTo(target);
  }

  rotateTo(angle) {
    return this.axisR.moveTo(angle);
  }

  reset() {
    this.moveYTo(0);
    this.rotateTo(0);
  }

  update(dt) {
    this.axisY.update(dt);
    this.axisR.update(dt);
    if (this.axisY.busy) {
      this.state = this.axisY.target > this.y ? '上升中' : '下降中';
    } else if (this.axisR.busy) {
      this.state = '转盘换向';
    } else {
      this.state = '空闲';
    }
  }
}

// ---------------- 横移台车（每层一台） ----------------
class Shuttle {
  constructor(scene, layer) {
    this.layer = layer;
    this.state = '空闲';
    this.group = new THREE.Group();
    this.group.position.set(0, layerY(layer), AISLE_Z);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.15, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x3a7bd5, metalness: 0.4, roughness: 0.5 })
    );
    deck.position.y = 0.075;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.group.add(deck);

    scene.add(this.group);

    this.axisX = new Axis(
      () => this.group.position.x,
      (v) => (this.group.position.x = v),
      CFG.shuttleSpeed
    );
  }

  get x() { return this.group.position.x; }
  topY() { return layerY(this.layer) + 0.15; }
  rotY() { return 0; }
  posZ() { return AISLE_Z; }

  moveXTo(target) {
    return this.axisX.moveTo(target);
  }

  update(dt) {
    this.axisX.update(dt);
    this.state = this.axisX.busy ? '横移中' : '空闲';
  }
}

// ---------------- 世界 ----------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.cars = new Map(); // plate -> car
    this.slots = [];
    this.slotMeshes = [];

    this.buildGround();
    this.buildRack();
    this.lift = new Lift(scene);
    this.shuttles = [];
    for (let l = 0; l < CFG.layers; l++) this.shuttles.push(new Shuttle(scene, l));
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 60),
      new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(4, -0.01, 6);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 巷道地面标识线
    const aisleLine = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.cols * CFG.colW + CFG.colW * 2, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x4a5563 })
    );
    aisleLine.rotation.x = -Math.PI / 2;
    aisleLine.position.set(slotX(CFG.cols - 1) / 2 + LIFT_X / 2, 0.005, 0.3);
    this.scene.add(aisleLine);
  }

  buildRack() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b6b7c, metalness: 0.5, roughness: 0.5 });
    const totalH = CFG.layers * CFG.layerH;
    const zFront = CFG.aisleD + 0.15;
    const zBack = CFG.aisleD + CFG.slotD - 0.15;

    // 立柱
    const postGeo = new THREE.BoxGeometry(0.18, totalH, 0.18);
    for (let c = 0; c <= CFG.cols; c++) {
      const x = c * CFG.colW - CFG.colW / 2;
      for (const z of [zFront, zBack]) {
        const post = new THREE.Mesh(postGeo, steel);
        post.position.set(x, totalH / 2, z);
        post.castShadow = true;
        this.scene.add(post);
      }
    }

    // 横梁
    const beamLen = CFG.cols * CFG.colW;
    const beamGeo = new THREE.BoxGeometry(beamLen, 0.15, 0.15);
    for (let l = 1; l <= CFG.layers; l++) {
      for (const z of [zFront, zBack]) {
        const beam = new THREE.Mesh(beamGeo, steel);
        beam.position.set(slotX(CFG.cols - 1) / 2, l * CFG.layerH, z);
        this.scene.add(beam);
      }
    }

    // 车位载车板
    const palletGeo = new THREE.BoxGeometry(CFG.colW - 0.6, 0.12, CFG.slotD - 0.4);
    for (let l = 0; l < CFG.layers; l++) {
      for (let c = 0; c < CFG.cols; c++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x3d4756, metalness: 0.3, roughness: 0.7 });
        const pallet = new THREE.Mesh(palletGeo, mat);
        pallet.position.set(slotX(c), layerY(l) + 0.06, SLOT_Z);
        pallet.receiveShadow = true;
        this.scene.add(pallet);

        const slot = {
          layer: l,
          col: c,
          car: null,
          reserved: false,
          highlight: false,
          pallet,
          mat,
          label: null,
        };
        slot.label = slotLabel(slot);
        pallet.userData.slot = slot;
        this.slots.push(slot);
        this.slotMeshes.push(pallet);
      }
    }
  }

  findFreeSlot() {
    return this.slots.find((s) => !s.car && !s.reserved) || null;
  }

  occupancy() {
    const used = this.slots.filter((s) => s.car).length;
    return { used, total: this.slots.length };
  }

  spawnCar(plate) {
    const mesh = createCarMesh(randomColor(), plate);
    mesh.position.set(ENTRANCE_X, 0, AISLE_Z);
    mesh.rotation.y = Math.PI / 2; // 车头朝 +x，驶向升降机
    this.scene.add(mesh);
    const car = { plate, mesh, carrier: null, rotOffset: 0, slot: null };
    this.cars.set(plate, car);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars.delete(car.plate);
  }

  parkedCars() {
    return [...this.cars.values()].filter((c) => c.slot);
  }

  update(dt) {
    this.time += dt;
    // 设备运动学更新
    this.lift.update(dt);
    for (const s of this.shuttles) s.update(dt);
    // 车辆随载具（升降机/横移台车）联动
    for (const car of this.cars.values()) {
      const c = car.carrier;
      if (!c) continue;
      car.mesh.position.set(c.posX !== undefined ? c.posX() : c.x, c.topY(), c.posZ());
      car.mesh.rotation.y = c.rotY() + car.rotOffset;
    }
    // 目标车位高亮闪烁
    const pulse = 0.35 + 0.3 * Math.sin(this.time * 6);
    for (const s of this.slots) {
      if (s.highlight) {
        s.mat.emissive.setHex(0x27ae60);
        s.mat.emissiveIntensity = pulse;
      } else {
        s.mat.emissiveIntensity = 0;
      }
    }
  }
}
