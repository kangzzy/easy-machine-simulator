import type { SceneManager } from '../renderer/SceneManager';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'ems-theme';

export class ThemeToggle {
  readonly element: HTMLButtonElement;
  private theme: Theme;

  constructor(private sceneManager: SceneManager) {
    this.theme = (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark';

    this.element = document.createElement('button');
    this.element.id = 'theme-toggle';
    this.element.title = 'Toggle light / dark mode';
    this.element.addEventListener('click', () => this.toggle());

    // Apply saved theme immediately
    this.apply(this.theme);
  }

  private toggle(): void {
    this.apply(this.theme === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);

    if (theme === 'light') {
      document.body.classList.add('light');
      this.element.textContent = '🌙';
      this.element.title = 'Switch to dark mode';
    } else {
      document.body.classList.remove('light');
      this.element.textContent = '☀️';
      this.element.title = 'Switch to light mode';
    }

    this.sceneManager.setTheme(theme);
  }
}
