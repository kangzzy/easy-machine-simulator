import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer } from './RendererFactory';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private renderer!: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private animationCallbacks: Array<(dt: number) => void> = [];
  private clock = new THREE.Clock();
  isWebGPU = false;

  // Axes gizmo (bottom-left corner, separate canvas)
  private axesScene = new THREE.Scene();
  private axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private axesRenderer!: THREE.WebGLRenderer;
  private axesSize = 120; // px

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);

    // Gizmo canvas — fixed bottom-left
    const axesCanvas = document.createElement('canvas');
    axesCanvas.width = this.axesSize * window.devicePixelRatio;
    axesCanvas.height = this.axesSize * window.devicePixelRatio;
    axesCanvas.style.cssText = `position:fixed;bottom:12px;left:12px;width:${this.axesSize}px;height:${this.axesSize}px;pointer-events:none;z-index:50;border-radius:8px;`;
    container.appendChild(axesCanvas);
    this.axesRenderer = new THREE.WebGLRenderer({ canvas: axesCanvas, alpha: true, antialias: true });
    this.axesRenderer.setPixelRatio(window.devicePixelRatio);
    this.axesRenderer.setSize(this.axesSize, this.axesSize);
    this.axesRenderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
    this.camera.position.set(500, 400, 500);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 0, 0);

    this.setupLights();
    this.setupGrid();
    this.setupAxesGizmo();
  }

  async init(): Promise<void> {
    const { renderer, isWebGPU } = await createRenderer(this.canvas);
    this.renderer = renderer;
    this.isWebGPU = isWebGPU;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startLoop();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(200, 400, 300);
    directional.castShadow = true;
    this.scene.add(directional);

    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 200, -100);
    this.scene.add(fill);
  }

  private grid!: THREE.GridHelper;

  private setupGrid(): void {
    this.grid = new THREE.GridHelper(2000, 40, 0x444466, 0x333355);
    this.scene.add(this.grid);
  }

  setTheme(theme: 'dark' | 'light'): void {
    if (theme === 'light') {
      this.scene.background = new THREE.Color(0xdde0ee);
      (this.grid.material as THREE.LineBasicMaterial).color.set(0x9090b0);
      // GridHelper has two materials: center line + grid lines
      if (Array.isArray(this.grid.material)) {
        (this.grid.material[0] as THREE.LineBasicMaterial).color.set(0x8080aa);
        (this.grid.material[1] as THREE.LineBasicMaterial).color.set(0xb0b0cc);
      }
    } else {
      this.scene.background = new THREE.Color(0x1a1a2e);
      if (Array.isArray(this.grid.material)) {
        (this.grid.material[0] as THREE.LineBasicMaterial).color.set(0x444466);
        (this.grid.material[1] as THREE.LineBasicMaterial).color.set(0x333355);
      }
    }
  }

  private setupAxesGizmo(): void {
    this.axesCamera.position.set(0, 0, 5);
    this.axesCamera.lookAt(0, 0, 0);

    // Ambient light for gizmo
    this.axesScene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const axisLength = 1.5;
    const headLength = 0.4;
    const headWidth = 0.15;

    // X axis — red
    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0),
      axisLength, 0xff4444, headLength, headWidth
    );
    this.axesScene.add(xArrow);

    // Y axis — green
    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0),
      axisLength, 0x44ff44, headLength, headWidth
    );
    this.axesScene.add(yArrow);

    // Z axis — blue
    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0),
      axisLength, 0x4488ff, headLength, headWidth
    );
    this.axesScene.add(zArrow);

    // Axis labels
    this.addAxisLabel('X', new THREE.Vector3(1.9, 0, 0), 0xff4444);
    this.addAxisLabel('Y', new THREE.Vector3(0, 1.9, 0), 0x44ff44);
    this.addAxisLabel('Z', new THREE.Vector3(0, 0, 1.9), 0x4488ff);
  }

  private addAxisLabel(text: string, position: THREE.Vector3, color: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(position);
    sprite.scale.set(0.5, 0.5, 0.5);
    this.axesScene.add(sprite);
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  onAnimate(callback: (dt: number) => void): void {
    this.animationCallbacks.push(callback);
  }

  private startLoop(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      this.controls.update();
      for (const cb of this.animationCallbacks) {
        cb(dt);
      }

      // Render main scene
      this.renderer.render(this.scene, this.camera);

      // Render axes gizmo into the overlay canvas
      this.renderAxesGizmo();
    });
  }

  private renderAxesGizmo(): void {
    // Sync axes camera rotation with main camera
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.axesCamera.position.copy(dir.multiplyScalar(-5));
    this.axesCamera.lookAt(0, 0, 0);
    this.axesCamera.up.copy(this.camera.up);

    this.axesRenderer.render(this.axesScene, this.axesCamera);
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object);
  }
}
