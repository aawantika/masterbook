import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteRecipe, canEditRecipe } from '../src/auth/permissions.js';

describe('canDeleteRecipe', () => {
  test('the owner (non-admin) can delete their own recipe', () => {
    assert.equal(canDeleteRecipe({ ownerId: 1 }, { id: 1, role: 'user' }), true);
  });

  test('a non-admin cannot delete a recipe they do not own', () => {
    assert.equal(canDeleteRecipe({ ownerId: 1 }, { id: 2, role: 'user' }), false);
  });

  test('an admin can delete a recipe they do not own', () => {
    assert.equal(canDeleteRecipe({ ownerId: 1 }, { id: 2, role: 'admin' }), true);
  });

  test('an admin can delete their own recipe too', () => {
    assert.equal(canDeleteRecipe({ ownerId: 1 }, { id: 1, role: 'admin' }), true);
  });

  test('a legacy recipe with no owner cannot be deleted by a non-admin', () => {
    assert.equal(canDeleteRecipe({ ownerId: null }, { id: 1, role: 'user' }), false);
  });

  test('a legacy recipe with no owner can still be deleted by an admin', () => {
    assert.equal(canDeleteRecipe({ ownerId: null }, { id: 1, role: 'admin' }), true);
  });
});

// canEditRecipe is currently a straight alias for canDeleteRecipe (see the
// comment on it in permissions.ts) -- same table, to catch a future
// accidental divergence rather than trusting that by inspection.
describe('canEditRecipe', () => {
  test('the owner (non-admin) can edit their own recipe', () => {
    assert.equal(canEditRecipe({ ownerId: 1 }, { id: 1, role: 'user' }), true);
  });

  test('a non-admin cannot edit a recipe they do not own', () => {
    assert.equal(canEditRecipe({ ownerId: 1 }, { id: 2, role: 'user' }), false);
  });

  test('an admin can edit a recipe they do not own', () => {
    assert.equal(canEditRecipe({ ownerId: 1 }, { id: 2, role: 'admin' }), true);
  });

  test('a legacy recipe with no owner cannot be edited by a non-admin', () => {
    assert.equal(canEditRecipe({ ownerId: null }, { id: 1, role: 'user' }), false);
  });
});
