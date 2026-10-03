import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'DrawAlong API',
      version: '1.0.0-push1',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
