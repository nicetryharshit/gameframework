import { Application } from 'pixi.js';

/** Pixi owns drawing; the framework game loop controls when frames render. */
export async function createPixiRenderer(container: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: container, background: '#172334', autoStart: false, sharedTicker: false });
  app.ticker.stop();
  container.appendChild(app.canvas);
  return app;
}
