/**
 * Field types a component can declare. There are only four, so an inspector can draw each one without special cases.
 * Each field has a default; stored scenes leave out values that equal their default.
 */
export type FieldSpec =
  | { readonly type: 'number'; readonly default: number; readonly min?: number; readonly max?: number }
  | { readonly type: 'string'; readonly default: string }
  | { readonly type: 'boolean'; readonly default: boolean }
  | { readonly type: 'enum'; readonly default: string; readonly options: readonly string[] };

export type FieldValue = number | string | boolean;

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

/** What to draw. Renderer-neutral: a renderer decides how to show the texture, layer and tint. */
export const spriteSchema: ComponentSchema = {
  name: 'sprite',
  fields: {
    texture: { type: 'string', default: '' },
    layer: { type: 'number', default: 0 },
    tint: { type: 'string', default: '#ffffff' }
  }
};

/** A collision shape in the entity's local units. The physics adapter decides how to build it. */
export const colliderSchema: ComponentSchema = {
  name: 'collider',
  fields: {
    shape: { type: 'enum', default: 'box', options: ['box', 'circle'] },
    width: { type: 'number', default: 1, min: 0 },
    height: { type: 'number', default: 1, min: 0 },
    radius: { type: 'number', default: 0.5, min: 0 }
  }
};

export const builtInComponents: readonly ComponentSchema[] = [transformSchema, spriteSchema, colliderSchema];

export function createDefaultRegistry(): ComponentRegistry {
  return new ComponentRegistry(builtInComponents);
}
