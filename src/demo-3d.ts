import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry } from 'three';
import { createThreeRenderer } from './renderers/three';
import { startDemo } from './demo';
import { flight } from './flappy';

void startDemo('THREE / 3D', async container => {
  const camera = new PerspectiveCamera(2 * Math.atan(360 / 900) * 180 / Math.PI, 2 / 3, 1, 2000);
  camera.position.set(240, 360, 900); camera.lookAt(240, 360, 0);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3); light.position.set(-200, 700, 400); scene.add(light);
  const box = new BoxGeometry(1, 1, 1), sphere = new SphereGeometry(16, 16, 12);
  const green = new MeshStandardMaterial({ color: '#4e8b78' }), yellow = new MeshStandardMaterial({ color: '#efb650' }), ground = new MeshStandardMaterial({ color: '#91b592' });
  const bird = new Mesh(sphere, yellow); scene.add(bird);
  const pipes = Array.from({ length: 3 }, () => {
    const top = new Mesh(box, green), bottom = new Mesh(box, green); scene.add(top, bottom); return { top, bottom };
  });
  const floor = new Mesh(box, ground); floor.scale.set(480, 60, 35); floor.position.set(240, 30, 0); scene.add(floor);
  const view = createThreeRenderer(container, camera); view.renderer.setClearColor('#dceee9');
  return {
    render(game) {
      bird.position.set(flight.birdX, 720 - game.y, 0);
      game.pipes.forEach((pipe, i) => {
        const topHeight = pipe.center - flight.gap / 2, bottomY = pipe.center + flight.gap / 2;
        pipes[i].top.scale.set(flight.pipeWidth, topHeight, 30); pipes[i].top.position.set(pipe.x + flight.pipeWidth / 2, 720 - topHeight / 2, 0);
        pipes[i].bottom.scale.set(flight.pipeWidth, 720 - bottomY, 30); pipes[i].bottom.position.set(pipe.x + flight.pipeWidth / 2, (720 - bottomY) / 2, 0);
      });
      view.renderer.render(scene, camera);
    },
    dispose() { box.dispose(); sphere.dispose(); green.dispose(); yellow.dispose(); ground.dispose(); view.dispose(); }
  };
});
