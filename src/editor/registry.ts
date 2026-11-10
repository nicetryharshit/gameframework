// The component schemas the editor knows about: the built-ins plus the Flappy Bird game's own.

import { createDefaultRegistry } from '../scene/index';
import { flappyBirdSchema } from '../flappy-schema';

export const registry = createDefaultRegistry().register(flappyBirdSchema);
