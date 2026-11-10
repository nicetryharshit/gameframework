import {
  checkValue,
  createDefaultRegistry,
  defaultsFor,
  transformSchema,
  type ComponentData,
  type ComponentRegistry,
  type FieldValue
} from './schema';

export const SCENE_FORMAT = 'gameframework.scene';
export const SCENE_VERSION = 1;

export interface SceneEntity {
  readonly id: string;
  /** Id of the parent entity, or null for a root. Ids are used rather than positions, so references survive edits. */
  readonly parent: string | null;
  /** Component data keyed by component name. */
  readonly components: Readonly<Record<string, ComponentData>>;
}

/**
 * A scene is a flat list of entities linked by parent id. Scenes are never mutated: every operation returns a new
 * scene, so an editor can keep the previous one for undo.
 */
export interface Scene {
  readonly entities: readonly SceneEntity[];
}

export interface Transform2D {
  readonly x: number;
  readonly y: number;
  /** Degrees, counter-clockwise. */
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface NewEntity {
  readonly id: string;
  readonly parent?: string | null;
  readonly components?: Readonly<Record<string, ComponentData>>;
}

const IDENTITY: Transform2D = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

export function emptyScene(): Scene {
  return { entities: [] };
}

export function getEntity(scene: Scene, id: string): SceneEntity {
  const found = scene.entities.find(entity => entity.id === id);
  if (!found) throw new Error(`No entity with id "${id}".`);
  return found;
}

export function childrenOf(scene: Scene, parent: string | null): SceneEntity[] {
  return scene.entities.filter(entity => entity.parent === parent);
}

/** Every entity below the given one, not including it. */
export function descendantIds(scene: Scene, id: string): Set<string> {
  const result = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const child of childrenOf(scene, current)) {
      if (child.id === id || result.has(child.id)) continue;
      result.add(child.id);
      pending.push(child.id);
    }
  }
  return result;
}

/** The entity and its ancestors, root first. Throws if the parent links form a loop. */
export function ancestorChain(scene: Scene, id: string): SceneEntity[] {
  const chain: SceneEntity[] = [];
  const seen = new Set<string>();
  let current: SceneEntity | undefined = getEntity(scene, id);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Entity "${id}" is part of a parent loop.`);
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent === null ? undefined : getEntity(scene, current.parent);
  }
  return chain;
}

/** Checks one component's data against its schema and returns it with defaults filled in. Throws on the first bad field. */
export function completeComponent(registry: ComponentRegistry, name: string, data: ComponentData): ComponentData {
  const schema = registry.get(name);
  if (!schema) return structuredClone(data);
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!(field in data)) continue;
    const error = checkValue(spec, data[field]);
    if (error) throw new Error(`${name}.${field} ${error}.`);
  }
  return { ...defaultsFor(schema), ...structuredClone(data) };
}

export function addEntity(scene: Scene, entity: NewEntity, registry: ComponentRegistry = createDefaultRegistry()): Scene {
  if (entity.id === '') throw new Error('An entity needs an id.');
  if (scene.entities.some(existing => existing.id === entity.id)) {
    throw new Error(`An entity with id "${entity.id}" already exists.`);
  }
  const parent = entity.parent ?? null;
  if (parent !== null) getEntity(scene, parent);
  const components: Record<string, ComponentData> = {};
  for (const [name, data] of Object.entries(entity.components ?? {})) {
    components[name] = completeComponent(registry, name, data);
  }
  return { entities: [...scene.entities, { id: entity.id, parent, components }] };
}

/** Removes the entity and everything below it. */
export function removeEntity(scene: Scene, id: string): Scene {
  getEntity(scene, id);
  const doomed = descendantIds(scene, id);
  doomed.add(id);
  return { entities: scene.entities.filter(entity => !doomed.has(entity.id)) };
}

/** Moves an entity under another one, or to the root with null. Refuses moves that would create a loop. */
export function setParent(scene: Scene, id: string, parent: string | null): Scene {
  getEntity(scene, id);
  if (parent !== null) {
    getEntity(scene, parent);
    if (parent === id || descendantIds(scene, id).has(parent)) {
      throw new Error(`"${id}" cannot be parented to "${parent}" because that would create a loop.`);
    }
  }
  return updateEntity(scene, id, entity => ({ ...entity, parent }));
}

/** Replaces a component's data after validating it. Missing fields take their defaults. */
export function setComponent(
  scene: Scene,
  id: string,
  name: string,
  data: ComponentData,
  registry: ComponentRegistry = createDefaultRegistry()
): Scene {
  getEntity(scene, id);
  const complete = completeComponent(registry, name, data);
  return updateEntity(scene, id, entity => ({ ...entity, components: { ...entity.components, [name]: complete } }));
}

/** Changes one field, adding the component with defaults if the entity does not have it yet. */
export function setField(
  scene: Scene,
  id: string,
  name: string,
  field: string,
  value: FieldValue,
  registry: ComponentRegistry = createDefaultRegistry()
): Scene {
  const entity = getEntity(scene, id);
  const schema = registry.get(name);
  if (!schema) throw new Error(`Unknown component "${name}".`);
  const spec = schema.fields[field];
  if (!spec) throw new Error(`Component "${name}" has no field "${field}".`);
  const error = checkValue(spec, value);
  if (error) throw new Error(`${name}.${field} ${error}.`);
  const current = entity.components[name] ?? defaultsFor(schema);
  return setComponent(scene, id, name, { ...current, [field]: value }, registry);
}

/** An entity's own transform, with defaults for anything missing. */
export function readTransform(entity: SceneEntity): Transform2D {
  const data = { ...defaultsFor(transformSchema), ...entity.components.transform };
  return {
    x: data.x as number,
    y: data.y as number,
    rotation: data.rotation as number,
    scaleX: data.scaleX as number,
    scaleY: data.scaleY as number
  };
}

/** Applies a child's local transform inside its parent's space. */
export function composeTransforms(parent: Transform2D, local: Transform2D): Transform2D {
  const radians = (parent.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const lx = local.x * parent.scaleX;
  const ly = local.y * parent.scaleY;
  return {
    x: parent.x + lx * cos - ly * sin,
    y: parent.y + lx * sin + ly * cos,
    rotation: parent.rotation + local.rotation,
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY
  };
}

/** Where an entity ends up in the world, after all its ancestors are applied. */
export function worldTransform(scene: Scene, id: string): Transform2D {
  return ancestorChain(scene, id).reduce<Transform2D>(
    (accumulated, entity) => composeTransforms(accumulated, readTransform(entity)),
    IDENTITY
  );
}

function updateEntity(scene: Scene, id: string, change: (entity: SceneEntity) => SceneEntity): Scene {
  return { entities: scene.entities.map(entity => (entity.id === id ? change(entity) : entity)) };
}

/** Removes one component from an entity. */
export function removeComponent(scene: Scene, id: string, name: string): Scene {
  const entity = getEntity(scene, id);
  if (!(name in entity.components)) throw new Error(`"${id}" has no ${name} component.`);
  const components: Record<string, ComponentData> = { ...entity.components };
  delete components[name];
  return updateEntity(scene, id, current => ({ ...current, components }));
}
