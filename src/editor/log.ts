// The console panel. Every message the editor shows the user goes through here.

import { byId, element } from './dom';

export type Level = 'info' | 'warn' | 'error';

const MAX_LOG_ENTRIES = 300;
const consoleEl = byId<HTMLElement>('console');

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Adds a line to the console. A link, such as a download, is optional. */
export function logMessage(level: Level, message: string, link?: { href: string; label: string }) {
  const entry = element('div', `entry ${level}`);
  entry.append(element('span', 'time', new Date().toLocaleTimeString()), element('span', 'text', message));
  if (link) {
    const anchor = element('a', undefined, link.label);
    anchor.href = link.href;
    anchor.download = '';
    entry.append(anchor);
  }
  consoleEl.append(entry);
  while (consoleEl.childElementCount > MAX_LOG_ENTRIES) consoleEl.firstElementChild?.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

export function clearConsole() {
  consoleEl.replaceChildren();
}
