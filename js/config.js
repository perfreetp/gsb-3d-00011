// 车库结构与运动参数配置
export const CFG = {
  layers: 3,          // 层数
  cols: 5,            // 列数
  colW: 3.6,          // 列宽 (m)
  layerH: 2.8,        // 层高 (m)
  slotD: 5.8,         // 车位进深 (m)
  aisleD: 5.0,        // 巷道深度 (m)
  liftSpeed: 1.6,     // 升降机速度 (m/s)
  shuttleSpeed: 2.6,  // 横移台车速度 (m/s)
  carSpeed: 2.2,      // 车辆自行速度 (m/s)
  transferSpeed: 1.5, // 交接横移速度 (m/s)
  rotateSpeed: 1.2,   // 升降机转盘角速度 (rad/s)
};

export const LIFT_X = -CFG.colW;                 // 升降机井道中心 x
export const AISLE_Z = CFG.aisleD / 2;           // 巷道中心 z
export const SLOT_Z = CFG.aisleD + CFG.slotD / 2; // 车位中心 z
export const ENTRANCE_X = LIFT_X - CFG.colW * 3; // 出入口 x

export const slotX = (c) => c * CFG.colW;
export const layerY = (l) => l * CFG.layerH;
export const slotLabel = (slot) => `${slot.layer + 1}层-${slot.col + 1}列`;

// 全局仿真速度倍率
export const SPEED = { mul: 1 };
