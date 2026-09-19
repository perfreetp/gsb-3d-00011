/**
 * 单轴运动控制器：带速度/加速度限制的梯形速度曲线。
 * 每帧根据当前位置、速度积分推进，是所有设备运动的统一驱动，
 * 保证仿真过程由运动学实时计算，而非播放固定动画。
 */
export class MotionAxis {
  constructor(name, { position = 0, maxVel = 1, maxAccel = 1 } = {}) {
    this.name = name;
    this.pos = position;
    this.vel = 0;
    this.target = position;
    this.maxVel = maxVel;
    this.maxAccel = maxAccel;
  }

  setTarget(t) { this.target = t; }

  get moving() {
    return Math.abs(this.vel) > 1e-4 || Math.abs(this.target - this.pos) > 1e-3;
  }

  get atTarget() { return !this.moving; }

  update(dt) {
    const step = Math.min(dt, 0.05);
    const remaining = this.target - this.pos;
    if (Math.abs(remaining) < 1e-4 && Math.abs(this.vel) < 1e-3) {
      this.pos = this.target;
      this.vel = 0;
      return;
    }
    const dir = Math.sign(remaining) || 1;
    const brakeDist = (this.vel * this.vel) / (2 * this.maxAccel);
    // 剩余距离不足以刹停时按减速曲线给定期望速度，否则奔向最大速度
    let desired;
    if (Math.abs(remaining) <= brakeDist + 1e-6) {
      desired = dir * Math.sqrt(Math.max(0, 2 * this.maxAccel * Math.abs(remaining)));
    } else {
      desired = dir * this.maxVel;
    }
    const dv = desired - this.vel;
    const maxDv = this.maxAccel * step;
    this.vel += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv;
    this.pos += this.vel * step;
    if ((this.target - this.pos) * dir < 0) { // 防过冲
      this.pos = this.target;
      this.vel = 0;
    }
  }
}
