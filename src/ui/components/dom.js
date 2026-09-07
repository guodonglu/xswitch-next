export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = value;
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(child);
  return node;
}
export function button(label, onClick, style = '', attrs = {}) {
  return el('button', { type: 'button', class: `btn ${style}`, onClick, ...attrs }, label);
}
export function field(label, input, hint) {
  const id = input.id || `field-${crypto.randomUUID()}`; input.id = id;
  return el('div', { class: 'space-y-1.5' }, el('label', { for: id, class: 'block text-xs font-medium' }, label), input,
    hint && el('p', { class: 'muted text-xs leading-5' }, hint));
}
export function icon(name, className = 'h-4 w-4') {
  const paths = {
    rules: 'M4 6h16M4 12h10M4 18h16m-3-9 3 3-3 3',
    agent: 'M12 3v3M8 3h8M5 7h14v13H5zM8 11h1m6 0h1m-7 5h6',
    transfer: 'M8 3v12m-4-4 4 4 4-4m4 10V9m-4 4 4-4 4 4',
    settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: className, 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] ?? paths.rules); svg.append(path); return svg;
}
