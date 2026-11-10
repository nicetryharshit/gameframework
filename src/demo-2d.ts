import { Container, Graphics } from 'pixi.js';
import { createPixiRenderer } from './renderers/pixi';
import { startDemo } from './demo';
import { flight } from './flappy';
import './demo.css';

void startDemo('PIXI / 2D', async container => {
  const app = await createPixiRenderer(container);
  const world = new Container(); app.stage.addChild(world);
  world.addChild(new Graphics().rect(0, 0, 480, 720).fill('#dceee9'));
  const clouds = new Graphics();
  for (const [x, y] of [[70, 110], [340, 200], [240, 60]]) clouds.ellipse(x, y, 55, 15).fill('#f4faf4');
  world.addChild(clouds);
  const pipes = Array.from({ length: 3 }, () => {
    const top = new Graphics().rect(0, -720, flight.pipeWidth, 720).fill('#4e8b78');
    const bottom = new Graphics().rect(0, 0, flight.pipeWidth, 720).fill('#4e8b78');
    world.addChild(top, bottom); return { top, bottom };
  });
  const bird = new Container();
  bird.addChild(new Graphics().ellipse(0, 0, 19, 15).fill('#efb650').ellipse(-5, 4, 10, 7).fill('#dc9440').circle(8, -5, 3).fill('#203f39').poly([17, -1, 28, 4, 17, 8]).fill('#d7744e'));
  world.addChild(bird);
  world.addChild(new Graphics().rect(0, flight.floor, 480, 60).fill('#c3d5b3').rect(0, flight.floor, 480, 8).fill('#91b592'));
  return {
    setRenderScale(scale) { app.renderer.resolution = Math.min(2, (window.devicePixelRatio || 1) * scale); app.resize(); },
    render(game) {
      world.scale.set(app.screen.width / flight.width, app.screen.height / flight.height);
      bird.position.set(flight.birdX, game.y); bird.scale.set(game.tuning.radius / flight.radius); bird.rotation = Math.max(-0.4, Math.min(0.8, game.velocity / 650));
      game.pipes.forEach((pipe, i) => { pipes[i].top.position.set(pipe.x, pipe.center - flight.gap / 2); pipes[i].bottom.position.set(pipe.x, pipe.center + flight.gap / 2); });
      app.render();
    },
    dispose() { app.destroy(true, { children: true }); }
  };
});
