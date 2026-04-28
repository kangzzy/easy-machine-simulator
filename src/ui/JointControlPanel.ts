import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { MachineComponent } from '../machine/MachineBuilder';
import { makeCollapsiblePanel } from './panelUtils';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export class JointControlPanel {
  readonly element: HTMLDivElement;
  private slidersContainer!: HTMLDivElement;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.element.style.cssText = 'max-height:320px;overflow-y:auto;';
    this.build();

    engine.on('machineChanged', () => this.refresh());
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Joint Control');

    this.slidersContainer = document.createElement('div');
    body.appendChild(this.slidersContainer);

    this.refresh();
  }

  refresh(): void {
    this.slidersContainer.innerHTML = '';
    const joints = this.engine.getJointsList();

    if (joints.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:var(--text-secondary);text-align:center;padding:8px;';
      empty.textContent = 'No movable joints';
      this.slidersContainer.appendChild(empty);
      return;
    }

    for (const joint of joints) {
      this.slidersContainer.appendChild(this.buildJointSlider(joint));
    }

    // Reset all button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.style.cssText = 'width:100%;margin-top:6px;font-size:11px;';
    resetBtn.textContent = 'Reset All Joints';
    resetBtn.addEventListener('click', () => {
      for (const j of joints) {
        this.engine.setJointValue(j.id, 0);
      }
      this.refresh();
    });
    this.slidersContainer.appendChild(resetBtn);
  }

  private buildJointSlider(joint: MachineComponent): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(60,60,90,0.25);';

    const isPrismatic = joint.jointType === 'prismatic';
    const typeTag = isPrismatic ? 'mm' : '\u00B0';
    const typeColor = isPrismatic ? '#6af' : '#fa6';
    const decimals = isPrismatic ? 1 : 1;

    // For revolute joints, internal storage stays in radians but the UI works in degrees.
    const toDisplay = (v: number) => isPrismatic ? v : v * RAD2DEG;
    const toStorage = (v: number) => isPrismatic ? v : v * DEG2RAD;

    const dispMin = toDisplay(joint.limits.min);
    const dispMax = toDisplay(joint.limits.max);
    const dispVal = toDisplay(joint.jointValue);
    const dispStep = (dispMax - dispMin) / 200;

    // Header: name + value
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;';

    const nameLabel = document.createElement('span');
    nameLabel.style.cssText = 'font-size:11px;color:var(--text-primary);';
    nameLabel.innerHTML = `<span style="color:${typeColor};font-size:9px;font-weight:bold;margin-right:3px;">${isPrismatic ? 'P' : 'R'}</span>${joint.name}`;

    const valueLabel = document.createElement('span');
    valueLabel.style.cssText = 'font-size:10px;font-family:monospace;color:var(--accent);min-width:60px;text-align:right;';
    valueLabel.textContent = `${dispVal.toFixed(decimals)} ${typeTag}`;

    header.append(nameLabel, valueLabel);
    row.appendChild(header);

    // Slider row
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(dispMin);
    slider.max = String(dispMax);
    slider.step = String(dispStep);
    slider.value = String(dispVal);
    slider.style.cssText = 'flex:1;';

    // Value number input (in display units)
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.value = dispVal.toFixed(decimals);
    numInput.step = String(dispStep);
    numInput.style.cssText = 'width:55px;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:2px 3px;font-size:10px;font-family:monospace;text-align:center;';

    const updateValue = (displayVal: number) => {
      this.engine.setJointValue(joint.id, toStorage(displayVal));
      const clampedDisplay = toDisplay(this.engine.getJointValue(joint.id));
      slider.value = String(clampedDisplay);
      numInput.value = clampedDisplay.toFixed(decimals);
      valueLabel.textContent = `${clampedDisplay.toFixed(decimals)} ${typeTag}`;
    };

    slider.addEventListener('input', () => updateValue(parseFloat(slider.value)));
    numInput.addEventListener('change', () => updateValue(parseFloat(numInput.value) || 0));

    sliderRow.append(slider, numInput);
    row.appendChild(sliderRow);

    // Min / Max editable row (in display units)
    const limitsRow = document.createElement('div');
    limitsRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:3px;';

    const minInput = this.makeLimitInput('Min', dispMin, decimals, (displayMin) => {
      const storageMin = toStorage(displayMin);
      this.engine.updateMachineComponent(joint.id, { limits: { min: storageMin, max: joint.limits.max } });
      joint.limits.min = storageMin;
      slider.min = String(displayMin);
      slider.step = String((toDisplay(joint.limits.max) - displayMin) / 200);
      numInput.min = String(displayMin);
      updateValue(toDisplay(joint.jointValue)); // re-clamp
    });

    const maxInput = this.makeLimitInput('Max', dispMax, decimals, (displayMax) => {
      const storageMax = toStorage(displayMax);
      this.engine.updateMachineComponent(joint.id, { limits: { min: joint.limits.min, max: storageMax } });
      joint.limits.max = storageMax;
      slider.max = String(displayMax);
      slider.step = String((displayMax - toDisplay(joint.limits.min)) / 200);
      numInput.max = String(displayMax);
      updateValue(toDisplay(joint.jointValue)); // re-clamp
    });

    limitsRow.append(minInput, maxInput);
    row.appendChild(limitsRow);

    return row;
  }

  private makeLimitInput(label: string, value: number, decimals: number, onChange: (v: number) => void): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;display:flex;align-items:center;gap:2px;min-width:0;';

    const lbl = document.createElement('span');
    lbl.style.cssText = `font-size:9px;color:${label === 'Min' ? '#f66' : '#6f6'};font-weight:bold;flex-shrink:0;`;
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toFixed(decimals);
    input.step = decimals === 1 ? '1' : '0.1';
    input.style.cssText = 'flex:1;min-width:0;background:rgba(40,40,60,0.6);border:1px solid rgba(60,60,90,0.4);border-radius:3px;color:var(--text-primary);padding:2px 3px;font-size:10px;font-family:monospace;text-align:center;';
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));

    wrap.append(lbl, input);
    return wrap;
  }
}
