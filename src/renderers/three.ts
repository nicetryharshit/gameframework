import { PerspectiveCamera, WebGLRenderer } from 'three';

/** Creates a canvas and keeps the renderer and camera matched to its container. */
export function createThreeRenderer(container: HTMLElement, camera: PerspectiveCamera) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const resize = () => {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container); resize();
  return { renderer, dispose() { observer.disconnect(); renderer.dispose(); renderer.domElement.remove(); } };
}
