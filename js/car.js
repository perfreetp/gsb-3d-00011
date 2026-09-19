import * as THREE from 'three';

const PALETTE = [0xc0392b, 0x2980b9, 0x27ae60, 0xd4a017, 0x8e44ad, 0x16a085, 0xe0e0e0, 0x2c3e50];

export function randomColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function makePlateTexture(plate) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a3d91';
  ctx.fillRect(0, 0, 256, 56);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 250, 50);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plate, 128, 30);
  return new THREE.CanvasTexture(canvas);
}

// 构建一辆低多边形汽车，车头朝 +z 方向
export function createCarMesh(color, plate) {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), bodyMat);
  body.position.y = 0.58;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.6, roughness: 0.25 })
  );
  cabin.position.set(0, 1.08, -0.15);
  cabin.castShadow = true;
  car.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.33, z);
    car.add(wheel);
  }

  const tex = makePlateTexture(plate);
  const plateMat = new THREE.MeshBasicMaterial({ map: tex });
  const plateGeo = new THREE.PlaneGeometry(0.9, 0.2);
  const rear = new THREE.Mesh(plateGeo, plateMat);
  rear.position.set(0, 0.6, -2.101);
  rear.rotation.y = Math.PI;
  car.add(rear);
  const front = new THREE.Mesh(plateGeo, plateMat);
  front.position.set(0, 0.6, 2.101);
  car.add(front);

  // 车灯
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), lightMat);
    lamp.position.set(x, 0.62, 2.11);
    car.add(lamp);
  }

  return car;
}
