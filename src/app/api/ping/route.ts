import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('OK', { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
