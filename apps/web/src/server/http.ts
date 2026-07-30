import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
    return NextResponse.json({ message: error.message, statusCode: error.status }, { status: error.status });
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
