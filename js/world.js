import * as THREE from 'three';
import { CONFIG, slotKey, slotPosition } from './config.js';

const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x4d6b8a, metalness: 0.6, roughness: 0.45 }),
  beam: new THREE.MeshStandardMaterial({ color: 0x6b7f94, metalness: 0.5, roughness: 0.5 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x8d9aa8, metalness: 0.3, roughness: 0.7 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x3d4854, metalness: 0.7, roughness: 0.4 }),
  stacker: new THREE.MeshStandardMaterial({ color: 0xe8a13a, metalness: 0.4, roughness: 0.5 }),
  platform: new THREE.MeshStandardMaterial({ color: 0x2f9e8f, metalness: 0.4, roughness: 0.5 }),
  fork: new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.7, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.9, roughness: 0.15 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.8, roughness: 0.3 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildWorld(scene) {
  const C = CONFIG;
  const totalH = C.floors * C.floorH;
  const rackLenX = C.cols * C.pitchX;
  const rackCenterX = (C.cols - 1) * C.pitchX / 2;

  // ---------- 地面与道路 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), MAT.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.01, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(new THREE.GridHelper(90, 90, 0x3a4552, 0x2a323d));

  // 巷道地面导向线
  const aisleLine = new THREE.Mesh(
    new THREE.PlaneGeometry(40, C.aisleW),
    new THREE.MeshStandardMaterial({ color: 0x39434f, roughness: 0.9 })
  );
  aisleLine.rotation.x = -Math.PI / 2;
  aisleLine.position.set(2, 0.005, 0);
  aisleLine.receiveShadow = true;
  scene.add(aisleLine);

  // ---------- 货架 ----------
  const slotAnchors = new Map();   // key -> Object3D（车辆挂点）
  const slotMarkers = new Map();   // key -> Mesh（占用指示）
  const slotHitMeshes = [];        // 供点击拾取

  for (let s = 0; s < C.sides; s++) {
    const sign = s === 0 ? 1 : -1;
    const zEdge = sign * (C.aisleW / 2);
    const zBack = sign * (C.aisleW / 2 + C.rackDepth);
    const zMid = sign * (C.aisleW / 2 + C.rackDepth / 2);

    // 立柱
    for (let c = 0; c <= C.cols; c++) {
      const x = c * C.pitchX - C.pitchX / 2;
      scene.add(box(0.22, totalH + 0.6, 0.22, MAT.steel, x, (totalH + 0.6) / 2, zEdge));
      scene.add(box(0.22, totalH + 0.6, 0.22, MAT.steel, x, (totalH + 0.6) / 2, zBack));
    }
    // 各层横梁 + 载车板
    for (let f = 0; f < C.floors; f++) {
      const y = f * C.floorH;
      scene.add(box(rackLenX + 0.4, 0.16, 0.16, MAT.beam, rackCenterX, y - 0.08, zEdge));
      scene.add(box(rackLenX + 0.4, 0.16, 0.16, MAT.beam, rackCenterX, y - 0.08, zBack));
      for (let c = 0; c < C.cols; c++) {
        const pos = slotPosition(f, c, s);
        const plateMesh = box(C.pitchX - 0.35, 0.08, C.rackDepth - 0.15, MAT.plate, pos.x, y - 0.04, zMid);
        plateMesh.userData.slotKey = slotKey(f, c, s);
        scene.add(plateMesh);
        slotHitMeshes.push(plateMesh);

        // 车位状态指示灯板
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(C.pitchX - 0.9, 0.03, C.rackDepth - 0.7),
          new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 })
        );
        marker.position.set(pos.x, y + 0.012, zMid);
        scene.add(marker);
        slotMarkers.set(slotKey(f, c, s), marker);

        const anchor = new THREE.Object3D();
        anchor.position.set(pos.x, y, pos.z);
        scene.add(anchor);
        slotAnchors.set(slotKey(f, c, s), anchor);
      }
    }
  }

  // ---------- 地轨与天轨 ----------
  const railLen = rackLenX + 16;
  const railCenterX = rackCenterX - 4;
  scene.add(box(railLen, 0.12, 0.3, MAT.rail, railCenterX, 0.06, C.aisleW / 2 - 0.7));
  scene.add(box(railLen, 0.12, 0.3, MAT.rail, railCenterX, 0.06, -(C.aisleW / 2 - 0.7)));

  // ---------- 堆垛机（横移台车 + 立柱 + 升降平台 + 伸缩货叉） ----------
  const stackerGroup = new THREE.Group();          // 沿 X 横移
  scene.add(stackerGroup);

  const base = box(2.4, 0.5, C.aisleW - 0.8, MAT.stacker, 0, 0.37, 0);
  stackerGroup.add(base);

  const mastH = totalH + 1.2;
  stackerGroup.add(box(0.35, mastH, 0.35, MAT.stacker, -0.9, mastH / 2 + 0.6, 0));
  stackerGroup.add(box(0.35, mastH, 0.35, MAT.stacker, 0.9, mastH / 2 + 0.6, 0));
  stackerGroup.add(box(2.2, 0.3, 0.4, MAT.stacker, 0, mastH + 0.6, 0));

  // 状态指示灯
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 1.2 })
  );
  lamp.position.set(0, mastH + 0.95, 0);
  stackerGroup.add(lamp);

  // 升降平台（沿 Y）
  const platformGroup = new THREE.Group();
  stackerGroup.add(platformGroup);
  const platformMesh = box(4.9, 0.14, 2.5, MAT.platform, 0, -0.07, 0);
  platformGroup.add(platformMesh);
  // 平台两侧导向轮架
  platformGroup.add(box(0.3, 0.5, 0.5, MAT.stacker, -0.9, 0.1, 0));
  platformGroup.add(box(0.3, 0.5, 0.5, MAT.stacker, 0.9, 0.1, 0));
  const platformCarAnchor = new THREE.Object3D();
  platformCarAnchor.position.set(0, 0.02, 0);
  platformGroup.add(platformCarAnchor);

  // 伸缩货叉（沿 Z 伸缩 + 微升降托举）
  const forkGroup = new THREE.Group();
  platformGroup.add(forkGroup);
  for (const px of [-1.1, 0, 1.1]) {
    forkGroup.add(box(0.34, 0.07, 2.5, MAT.fork, px, 0.05, 0));
  }
  const forkCarAnchor = new THREE.Object3D();
  forkCarAnchor.position.set(0, 0.1, 0);
  forkGroup.add(forkCarAnchor);

  // ---------- 出入口 ----------
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x35506b, metalness: 0.4, roughness: 0.6 });
  scene.add(box(0.4, 4.2, 0.4, gateMat, C.homeX - 2.8, 2.1, C.aisleW / 2 + 0.4));
  scene.add(box(0.4, 4.2, 0.4, gateMat, C.homeX - 2.8, 2.1, -(C.aisleW / 2 + 0.4)));
  scene.add(box(0.4, 0.5, C.aisleW + 1.2, gateMat, C.homeX - 2.8, 4.35, 0));
  const gateSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff })
  );
  gateSign.position.set(C.homeX - 2.81, 4.35, 0);
  gateSign.rotation.y = -Math.PI / 2;
  scene.add(gateSign);

  return {
    stackerGroup, platformGroup, forkGroup, lamp,
    platformCarAnchor, forkCarAnchor,
    slotAnchors, slotMarkers, slotHitMeshes,
  };
}

