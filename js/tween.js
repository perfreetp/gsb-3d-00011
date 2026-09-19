// 运动学插值引擎：所有设备/车辆运动均通过"以恒定速度向目标位置积分"实现，
// 而非预录制动画。每一步运动返回 Promise，完成后 resolve。
const tweens = [];

// get: 读取当前值; set: 写入新值; target: 目标值; speed: 速度(单位/秒)
export function tweenTo(get, set, target, speed) {
  return new Promise((resolve) => {
    tweens.push({ get, set, target, speed, resolve });
  });
}

export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    const cur = t.get();
    const diff = t.target - cur;
    if (Math.abs(diff) < 1e-6) {
      tweens.splice(i, 1);
      t.resolve();
      continue;
    }
    const step = Math.sign(diff) * Math.min(Math.abs(diff), t.speed * dt);
    t.set(cur + step);
  }
}
