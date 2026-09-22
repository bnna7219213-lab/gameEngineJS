// 主题：dark/light 切换（对应 python/ide 的主题）。
// 通过 CSS 变量注入；setTheme 持久化到 localStorage。
export const THEMES = {
  dark: {
    '--bg': '#1e1f24', '--bg2': '#26272e', '--bg3': '#2f313a', '--fg': '#d7d9e0',
    '--fg-dim': '#8a8d99', '--accent': '#4f8cff', '--accent2': '#7aa5ff',
    '--border': '#3a3c46', '--sel': '#31405e', '--danger': '#e05555', '--ok': '#4fbf67',
  },
  light: {
    '--bg': '#f4f5f7', '--bg2': '#ffffff', '--bg3': '#e8eaef', '--fg': '#26282e',
    '--fg-dim': '#6b6e78', '--accent': '#2f6fe0', '--accent2': '#5587e8',
    '--border': '#c9ccd4', '--sel': '#c7d8f7', '--danger': '#c73e3e', '--ok': '#2e8b47',
  },
};

export function applyTheme(name) {
  const t = THEMES[name] || THEMES.dark;
  const root = document.documentElement;
  for (const k in t) root.style.setProperty(k, t[k]);
  root.dataset.theme = name;
  try { localStorage.setItem('editor:theme', name); } catch { /* 无存储环境时忽略 */ }
  return name;
}

export function currentTheme() {
  try { return localStorage.getItem('editor:theme') || 'dark'; } catch { return 'dark'; }
}

export function toggleTheme() {
  return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
