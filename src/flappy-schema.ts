/**
 * The editor's view of the Flappy bird component. Editor-only: games made from the template do not need it,
 * so it is kept out of flappy.ts, which must stay free of editor and scene-module imports.
 */
import type { ComponentSchema } from './scene/index';
import { birdLimits, FLAPPY_BIRD, flight, jumpKeys } from './flappy';

export const flappyBirdSchema: ComponentSchema = {
  name: FLAPPY_BIRD,
  fields: {
    size: { type: 'number', default: flight.radius * 2, min: birdLimits.size[0], max: birdLimits.size[1] },
    jumpSpeed: { type: 'number', default: -flight.flapSpeed, min: birdLimits.jumpSpeed[0], max: birdLimits.jumpSpeed[1] },
    gravity: { type: 'number', default: flight.gravity, min: birdLimits.gravity[0], max: birdLimits.gravity[1] },
    jumpKey: { type: 'enum', default: 'Space', options: jumpKeys }
  }
};
