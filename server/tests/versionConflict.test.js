import { describe, it, expect } from 'vitest';
import { VersionConflictError } from '../db/pgStore.js';

describe('Optimistic locking', () => {
  describe('VersionConflictError', () => {
    it('is an Error instance', () => {
      const err = new VersionConflictError('test-player');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(VersionConflictError);
    });

    it('contains the player ID in the message', () => {
      const err = new VersionConflictError('player-123');
      expect(err.message).toContain('player-123');
    });

    it('has name VersionConflictError', () => {
      const err = new VersionConflictError('p1');
      expect(err.name).toBe('VersionConflictError');
    });
  });
});
