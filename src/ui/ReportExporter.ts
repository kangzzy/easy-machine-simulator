import type { SimulationEngine } from '../simulation/SimulationEngine';

export class ReportExporter {
  constructor(private engine: SimulationEngine) {}

  exportJSON(): void {
    this.engine.exportReport();
  }

  /**
   * Export as HTML report (can be printed to PDF via browser).
   */
  exportHTML(): void {
    const violations = this.engine.violations;
    const machine = this.engine.machineDefinition;

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Simulation Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #333; border-bottom: 2px solid #4a9eff; padding-bottom: 8px; }
    .summary { background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .pass { color: #22c55e; font-weight: bold; }
    .fail { color: #ef4444; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    .workspace-bound { background: #fef2f2; }
    .joint-limit { background: #fffbeb; }
  </style>
</head>
<body>
  <h1>Machine Simulation Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="summary">
    <h2>Summary</h2>
    <p>Machine: ${machine?.name ?? 'N/A'} (${machine?.type ?? 'N/A'})</p>
    <p>DOF: ${machine?.joints.length ?? 0}</p>
    <p>Total Frames: ${this.engine.totalFrames}</p>
    <p>Result: <span class="${violations.length === 0 ? 'pass' : 'fail'}">${violations.length === 0 ? 'PASS' : 'FAIL'}</span></p>
    <p>Violations: ${violations.length}</p>
  </div>

  ${machine ? `
  <h2>Workspace Bounds</h2>
  <table>
    <tr><th>Axis</th><th>Min</th><th>Max</th></tr>
    <tr><td>X</td><td>${machine.workspaceBounds.min[0]}</td><td>${machine.workspaceBounds.max[0]}</td></tr>
    <tr><td>Y</td><td>${machine.workspaceBounds.min[1]}</td><td>${machine.workspaceBounds.max[1]}</td></tr>
    <tr><td>Z</td><td>${machine.workspaceBounds.min[2]}</td><td>${machine.workspaceBounds.max[2]}</td></tr>
  </table>
  ` : ''}

  ${violations.length > 0 ? `
  <h2>Violations (${violations.length})</h2>
  <table>
    <tr><th>Frame</th><th>Type</th><th>Position</th><th>Message</th></tr>
    ${violations.map(v => `
    <tr class="${v.violationType}">
      <td>${v.frameIndex}</td>
      <td>${v.violationType}</td>
      <td>[${v.position.map(p => p.toFixed(1)).join(', ')}]</td>
      <td>${v.message}</td>
    </tr>`).join('')}
  </table>
  ` : '<p class="pass">No violations found. Toolpath is within machine limits.</p>'}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
