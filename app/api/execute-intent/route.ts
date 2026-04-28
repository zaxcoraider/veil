import { NextRequest, NextResponse } from "next/server";

// Mock TEE price — in production the TEE fetches this from an oracle
const MOCK_PRICE = 1900;
// Mock condition — in production the TEE decrypts the handle and evaluates
const MOCK_CONDITION = "price < 2000";

function evaluateCondition(condition: string, currentPrice: number): boolean {
  const parts = condition.trim().split(" ");
  if (parts.length !== 3) return false;
  const operator = parts[1];
  const threshold = parseFloat(parts[2]);
  if (isNaN(threshold)) return false;
  if (operator === "<") return currentPrice < threshold;
  if (operator === ">") return currentPrice > threshold;
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.handle || typeof body.handle !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'handle' field" },
      { status: 400 }
    );
  }

  if (!body?.handleProof || typeof body.handleProof !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'handleProof' field" },
      { status: 400 }
    );
  }

  // TEE simulation: in production the TEE uses handle + handleProof to
  // decrypt the intent and evaluate the condition privately
  const shouldExecute = evaluateCondition(MOCK_CONDITION, MOCK_PRICE);

  if (shouldExecute) {
    return NextResponse.json({
      execute: true,
      price: MOCK_PRICE,
      tee: "iExec Nox",
      handle: body.handle,
    });
  }

  return NextResponse.json({
    execute: false,
    price: MOCK_PRICE,
    tee: "iExec Nox",
    handle: body.handle,
  });
}
