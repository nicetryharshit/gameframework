import { checkValue, createDefaultRegistry, defaultsFor, type ComponentData, type ComponentRegistry, type ComponentSchema } from './schema';
import { ancestorChain, SCENE_FORMAT, SCENE_VERSION, type Scene, type SceneEntity } from './scene';

export interface SceneLoadResult {
  readonly scene: Scene;
  /** Things that were fixed or ignored while loading. Show them to the designer; nothing here stops the load. */
  readonly warnings: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads one component. Known fields with a bad value fall back to their default with a warning. Unknown fields and
 * unknown components are kept exactly as stored, so a level edited on a machine without that adapter still round-trips.
 */
function readComponent(
  schema: ComponentSchema | undefined,
  name: string,
  entityId: string,
  data: Record<string, unknown>,
  warnings: string[]
): ComponentData {
  const copy = structuredClone(data);
  if (!schema) {
    warnings.push(`Component "${name}" on "${entityId}" has no registered schema, so its data is kept but not used.`);
    return copy;
  }
  const result: ComponentData = { ...defaultsFor(schema), ...copy };
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!(field in data)) continue;
    const error = checkValue(spec, data[field]);
    if (error) {
      warnings.push(`${name}.${field} on "${entityId}" ${error}; using ${JSON.stringify(spec.default)}.`);
      result[field] = spec.default;
    } else {
      result[field] = data[field];
    }
  }
  return result;
}

/** Reads a scene file. Throws for problems that would make the scene wrong (bad format, loops, missing parents). */
export function parseScene(text: string, registry: ComponentRegistry = createDefaultRegistry()): SceneLoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The scene file is not valid JSON.');
  }
  if (!isRecord(raw)) throw new Error('The scene file must contain a JSON object.');
  if (raw.format !== SCENE_FORMAT) throw new Error(`This is not a ${SCENE_FORMAT} file.`);
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('The scene file has no valid version number.');
  }
  if (version > SCENE_VERSION) {
    throw new Error(`The scene is format version ${version}, but this framework reads up to version ${SCENE_VERSION}. Update the framework.`);
  }
  if (!Array.isArray(raw.entities)) throw new Error('The scene file needs an "entities" list.');

  const warnings: string[] = [];
  const entities: SceneEntity[] = [];
  const ids = new Set<string>();

  raw.entities.forEach((item: unknown, index: number) => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') {
      throw new Error(`Entity ${index} needs a non-empty text id.`);
    }
    const id = item.id;
    if (ids.has(id)) throw new Error(`Two entities share the id "${id}".`);
    ids.add(id);

    const parent = item.parent ?? null;
    if (parent !== null && typeof parent !== 'string') throw new Error(`Entity "${id}" has an invalid parent.`);

    const rawComponents = item.components ?? {};
    if (!isRecord(rawComponents)) throw new Error(`Entity "${id}" has an invalid components block.`);
    const components: Record<string, ComponentData> = {};
    for (const [name, data] of Object.entries(rawComponents)) {
      if (!isRecord(data)) throw new Error(`Component "${name}" on "${id}" must be an object.`);
      components[name] = readComponent(registry.get(name), name, id, data, warnings);
    }
    entities.push({ id, parent, components });
  });

  for (const entity of entities) {
    if (entity.parent !== null && !ids.has(entity.parent)) {
      throw new Error(`Entity "${entity.id}" has parent "${entity.parent}", which is not in the scene.`);
    }
  }
  const scene: Scene = { entities };
  for (const entity of entities) ancestorChain(scene, entity.id);

  return { scene, warnings };
}

/** Leaves out known fields that equal their default, so files stay small and diffs stay readable. */
function compactComponent(schema: ComponentSchema | undefined, data: ComponentData): ComponentData {
  if (!schema) return structuredClone(data);
  const out: ComponentData = {};
  for (const [key, value] of Object.entries(data)) {
    const spec = schema.fields[key];
    if (spec && value === spec.default) continue;
    out[key] = structuredClone(value);
  }
  return out;
}

/** Writes a scene as a formatted JSON file. Parsing the output gives back the same scene. */
export function sceneToJson(scene: Scene, registry: ComponentRegistry = createDefaultRegistry()): string {
  const entities = scene.entities.map(entity => {
    const out: Record<string, unknown> = { id: entity.id };
    if (entity.parent !== null) out.parent = entity.parent;
    const components: Record<string, ComponentData> = {};
    for (const [name, data] of Object.entries(entity.components)) {
      components[name] = compactComponent(registry.get(name), data);
    }
    out.components = components;
    return out;
  });
  return `${JSON.stringify({ format: SCENE_FORMAT, version: SCENE_VERSION, entities }, null, 2)}\n`;
}
