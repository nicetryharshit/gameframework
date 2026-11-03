import { Graphics } from 'pixi.js';
import { createPixiRenderer } from './renderers/pixi';
import { startDemo } from './demo';

void startDemo('2D / PixiJS', async container => {
  const app = await createPixiRenderer(container);
  const player = new Graphics().circle(0, 0, 28).fill('#86e6bc');
  app.stage.addChild(player);
  let x = 150, y = 150;
  return {
    update(dt, input) {
      x += (input.value('right') - input.value('left')) * 220 * dt;
      y += (input.value('down') - input.value('up')) * 220 * dt;
      x = Math.max(28, Math.min(container.clientWidth - 28, x));
      y = Math.max(28, Math.min(container.clientHeight - 28, y));
      player.position.set(x, y);
    },
    render() { app.render(); },
    dispose() { app.destroy(true, { children: true }); }
  };
});
