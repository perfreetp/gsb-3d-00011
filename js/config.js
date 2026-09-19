export const CONFIG = {
  floors: 4,          // 层数
  cols: 6,            // 每侧列数
  sides: 2,           // 巷道两侧
  pitchX: 5.0,        // 列间距（车位沿巷道方向宽度）
  floorH: 2.4,        // 层高
  rackDepth: 2.8,     // 车位进深
  aisleW: 4.6,        // 巷道宽度
  homeX: -6.5,        // 堆垛机原位（出入口对齐位置）
  spawnX: -26,        // 车辆生成位置
  exitX: -26,         // 车辆驶离位置
  waitX0: -13,        // 第一个排队候车位
  waitGap: 5.2,       // 候车间距
  // 各运动轴的速度 / 加速度限制（真实运动学参数）
  stacker: { maxVel: 3.0, maxAccel: 1.8 },   // 横移台车
  lift:    { maxVel: 1.6, maxAccel: 1.2 },   // 升降平台
  fork:    { maxVel: 1.4, maxAccel: 2.0 },   // 伸缩货叉
  jog:     { maxVel: 0.35, maxAccel: 0.8 },  // 货叉微升降（托举）
  car:     { maxVel: 2.0, maxAccel: 1.2 },   // 车辆自行走
  jogUp: 0.14,                               // 托举高度
};

export function slotKey(f, c, s) { return `${f}-${c}-${s}`; }

export function slotName(f, c, s) {
  return `${s === 0 ? 'A' : 'B'}-${f + 1}0${c + 1}`;
}

export function slotPosition(f, c, s) {
  const z = (CONFIG.aisleW / 2 + CONFIG.rackDepth / 2) * (s === 0 ? 1 : -1);
  return { x: c * CONFIG.pitchX, y: f * CONFIG.floorH, z };
}
