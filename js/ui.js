import { slotName, CONFIG } from './config.js';

const $ = id => document.getElementById(id);

export class GarageUI {
  constructor(sim) {
    this.sim = sim;
    this.frame = 0;

    $('btn-park').addEventListener('click', () => sim.requestPark());
    $('speed').addEventListener('change', e => { sim.timeScale = parseFloat(e.target.value); });

    sim.on('cars', () => this.renderCars());
    sim.on('slots', () => this.renderSlots());
    sim.on('log', () => this.renderLog());
    this.renderCars();
    this.renderSlots();
  }

  renderCars() {
    const list = $('car-list');
    const cars = this.sim.cars;
    if (cars.length === 0) {
      list.innerHTML = '<div class="car-empty">场内暂无车辆</div>';
      return;
    }
    list.innerHTML = '';
    for (const car of cars) {
      const item = document.createElement('div');
      item.className = 'car-item';
      const stateText = {
        waiting: '排队候位', parking: '入库中', parked: car.slot ? slotName(car.slot.f, car.slot.c, car.slot.s) : '-',
        'retrieve-queued': '等待取车', retrieving: '出库中',
      }[car.state] || car.state;
      item.innerHTML = `
        <span class="dot" style="background:#${car.color.toString(16).padStart(6, '0')}"></span>
        <span class="plate">${car.plate}</span>
        <span class="slot">${stateText}</span>`;
      const btn = document.createElement('button');
      btn.textContent = '取车';
      btn.disabled = car.state !== 'parked';
      btn.addEventListener('click', () => this.sim.requestRetrieve(car.id));
      item.appendChild(btn);
      list.appendChild(item);
    }
  }

  renderSlots() {
    const sim = this.sim;
    const occ = sim.occupiedSlots, total = sim.totalSlots;
    $('occ-bar').style.width = `${(occ / total * 100).toFixed(1)}%`;
    $('occ-text').textContent = `${occ} / ${total}（${(occ / total * 100).toFixed(0)}%）`;

    const box = $('occ-floors');
    box.innerHTML = '';
    for (const st of sim.floorStats()) {
      const row = document.createElement('div');
      row.className = 'floor-row';
      row.innerHTML = `
        <span class="label">${st.floor} 层</span>
        <div class="bar"><div class="bar-fill" style="width:${st.occ / st.total * 100}%"></div></div>
        <span class="cnt">${st.occ}/${st.total}</span>`;
      box.appendChild(row);
    }

    // 车位指示灯颜色
    for (const [key, slot] of sim.slots) {
      const marker = sim.world.slotMarkers.get(key);
      const isTarget = sim.currentTask &&
        slotName(slot.f, slot.c, slot.s) === slotName(sim.currentTask.slot.f, sim.currentTask.slot.c, sim.currentTask.slot.s);
      if (isTarget) {
        marker.material.color.setHex(0xf1c40f);
        marker.material.emissive.setHex(0xf1c40f);
      } else if (slot.car || slot.reserved) {
        marker.material.color.setHex(0xe74c3c);
        marker.material.emissive.setHex(0xe74c3c);
        marker.material.emissiveIntensity = 0.35;
      } else {
        marker.material.color.setHex(0x2ecc71);
        marker.material.emissive.setHex(0x2ecc71);
        marker.material.emissiveIntensity = 0.35;
      }
    }

    $('btn-park').disabled = occ >= total;
    $('btn-park').textContent = occ >= total ? '车库已满' : '新车入库（自动分配车位）';
  }

  renderLog() {
    $('log').innerHTML = this.sim.logs
      .map(l => `<div><span class="t">${l.ts}</span>${l.msg}</div>`)
      .join('');
  }

  /** 每帧刷新（设备数值与任务状态） */
  update() {
    this.frame++;
    const sim = this.sim;

    const busy = sim.currentTask !== null;
    $('st-system').textContent = busy ? '运行中' : (sim.taskQueue.length ? '待命中（有排队任务）' : '空闲');
    $('st-system').style.color = busy ? '#ffd166' : '#2ecc71';

    $('st-x').textContent = `${sim.stackerAxis.pos.toFixed(2)} m${sim.stackerAxis.moving ? '（横移中）' : ''}`;
    const floor = Math.round(sim.liftAxis.pos / CONFIG.floorH);
    $('st-y').textContent = `${sim.liftAxis.pos.toFixed(2)} m（${floor === 0 ? '地面层' : floor + ' 层'}）${sim.liftAxis.moving ? '（升降中）' : ''}`;

    let forkText = '中位收回';
    if (Math.abs(sim.forkAxis.pos) > 0.05 || sim.forkAxis.moving)
      forkText = sim.forkAxis.pos > 0 ? '伸向 A 侧' : '伸向 B 侧';
    if (sim.jogAxis.pos > 0.03) forkText += ' · 托举中';
    $('st-fork').textContent = forkText;

    if (sim.currentTask) {
      const t = sim.currentTask;
      const name = slotName(t.slot.f, t.slot.c, t.slot.s);
      const action = t.type === 'park' ? '入库' : '取车';
      $('task-current').innerHTML =
        `<b>[${action}]</b> ${t.car.plate} → ${name}<br><span class="step">▶ ${sim.currentStepName() || ''}</span>`;
    } else {
      $('task-current').textContent = '无任务';
    }
    $('task-queue').textContent = `${sim.taskQueue.length} 个任务`;

    // 车辆状态低频刷新
    if (this.frame % 30 === 0) this.renderCars();
  }
}
