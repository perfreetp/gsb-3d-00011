import * as THREE from 'three';
import { CONFIG, slotKey, slotName, slotPosition } from './config.js';
import { MotionAxis } from './motion.js';
import { createCarMesh } from './world.js';

const CAR_COLORS = [0xd94f4f, 0x4f7ad9, 0x4fd9a3, 0xd9c04f, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x34495e, 0x16a085, 0xf06292];
const PLATE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

let carSeq = 0;

function makePlate() {
  let s = '';
  for (let i = 0; i < 5; i++) s += PLATE_CHARS[Math.floor(Math.random() * PLATE_CHARS.length)];
  return `京${PLATE_CHARS[Math.floor(Math.random() * 26)]}·${s}`;
}

/** 一个任务步骤：start() 启动，done() 每帧查询，onDone() 收尾动作 */
function step(name, start, done, onDone) {
  return { name, start, done, onDone, started: false };
}

export class GarageSim {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.timeScale = 1;

    // 设备运动轴
    this.stackerAxis = new MotionAxis('横移台车', { position: CONFIG.homeX, ...CONFIG.stacker });
    this.liftAxis = new MotionAxis('升降平台', { position: 0, ...CONFIG.lift });
    this.forkAxis = new MotionAxis('伸缩货叉', { position: 0, ...CONFIG.fork });
    this.jogAxis = new MotionAxis('货叉托举', { position: 0, ...CONFIG.jog });

    // 车位状态：key -> { f, c, s, car }
    this.slots = new Map();
    for (let f = 0; f < CONFIG.floors; f++)
      for (let c = 0; c < CONFIG.cols; c++)
        for (let s = 0; s < CONFIG.sides; s++)
          this.slots.set(slotKey(f, c, s), { f, c, s, car: null });

