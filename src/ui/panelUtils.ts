/**
 * Makes a panel collapsible. Returns the body container to append content into.
 *
 * When the panel lives in a flex container with flex:1, collapsing automatically
 * shrinks it to header-only size and restores flex:1 on expand.
 */
export function makeCollapsiblePanel(
  panel: HTMLElement,
  title: string,
  defaultCollapsed = false,
): HTMLDivElement {
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;margin-bottom:6px;';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  h3.style.margin = '0';

  const chevron = document.createElement('span');
  chevron.style.cssText =
    'font-size:10px;color:var(--text-secondary);transition:transform 0.15s;display:inline-block;';
  chevron.textContent = '▼';

  header.append(h3, chevron);
  panel.appendChild(header);

  const body = document.createElement('div');
  panel.appendChild(body);

  let collapsed = defaultCollapsed;
  // Captured on first collapse so we can restore the original flex value.
  let savedFlex = '';

  // Apply initial state (flex hasn't been set by the caller yet, so don't touch it here)
  body.style.display = collapsed ? 'none' : '';
  chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';

    // If the panel participates in a flex container (flex:1 etc.), toggle between
    // filling space when expanded vs. shrinking to header-only when collapsed.
    if (collapsed) {
      if (panel.style.flex) {
        savedFlex = panel.style.flex;
        panel.style.flex = '0 0 auto';
      }
    } else {
      if (savedFlex) {
        panel.style.flex = savedFlex;
        savedFlex = '';
      }
    }
  });

  return body;
}
