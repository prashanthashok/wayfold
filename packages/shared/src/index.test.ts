import { describe, expect, it } from 'vitest';

import { idSchema } from './index';

describe('idSchema', () => {
  it('accepts a UUID', () => {
    expect(idSchema.safeParse('3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a3b').success).toBe(true);
  });

  it('rejects a non-UUID', () => {
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
