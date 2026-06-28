const overlay = document.getElementById('overlay') as HTMLElement;

export function showOverlay(html: string): void {
  overlay.innerHTML = html;
  overlay.classList.remove('hidden');
}

export function hideOverlay(): void {
  overlay.classList.add('hidden');
}

/** Raw overlay element, for screens (like the world map) that build their own DOM. */
export function overlayEl(): HTMLElement {
  return overlay;
}
