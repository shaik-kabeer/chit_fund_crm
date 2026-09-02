import { describe, expect, it } from 'vitest';
import { ApiError, parseBody, parseQuery } from './http';
import { z } from 'zod';

describe('HTTP Helpers', () => {
  describe('ApiError', () => {
    it('has correct status and message', () => {
      const err = new ApiError(422, 'Validation failed');
      expect(err.status).toBe(422);
      expect(err.message).toBe('Validation failed');
      expect(err.name).toBe('ApiError');
      expect(err).toBeInstanceOf(Error);
    });

    it('supports structured field errors', () => {
      const err = new ApiError(400, 'Invalid', { name: ['Too short'] });
      expect(err.errors).toEqual({ name: ['Too short'] });
    });
  });

  describe('parseBody', () => {
    const schema = z.object({
      name: z.string().min(2),
      age: z.number().int().positive(),
      email: z.string().email().optional(),
    });

    it('parses valid body', async () => {
      const request = new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ name: 'John', age: 30 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(schema, request);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('throws 400 for missing required field', async () => {
      const request = new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ name: 'J' }),
        headers: { 'Content-Type': 'application/json' },
      });

      await expect(parseBody(schema, request)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('includes structured field errors', async () => {
      const request = new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ name: 'A', age: -1, email: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });

      try {
        await parseBody(schema, request);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.status).toBe(400);
        expect(e.errors).toBeDefined();
        expect(Object.keys(e.errors).length).toBeGreaterThan(0);
      }
    });

    it('throws 400 for invalid JSON', async () => {
      const request = new Request('http://test', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      });

      await expect(parseBody(schema, request)).rejects.toMatchObject({
        status: 400,
        message: 'Invalid JSON body',
      });
    });

    it('strips unknown fields', async () => {
      const request = new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ name: 'John', age: 25, hackField: 'malicious' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(schema, request);
      expect(result).not.toHaveProperty('hackField');
    });
  });

  describe('parseQuery', () => {
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
    });

    it('parses valid query params', () => {
      const params = new URLSearchParams('page=2&limit=50&search=john');
      const result = parseQuery(querySchema, params);
      expect(result).toEqual({ page: 2, limit: 50, search: 'john' });
    });

    it('applies defaults for missing params', () => {
      const params = new URLSearchParams('');
      const result = parseQuery(querySchema, params);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('throws 400 for invalid query params', () => {
      const params = new URLSearchParams('page=abc');
      expect(() => parseQuery(querySchema, params)).toThrow();
    });

    it('throws 400 when limit exceeds max', () => {
      const params = new URLSearchParams('limit=500');
      expect(() => parseQuery(querySchema, params)).toThrow();
    });
  });
});
