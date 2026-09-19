import { CFG, LIFT_X, AISLE_Z, SLOT_Z, ENTRANCE_X, slotX, layerY } from './config.js';
import { tweenTo } from './tween.js';
import * as ui from './ui.js';

let nextTaskId = 1;

// 车辆自行移动（出入库行驶）
function carDrive(car, targetX) {
  return tweenTo(
    () => car.mesh.position.x,
    (v) => (car.mesh.position.x = v),
    targetX,
    CFG.carSpeed
  );
}

// 载具间交接滑移（升降机 <-> 横移台车 <-> 车位）
function carSlide(car, axis, target) {
  return tweenTo(
    () => car.mesh.position[axis],
    (v) => (car.mesh.position[axis] = v),
    target,
    CFG.transferSpeed
  );
}

export class Engine {
  constructor(world) {
    this.world = world;
    this.queue = [];
    this.running = null;
    this.onChange = () => {};
  }

  changed() { this.onChange(); }

  submitStore(plate) {
    if (this.world.cars.has(plate)) {
      ui.log(`车牌 ${plate} 已在库或在途，入库被拒绝`);
      return;
    }
    if (!this.world.findFreeSlot()) {
      ui.log('车库已满，无法入库');
      return;
    }
    this.queue.push({ id: nextTaskId++, type: 'store', plate, desc: `入库 ${plate}`, step: '排队中' });
    ui.log(`受理入库任务：${plate}`);
    this.changed();
    this.pump();
  }

  submitRetrieve(car) {
    if (!car.slot) return;
    const dup = this.queue.some((t) => t.car === car) || (this.running && this.running.car === car);
    if (dup) {
      ui.log(`${car.plate} 的取车任务已在队列中`);
      return;
    }
    this.queue.push({ id: nextTaskId++, type: 'retrieve', plate: car.plate, car, desc: `取车 ${car.plate}`, step: '排队中' });
    ui.log(`受理取车任务：${car.plate}（${car.slot.label}）`);
    this.changed();
    this.pump();
  }

  pump() {
    if (this.running || this.queue.length === 0) return;
    this.running = this.queue.shift();
    this.changed();
    const task = this.running;
    const job = task.type === 'store' ? this.execStore(task) : this.execRetrieve(task);
    job
      .catch((err) => ui.log(`任务异常：${err.message}`))
      .finally(() => {
        this.running = null;
        this.changed();
        this.pump();
      });
  }

  step(task, text) {
    task.step = text;
    this.changed();
  }

  // ---------------- 入库流程 ----------------
  async execStore(task) {
    const w = this.world;
    const lift = w.lift;
    const slot = w.findFreeSlot();
    if (!slot) {
      ui.log('车库已满，任务取消');
      return;
    }
    slot.reserved = true;
    slot.highlight = true;
    ui.log(`为 ${task.plate} 分配车位：${slot.label}`);

    const car = w.spawnCar(task.plate);
    task.car = car;
    this.changed();

    this.step(task, '车辆驶向升降机');
    await carDrive(car, LIFT_X);
    car.carrier = lift;
    car.rotOffset = Math.PI / 2;

    this.step(task, '升降机转盘换向');
    await lift.rotateTo(Math.PI / 2);

    const shuttle = w.shuttles[slot.layer];
    this.step(task, `升降机升至 ${slot.layer + 1} 层，横移台车就位`);
    await Promise.all([lift.moveYTo(layerY(slot.layer)), shuttle.moveXTo(0)]);

    this.step(task, '车辆交接：升降机 → 横移台车');
    car.carrier = null;
    await carSlide(car, 'x', 0);
    car.carrier = shuttle;
    car.rotOffset = Math.PI;

    this.step(task, `横移台车移至 ${slot.col + 1} 列`);
    await shuttle.moveXTo(slotX(slot.col));

    this.step(task, '车辆送入车位');
    car.carrier = null;
    await carSlide(car, 'z', SLOT_Z);
    slot.car = car;
    car.slot = slot;
    slot.reserved = false;
    slot.highlight = false;

    ui.log(`入库完成：${task.plate} → ${slot.label}`);
    shuttle.moveXTo(0); // 台车复位（不阻塞）
    lift.reset();
    this.changed();
  }

  // ---------------- 取车流程（入库逆过程） ----------------
  async execRetrieve(task) {
    const w = this.world;
    const lift = w.lift;
    const car = task.car;
    if (!car.slot) {
      ui.log(`${task.plate} 已不在车位，任务取消`);
      return;
    }
    const slot = car.slot;
    const shuttle = w.shuttles[slot.layer];
    slot.highlight = true;

    this.step(task, '升降机与横移台车就位');
    await lift.rotateTo(Math.PI / 2);
    await Promise.all([lift.moveYTo(layerY(slot.layer)), shuttle.moveXTo(slotX(slot.col))]);

    this.step(task, '车辆交接：车位 → 横移台车');
    await carSlide(car, 'z', AISLE_Z);
    slot.car = null;
    car.slot = null;
    slot.highlight = false;
    car.carrier = shuttle;
    car.rotOffset = Math.PI;

    this.step(task, '横移台车返回升降机');
    await shuttle.moveXTo(0);

    this.step(task, '车辆交接：横移台车 → 升降机');
    car.carrier = null;
    await carSlide(car, 'x', LIFT_X);
    car.carrier = lift;
    car.rotOffset = Math.PI / 2;

    this.step(task, '升降机降至地面');
    await lift.moveYTo(0);

    this.step(task, '转盘换向，车辆驶向出口');
    await lift.rotateTo(Math.PI);
    car.carrier = null;
    await carDrive(car, ENTRANCE_X);

    w.removeCar(car);
    ui.log(`取车完成：${task.plate} 已出库`);
    lift.reset();
    shuttle.moveXTo(0);
    this.changed();
  }
}
