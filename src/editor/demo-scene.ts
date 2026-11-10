// The scene the editor opens with when nothing else is loaded.

import { addEntity, emptyScene, type Scene } from '../scene/index';
import { registry } from './registry';

export function demoScene(): Scene {
  let scene = emptyScene();
  scene = addEntity(scene, {
    id: 'ship',
    components: { transform: { x: -2, y: 1, rotation: 20 }, sprite: { texture: 'images/ship.svg', width: 1.6, height: 1.6 } }
  }, registry);
  scene = addEntity(scene, {
    id: 'crate',
    components: { transform: { x: 3, y: -1 }, sprite: { texture: 'images/crate.svg' }, collider: { shape: 'box', width: 1, height: 1 } }
  }, registry);
  return scene;
}
