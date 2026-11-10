/**
 * Field types a component can declare. Each one can be drawn by the inspector without special cases.
 * Each field has a default; stored scenes leave out values that equal their default.
 * An `asset` field holds a path inside the project's assets folder, such as "images/crate.png".
 */
export type FieldSpec =
  | { readonly type: 'number'; readonly default: number; readonly min?: number; readonly max?: number }
  | { readonly type: 'string'; readonly default: string }
  | { readonly type: 'boolean'; readonly default: boolean }
  | { readonly type: 'enum'; readonly default: string; readonly options: readonly string[] }
  | { readonly type: 'asset'; readonly default: string; readonly kind: 'image' | 'audio' }
  | { readonly type: 'color'; readonly default: string }
  | { readonly type: 'points'; readonly default: readonly Point2[] };

/** A point in an entity's local units. */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export type FieldValue = number | string | boolean | readonly Point2[];

/** Describes one component: its name and the fields the editor and loader understand. */
export interface ComponentSchema {
  readonly name: string;
  readonly fields: Readonly<Record<string, FieldSpec>>;
}

/** Data stored under one component name in a scene. Unknown fields and unknown components are kept as they are. */
export type ComponentData = Record<string, unknown>;

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Returns a plain-language reason the value is wrong for this field, or null when it is fine. */
export function checkValue(spec: FieldSpec, value: unknown): string | null {
  switch (spec.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number';
      if (spec.min !== undefined && value < spec.min) return `must be at least ${spec.min}`;
      if (spec.max !== undefined && value > spec.max) return `must be at most ${spec.max}`;
      return null;
    case 'string':
      return typeof value === 'string' ? null : 'must be text';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'enum':
      return typeof value === 'string' && spec.options.includes(value) ? null : `must be one of ${spec.options.join(', ')}`;
    case 'asset':
      return typeof value === 'string' ? null : 'must be an asset path';
    case 'color':
      return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? null : 'must be a colour such as #ff8800';
    case 'points':
      if (!Array.isArray(value)) return 'must be a list of points';
      return value.every(point => typeof point?.x === 'number' && typeof point?.y === 'number' && Number.isFinite(point.x) && Number.isFinite(point.y))
        ? null
        : 'must be a list of points with x and y numbers';
  }
}

export function defaultsFor(schema: ComponentSchema): ComponentData {
  const out: ComponentData = {};
  for (const [field, spec] of Object.entries(schema.fields)) out[field] = spec.default;
  return out;
}

/** Holds the component schemas a scene may use. Components with no schema are still kept on load and save. */
export class ComponentRegistry {
  private readonly schemas = new Map<string, ComponentSchema>();

  constructor(schemas: readonly ComponentSchema[] = []) {
    for (const schema of schemas) this.register(schema);
  }

  register(schema: ComponentSchema): this {
    if (!NAME_PATTERN.test(schema.name)) {
      throw new Error(`Component name "${schema.name}" must be lowercase letters, digits and dashes, starting with a letter.`);
    }
    if (this.schemas.has(schema.name)) throw new Error(`Component "${schema.name}" is already registered.`);
    for (const [field, spec] of Object.entries(schema.fields)) {
      const error = checkValue(spec, spec.default);
      if (error) throw new Error(`The default for ${schema.name}.${field} ${error}.`);
    }
    this.schemas.set(schema.name, schema);
    return this;
  }

  get(name: string): ComponentSchema | undefined {
    return this.schemas.get(name);
  }

  names(): string[] {
    return [...this.schemas.keys()];
  }
}

/** Position, rotation in degrees, and scale. Every entity has one; it is the only component the hierarchy uses. */
export const transformSchema: ComponentSchema = {
  name: 'transform',
  fields: {
    x: { type: 'number', default: 0 },
    y: { type: 'number', default: 0 },
    rotation: { type: 'number', default: 0 },
    scaleX: { type: 'number', default: 1 },
    scaleY: { type: 'number', default: 1 }
  }
};

/** What to draw: an image from the assets folder, sized in world units. Renderers decide the details. */
export const spriteSchema: ComponentSchema = {
  name: 'sprite',
  fields: {
    texture: { type: 'asset', kind: 'image', default: '' },
    width: { type: 'number', default: 1, min: 0 },
    height: { type: 'number', default: 1, min: 0 },
    layer: { type: 'number', default: 0 },
    tint: { type: 'color', default: '#ffffff' }
  }
};

/** A collision shape in the entity's local units. */
export const colliderSchema: ComponentSchema = {
  name: 'collider',
  fields: {
    shape: { type: 'enum', default: 'box', options: ['box', 'circle', 'polygon'] },
    width: { type: 'number', default: 1, min: 0 },
    height: { type: 'number', default: 1, min: 0 },
    radius: { type: 'number', default: 0.5, min: 0 },
    points: { type: 'points', default: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }] }
  }
};

/** Makes the entity's collider move under gravity. Without it, a collider is a fixed obstacle. */
export const rigidbodySchema: ComponentSchema = {
  name: 'rigidbody',
  fields: {
    type: { type: 'enum', default: 'dynamic', options: ['dynamic', 'static'] },
    gravityScale: { type: 'number', default: 1, min: 0 },
    density: { type: 'number', default: 1, min: 0 },
    bounce: { type: 'number', default: 0, min: 0, max: 1 }
  }
};

/** Plays a sound from the assets folder. The runtime starts it when play begins, if playOnStart is set. */
export const audioSchema: ComponentSchema = {
  name: 'audio',
  fields: {
    clip: { type: 'asset', kind: 'audio', default: '' },
    volume: { type: 'number', default: 1, min: 0, max: 1 },
    loop: { type: 'boolean', default: false },
    playOnStart: { type: 'boolean', default: true }
  }
};

export const builtInComponents: readonly ComponentSchema[] = [transformSchema, spriteSchema, colliderSchema, rigidbodySchema, audioSchema];

export function createDefaultRegistry(): ComponentRegistry {
  return new ComponentRegistry(builtInComponents);
}
