import { NextResponse } from 'next/server';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { message: error.message, statusCode: error.status, ...(error.errors ? { errors: error.errors } : {}) },
      { status: error.status },
    );
  }
  console.error(error);
  return NextResponse.json({ message: 'Internal server error', statusCode: 500 }, { status: 500 });
}

export async function readJson<T = any>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
}

export async function parseBody<T extends z.ZodType>(
  schema: T,
  request: Request,
): Promise<z.infer<T>> {
  const raw = await readJson(request);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    const firstMsg = result.error.issues[0]?.message || 'Validation failed';
    throw new ApiError(400, firstMsg, fieldErrors);
  }
  return result.data;
}

export function parseQuery<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams,
): z.infer<T> {
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => { raw[key] = value; });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstMsg = result.error.issues[0]?.message || 'Invalid query parameters';
    throw new ApiError(400, firstMsg);
  }
  return result.data;
}
