const media = matchMedia('(prefers-color-scheme: dark)');
let mode = 'light';
function update() { document.documentElement.classList.toggle('dark', mode === 'dark' || (mode === 'system' && media.matches)); }
media.addEventListener('change', update);
export function applyTheme(value) { mode = value; update(); }
