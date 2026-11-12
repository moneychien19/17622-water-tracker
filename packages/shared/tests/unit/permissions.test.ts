import { describe, expect, it } from 'vitest';
import { can, restrictedPlantFields, type Action } from '../../src/domain/permissions';

// Mirrors the Roles table in contracts/rest-api.md
const matrix: [Action, { owner: boolean; caretaker: boolean }][] = [
  ['group:view', { owner: true, caretaker: true }],
  ['plant:view', { owner: true, caretaker: true }],
  ['watering:record', { owner: true, caretaker: true }],
  ['watering:undo', { owner: true, caretaker: true }],
  ['plant:update:care', { owner: true, caretaker: true }],
  ['plant:create', { owner: true, caretaker: false }],
  ['plant:update:core', { owner: true, caretaker: false }],
  ['plant:delete', { owner: true, caretaker: false }],
  ['member:invite', { owner: true, caretaker: false }],
  ['member:remove', { owner: true, caretaker: false }],
  ['group:update', { owner: true, caretaker: false }],
  ['group:delete', { owner: true, caretaker: false }],
  ['group:leave', { owner: false, caretaker: true }],
];

describe('can(role, action)', () => {
  it.each(matrix)('%s', (action, expected) => {
    expect(can('owner', action)).toBe(expected.owner);
    expect(can('caretaker', action)).toBe(expected.caretaker);
  });
});

describe('restrictedPlantFields(role)', () => {
  it('lets owners update every field', () => {
    expect(restrictedPlantFields('owner')).toEqual([]);
  });

  it('limits caretakers to location and notes', () => {
    const restricted = restrictedPlantFields('caretaker');
    expect([...restricted].sort()).toEqual(['intervalDays', 'name']);
    expect(restricted).not.toContain('location');
    expect(restricted).not.toContain('notes');
  });
});
