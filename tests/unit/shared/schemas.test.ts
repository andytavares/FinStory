import { describe, it, expect } from 'vitest';
import { pathSchema, importSchema } from '@shared/schemas';

describe('export paths', () => {
  it('accepts an empty destination, which means "open a save dialog"', () => {
    expect(pathSchema.parse({ destPath: '' })).toEqual({ destPath: '' });
    expect(importSchema.parse({ srcPath: '' })).toEqual({ srcPath: '' });
  });

  it('accepts an explicit destination', () => {
    expect(pathSchema.parse({ destPath: '/tmp/x.json' }).destPath).toBe('/tmp/x.json');
  });

  it('still rejects a non-string destination', () => {
    expect(() => pathSchema.parse({ destPath: 5 })).toThrow();
  });
})
