import type { Role } from '../schemas/common';
import type { UpdatePlantBody } from '../schemas/plant';

export type Action =
  | 'group:view'
  | 'group:update'
  | 'group:delete'
  | 'group:leave'
  | 'plant:view'
  | 'plant:create'
  | 'plant:update:core'
  | 'plant:update:care'
  | 'plant:delete'
  | 'watering:record'
  | 'watering:undo'
  | 'member:invite'
  | 'member:remove';

const CARETAKER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'group:view',
  'group:leave',
  'plant:view',
  'plant:update:care',
  'watering:record',
  'watering:undo',
]);

/** Role matrix from contracts/rest-api.md#roles. */
export function can(role: Role, action: Action): boolean {
  if (role === 'owner') return action !== 'group:leave';
  return CARETAKER_ACTIONS.has(action);
}

type PlantField = keyof UpdatePlantBody;

const CORE_PLANT_FIELDS: readonly PlantField[] = ['name', 'intervalDays'];

/** Plant fields the role may NOT change. Caretakers may update only `location` and `notes`. */
export function restrictedPlantFields(role: Role): readonly PlantField[] {
  return role === 'owner' ? [] : CORE_PLANT_FIELDS;
}

/** True if the update touches any field restricted for this role. */
export function touchesRestrictedFields(role: Role, body: UpdatePlantBody): boolean {
  const restricted = restrictedPlantFields(role);
  return restricted.some((f) => body[f] !== undefined);
}
