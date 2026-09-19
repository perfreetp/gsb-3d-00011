// 面板 UI 渲染与日志
const $ = (id) => document.getElementById(id);

export function log(msg) {
  const el = $('log');
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const line = document.createElement('div');
  line.innerHTML = `<span class="t">[${time}]</span>${msg}`;
  el.prepend(line);
  while (el.children.length > 120) el.removeChild(el.lastChild);
}

export function refresh(world, engine) {
  const occ = world.occupancy();
  const used = occ.used;
  const total = occ.total;
  $('occFill').style.width = total ? `${(used / total) * 100}%` : '0%';
  $('occText').textContent = `${used} / ${total}（${total ? Math.round((used / total) * 100) : 0}%）`;

  $('currentTask').textContent = engine.running
    ? `${engine.running.desc} — ${engine.running.step}`
    : '空闲';
  $('queueCount').textContent = engine.queue.length;
  const q = $('taskQueue');
  q.innerHTML = '';
  if (engine.queue.length === 0) {
    q.innerHTML = '<li class="empty">无排队任务</li>';
  } else {
    for (const t of engine.queue) {
      const li = document.createElement('li');
      li.textContent = `#${t.id} ${t.desc}`;
      q.appendChild(li);
    }
  }

  const lift = world.lift;
  const rows = [
    ['升降机', `${lift.state} · 高度 ${lift.y.toFixed(2)}m`, lift.state === '空闲'],
  ];
  for (const s of world.shuttles) {
    rows.push([`横移台车 ${s.layer + 1}层`, `${s.state} · 位置 ${s.x.toFixed(2)}m`, s.state === '空闲']);
  }
  $('deviceStatus').innerHTML = rows
    .map(
      ([name, info, idle]) =>
        `<div><span>${name}</span><span class="${idle ? 'st-idle' : 'st-busy'}">${info}</span></div>`
    )
    .join('');
}

export function renderCarList(world, engine) {
  const ul = $('carList');
  ul.innerHTML = '';
  const cars = world.parkedCars();
  if (cars.length === 0) {
    ul.innerHTML = '<li class="empty">暂无在库车辆</li>';
    return;
  }
  for (const car of cars) {
    const li = document.createElement('li');
    const info = document.createElement('span');
    info.textContent = `${car.plate}（${car.slot.label}）`;
    const btn = document.createElement('button');
    btn.textContent = '取车';
    btn.onclick = () => engine.submitRetrieve(car);
    li.appendChild(info);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}