    this.cars = [];            // 所有在场车辆
    this.taskQueue = [];       // 等待执行的任务
    this.currentTask = null;   // 正在执行的任务
    this.logs = [];
    this.listeners = { slots: [], cars: [], log: [] };
  }

  on(event, fn) { this.listeners[event].push(fn); }
  emit(event, ...args) { this.listeners[event].forEach(fn => fn(...args)); }

  log(msg) {
    const t = new Date();
    const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    this.logs.unshift({ ts, msg });
    if (this.logs.length > 30) this.logs.pop();
    this.emit('log');
  }

  get totalSlots() { return this.slots.size; }
  get occupiedSlots() { return [...this.slots.values()].filter(s => s.car).length; }

  floorStats() {
    const stats = [];
    for (let f = 0; f < CONFIG.floors; f++) {
      let occ = 0;
      for (const s of this.slots.values()) if (s.f === f && s.car) occ++;
      stats.push({ floor: f + 1, occ, total: CONFIG.cols * CONFIG.sides });
    }
    return stats;
  }

  /** 自动分配车位：最低层、离出入口最近优先 */
  allocateSlot() {
    for (let f = 0; f < CONFIG.floors; f++)
      for (let c = 0; c < CONFIG.cols; c++)
        for (let s = 0; s < CONFIG.sides; s++) {
          const slot = this.slots.get(slotKey(f, c, s));
          if (!slot.car && !slot.reserved) return slot;
        }
    return null;
  }

  waitingCars() { return this.cars.filter(c => c.state === 'waiting'); }

  /** 用户请求：新车入库 */
  requestPark() {
    const slot = this.allocateSlot();
    if (!slot) { this.log('车库已满，无法入库'); return null; }
    slot.reserved = true;

    const color = CAR_COLORS[carSeq % CAR_COLORS.length];
    const mesh = createCarMesh(color);
    const waitIdx = this.waitingCars().length;
    const waitX = CONFIG.waitX0 - waitIdx * CONFIG.waitGap;
    mesh.position.set(CONFIG.spawnX, 0, 0);
    this.scene.add(mesh);

    const car = {
      id: ++carSeq, plate: makePlate(), color,
      mesh, slot: null, state: 'waiting',
      driveAxis: new MotionAxis('车辆行走', { position: CONFIG.spawnX, ...CONFIG.car }),
      driveTarget: waitX,
    };
    car.driveAxis.setTarget(waitX);
    this.cars.push(car);

    const name = slotName(slot.f, slot.c, slot.s);
    this.taskQueue.push({ type: 'park', car, slot, steps: null, stepIndex: 0 });
    this.log(`新车 ${car.plate} 到达，分配车位 ${name}，排队入库`);
    this.emit('cars');
    this.emit('slots');
    return car;
  }

  /** 用户请求：取车 */
  requestRetrieve(carId) {
    const car = this.cars.find(c => c.id === carId);
    if (!car || car.state !== 'parked') return;
    const queued = this.taskQueue.some(t => t.car === car) || (this.currentTask && this.currentTask.car === car);
    if (queued) return;
    car.state = 'retrieve-queued';
    car.slot.reserved = true;
    this.taskQueue.push({ type: 'retrieve', car, slot: car.slot, steps: null, stepIndex: 0 });
    this.log(`收到取车请求：${car.plate}（${slotName(car.slot.f, car.slot.c, car.slot.s)}）`);
    this.emit('cars');
  }

  // ---------------- 任务步骤构建 ----------------

  axisStep(name, moves, onDone) {
    return step(name,
      () => moves.forEach(([axis, t]) => axis.setTarget(t)),
      () => moves.every(([axis]) => axis.atTarget),
      onDone);
  }

  buildParkSteps(task) {
    const { car, slot } = task;
    const pos = slotPosition(slot.f, slot.c, slot.s);
    const W = this.world;
    return [
      this.axisStep('等待车辆驶上升降平台', [[this.stackerAxis, CONFIG.homeX], [this.liftAxis, 0]],
        () => { car.driveTarget = CONFIG.homeX; car.driveAxis.setTarget(CONFIG.homeX); }),
      step('车辆驶入升降平台', () => {},
        () => car.driveAxis.atTarget,
        () => { W.platformCarAnchor.attach(car.mesh); car.state = 'parking'; this.emit('cars'); }),
      this.axisStep(`升降平台升至 ${slot.f + 1} 层，台车横移至第 ${slot.c + 1} 列`,
        [[this.liftAxis, pos.y], [this.stackerAxis, pos.x]]),
      step('货叉微升托举车辆', () => {
        W.forkCarAnchor.attach(car.mesh);
        this.jogAxis.setTarget(CONFIG.jogUp);
      }, () => this.jogAxis.atTarget),
      this.axisStep(`货叉伸出，车辆送入 ${slotName(slot.f, slot.c, slot.s)}`, [[this.forkAxis, pos.z]]),
      this.axisStep('货叉下降，车辆落位', [[this.jogAxis, 0]],
        () => {
          W.slotAnchors.get(slotKey(slot.f, slot.c, slot.s)).attach(car.mesh);
          slot.car = car; slot.reserved = false; car.slot = slot; car.state = 'parked';
          this.emit('slots'); this.emit('cars');
        }),
      this.axisStep('货叉收回中位', [[this.forkAxis, 0]]),
      this.axisStep('设备复位待命', [[this.stackerAxis, CONFIG.homeX], [this.liftAxis, 0]]),
    ];
  }

  buildRetrieveSteps(task) {
    const { car, slot } = task;
    const pos = slotPosition(slot.f, slot.c, slot.s);
    const W = this.world;
    return [
      this.axisStep(`台车横移 + 升降平台定位至 ${slotName(slot.f, slot.c, slot.s)}`,
        [[this.liftAxis, pos.y], [this.stackerAxis, pos.x]]),
      this.axisStep('货叉空载伸出', [[this.forkAxis, pos.z]]),
      step('货叉托举车辆（挂接）', () => { W.forkCarAnchor.attach(car.mesh); }, () => true),
      this.axisStep('货叉微升取出车辆', [[this.jogAxis, CONFIG.jogUp]],
        () => {
          slot.car = null; slot.reserved = false; car.slot = null; car.state = 'retrieving';
          this.emit('slots'); this.emit('cars');
        }),
      this.axisStep('货叉载车收回', [[this.forkAxis, 0]]),
      this.axisStep('货叉下降，车辆落平台', [[this.jogAxis, 0]],
        () => { W.platformCarAnchor.attach(car.mesh); }),
      this.axisStep('设备返回出入口', [[this.stackerAxis, CONFIG.homeX], [this.liftAxis, 0]]),
      step('车辆驶出车库', () => {
          this.scene.attach(car.mesh);
          car.driveAxis.pos = car.mesh.position.x;
          car.driveAxis.vel = 0;
          car.driveAxis.setTarget(CONFIG.exitX);
          car.driveTarget = CONFIG.exitX;
        },
        () => car.driveAxis.atTarget,
        () => {
          this.scene.remove(car.mesh);
          car.state = 'gone';
          this.cars = this.cars.filter(c => c !== car);
          this.log(`${car.plate} 已出库`);
          this.emit('cars');
        }),
    ];
  }

  // ---------------- 主循环 ----------------

  update(dt) {
    const sdt = dt * this.timeScale;

    // 设备轴推进
    this.stackerAxis.update(sdt);
    this.liftAxis.update(sdt);
    this.forkAxis.update(sdt);
    this.jogAxis.update(sdt);

    // 同步到 3D 场景
    this.world.stackerGroup.position.x = this.stackerAxis.pos;
    this.world.platformGroup.position.y = this.liftAxis.pos;
    this.world.forkGroup.position.z = this.forkAxis.pos;
    this.world.forkGroup.position.y = this.jogAxis.pos;

    // 车辆自行走（排队等候 / 驶入平台 / 驶出）
    for (const car of this.cars) {
      if (car.mesh.parent === this.scene && car.driveTarget !== null) {
        car.driveAxis.update(sdt);
        car.mesh.position.x = car.driveAxis.pos;
      }
    }

    // 任务调度
    if (!this.currentTask && this.taskQueue.length > 0) {
      this.currentTask = this.taskQueue.shift();
      const t = this.currentTask;
      t.steps = t.type === 'park' ? this.buildParkSteps(t) : this.buildRetrieveSteps(t);
      t.stepIndex = 0;
      const name = slotName(t.slot.f, t.slot.c, t.slot.s);
      this.log(t.type === 'park' ? `开始入库：${t.car.plate} → ${name}` : `开始取车：${t.car.plate} ← ${name}`);
      this.emit('slots');
    }

    if (this.currentTask) {
      const t = this.currentTask;
      const st = t.steps[t.stepIndex];
      if (!st.started) { st.started = true; st.start && st.start(); }
      if (st.done()) {
        st.onDone && st.onDone();
        t.stepIndex++;
        if (t.stepIndex >= t.steps.length) {
          const name = slotName(t.slot.f, t.slot.c, t.slot.s);
          this.log(t.type === 'park'
            ? `入库完成：${t.car.plate} 已停放至 ${name}`
            : `取车完成：${t.car.plate} 已送至出入口`);
          this.currentTask = null;
          this.emit('slots');
          this.emit('cars');
        }
      }
    }

    // 状态指示灯
    const busy = this.stackerAxis.moving || this.liftAxis.moving || this.forkAxis.moving || this.jogAxis.moving;
    const lamp = this.world.lamp;
    if (this.currentTask) {
      lamp.material.color.setHex(busy ? 0xf1c40f : 0x3498db);
      lamp.material.emissive.setHex(busy ? 0xf1c40f : 0x3498db);
    } else {
      lamp.material.color.setHex(0x2ecc71);
      lamp.material.emissive.setHex(0x2ecc71);
    }
  }

  currentStepName() {
    if (!this.currentTask) return null;
    const st = this.currentTask.steps[this.currentTask.stepIndex];
    return st ? st.name : null;
  }
}
