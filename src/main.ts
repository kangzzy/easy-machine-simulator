import './ui/styles/main.css';
import { SceneManager } from './renderer/SceneManager';
import { SimulationEngine } from './simulation/SimulationEngine';
import { UIController } from './ui/UIController';
import { ThemeToggle } from './ui/ThemeToggle';

async function main() {
  const container = document.getElementById('app');
  if (!container) throw new Error('No #app container found');

  // Initialize 3D scene
  const sceneManager = new SceneManager(container);
  await sceneManager.init();

  // Initialize simulation engine
  const engine = new SimulationEngine(sceneManager);

  // Initialize UI
  const ui = new UIController(engine);
  ui.mount(document.body);

  // Theme toggle button (top-right, persists across sessions)
  const themeToggle = new ThemeToggle(sceneManager);
  document.body.appendChild(themeToggle.element);

  // Trigger initial UI refresh (engine was initialized before UI listeners were attached)
  engine.notifyAll();

  // Status bar
  const status = document.createElement('div');
  status.className = 'status-bar';
  status.textContent = `Easy Machine Simulator v0.1 | ${sceneManager.isWebGPU ? 'WebGPU' : 'WebGL2'}`;
  document.body.appendChild(status);

  console.log('Easy Machine Simulator initialized');
}

main().catch(console.error);
