import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { MachineComponent } from '../machine/MachineBuilder';
import { makeCollapsiblePanel } from './panelUtils';

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
    const typeTag = isPrismatic ? 'mm' : 'rad';
    const typeColor = isPrismatic ? '#6af' : '#fa6';
    const decimals = isPrismatic ? 1 : 3;

    // Header: name + value
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;';

    const nameLabel = document.createElement('span');
    nameLabel.style.cssText = 'font-size:11px;color:var(--text-primary);';
    nameLabel.innerHTML = `<span style="color:${typeColor};font-size:9px;font-weight:bold;margin-right:3px;">${isPrismatic ? 'P' : 'R'}</span>${joint.name}`;

    const valueLabel = document.createElement('span');
    valueLabel.style.cssText = 'font-size:10px;font-family:monospace;color:var(--accent);min-width:60px;text-align:right;';
    valueLabel.textContent = `${joint.jointValue.toFixed(decimals)} ${typeTag}`;

    header.append(nameLabel, valueLabel);
    row.appendChild(header);

    // Slider row
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(joint.limits.min);
    slider.max = String(joint.limits.max);
    slider.step = String((joint.limits.max - joint.limits.min) / 200);
    slider.value = String(joint.jointValue);
    slider.style.cssText = 'flex:1;';

    // Value number input
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.value = joint.jointValue.toFixed(decimals);
    numInput.step = String((joint.limits.max - joint.limits.min) / 200);
    numInput.style.cssText = 'width:55px;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:2px 3px;font-size:10px;font-family:monospace;text-align:center;';

    const updateValue = (val: number) => {
      this.engine.setJointValue(joint.id, val);
      const clamped = this.engine.getJointValue(joint.id);
      slider.value = String(clamped);
      numInput.value = clamped.toFixed(decimals);
      valueLabel.textContent = `${clamped.toFixed(decimals)} ${typeTag}`;
    };

    slider.addEventListener('input', () => updateValue(parseFloat(slider.value)));
    numInput.addEventListener('change', () => updateValue(parseFloat(numInput.value) || 0));

    sliderRow.append(slider, numInput);
    row.appendChild(sliderRow);

    // Min / Max editable row
    const limitsRow = document.createElement('div');
    limitsRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:3px;';

    const minInput = this.makeLimitInput('Min', joint.limits.min, decimals, (v) => {
      this.engine.updateMachineComponent(joint.id, { limits: { min: v, max: joint.limits.max } });
      joint.limits.min = v;
      slider.min = String(v);
      slider.step = String((joint.limits.max - v) / 200);
      numInput.min = String(v);
      updateValue(joint.jointValue); // re-clamp
    });

    const maxInput = this.makeLimitInput('Max', joint.limits.max, decimals, (v) => {
      this.engine.updateMachineComponent(joint.id, { limits: { min: joint.limits.min, max: v } });
      joint.limits.max = v;
      slider.max = String(v);
      slider.step = String((v - joint.limits.min) / 200);
      numInput.max = String(v);
      updateValue(joint.jointValue); // re-clamp
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
