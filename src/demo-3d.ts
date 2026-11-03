import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { createThreeRenderer } from './renderers/three';
import { startDemo } from './demo';

void startDemo('3D / Three.js', async container => {
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 2, 6); camera.lookAt(0, 0, 0);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.2));
  const light = new DirectionalLight(0xffffff, 2); light.position.set(3, 5, 4); scene.add(light);
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ color: '#86e6bc' });
  const cube = new Mesh(geometry, material); scene.add(cube);
  const view = createThreeRenderer(container, camera);
  return {
    update(dt, input) {
      cube.position.x += (input.value('right') - input.value('left')) * 2 * dt;
      cube.position.y += (input.value('up') - input.value('down')) * 2 * dt;
      cube.rotation.y += dt;
    },
    render() { view.renderer.render(scene, camera); },
    dispose() { geometry.dispose(); material.dispose(); view.dispose(); }
  };
});