/** 生成一辆参数化车辆模型（非贴图、非外部资源） */
export function createCarMesh(colorHex) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.35 });

  const body = box(4.3, 0.62, 1.78, bodyMat, 0, 0.66, 0);
  car.add(body);
  const cabin = box(2.2, 0.55, 1.6, bodyMat, -0.25, 1.22, 0);
  car.add(cabin);
  const windshield = box(2.0, 0.42, 1.62, MAT.glass, -0.25, 1.18, 0);
  car.add(windshield);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.26, 12);
  for (const [wx, wz] of [[1.42, 0.82], [1.42, -0.82], [-1.42, 0.82], [-1.42, -0.82]]) {
    const wheel = new THREE.Mesh(wheelGeo, MAT.tire);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    wheel.castShadow = true;
    car.add(wheel);
    const hub = new THREE.Mesh(hubGeo, MAT.hub);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(wx, 0.34, wz);
    car.add(hub);
  }

  // 车灯
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.8 });
  car.add(box(0.08, 0.14, 0.34, lightMat, 2.16, 0.72, 0.55));
  car.add(box(0.08, 0.14, 0.34, lightMat, 2.16, 0.72, -0.55));
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xc0392b, emissiveIntensity: 0.6 });
  car.add(box(0.08, 0.14, 0.34, tailMat, -2.16, 0.72, 0.55));
  car.add(box(0.08, 0.14, 0.34, tailMat, -2.16, 0.72, -0.55));

  return car;
}
