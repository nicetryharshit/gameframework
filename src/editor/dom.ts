// Small DOM helpers shared by the editor modules.

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in editor.html`);
  return element as T;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const node = element('button', undefined, label);
  node.type = 'button';
  if (title) node.title = title;
  node.addEventListener('click', onClick);
  return node;
}

export function option(value: string, label: string): HTMLOptionElement {
  const node = element('option', undefined, label);
  node.value = value;
  return node;
}

/** A labelled row for the inspector. */
export function fieldRow(label: string, control: HTMLElement): HTMLElement {
  const row = element('div', 'field');
  row.append(element('span', 'note', label), control);
  return row;
}
