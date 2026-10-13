import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createOrder, OrderInputError } from "@/lib/orders";
import { siteUrl } from "@/lib/site-config";

// Naive in-memory rate limit, same approach as /api/leads — replace with a
// shared store (Upstash/Redis) if the site is ever scaled past one instance.
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

/**
 * POST /api/orders — save a customer order, return the WhatsApp link to send it.
 * Public by design (customers are not signed in); everything the client sends
 * is a reference that createOrder re-validates against the database.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const result = await createOrder(body, siteUrl);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Please check your order and try again.", issues: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    if (err instanceof OrderInputError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Order API error:", err);
    return NextResponse.json({ error: "Could not save your order." }, { status: 500 });
  }
}
