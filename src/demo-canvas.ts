import { createCanvasRenderer } from './renderers/canvas';
import { startDemo } from './demo';
import { flight } from './flappy';
import './demo.css';

// Same scene as demo-2d.ts, drawn with the dependency-free 2D canvas in logical units (flight.width x flight.height).
void startDemo('CANVAS / 2D', async container => {
  const view = createCanvasRenderer(container);
  const ctx = view.context;
  const clouds = [[70, 110], [340, 200], [240, 60]];

  function drawWorld(game: { y: number; velocity: number; tuning: { radius: number }; pipes: { x: number; center: number }[] }): void {
    ctx.fillStyle = '#dceee9';
    ctx.fillRect(0, 0, flight.width, flight.height);
    ctx.fillStyle = '#f4faf4';
    for (const [x, y] of clouds) { ctx.beginPath(); ctx.ellipse(x, y, 55, 15, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#4e8b78';
    for (const pipe of game.pipes) {
      ctx.fillRect(pipe.x, pipe.center - flight.gap / 2 - 720, flight.pipeWidth, 720);
      ctx.fillRect(pipe.x, pipe.center + flight.gap / 2, flight.pipeWidth, 720);
    }
    ctx.fillStyle = '#c3d5b3'; ctx.fillRect(0, flight.floor, flight.width, 60);
    ctx.fillStyle = '#91b592'; ctx.fillRect(0, flight.floor, flight.width, 8);
    ctx.save();
    ctx.translate(flight.birdX, game.y);
    ctx.scale(game.tuning.radius / flight.radius, game.tuning.radius / flight.radius);
    ctx.rotate(Math.max(-0.4, Math.min(0.8, game.velocity / 650)));
    ctx.fillStyle = '#efb650';
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dc9440';
    ctx.beginPath(); ctx.ellipse(-5, 4, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#203f39';
    ctx.beginPath(); ctx.arc(8, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7744e';
    ctx.beginPath(); ctx.moveTo(17, -1); ctx.lineTo(28, 4); ctx.lineTo(17, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  return {
    render(game) {
      view.clear();
      ctx.save();
      ctx.scale(view.width / flight.width, view.height / flight.height);
      drawWorld(game);
      ctx.restore();
    },
    dispose() { view.dispose(); }
  };
});
