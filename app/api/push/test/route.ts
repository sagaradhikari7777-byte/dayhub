import { NextResponse } from "next/server";
import { owner, sameOrigin } from "@/lib/auth";
import { sendTestPush } from "@/lib/push";
const attempts = new Map<string, number>();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const id = await owner(),
      now = Date.now();
    if (now - (attempts.get(id) || 0) < 30000)
      return NextResponse.json(
        { error: "Wait 30 seconds before sending another test." },
        { status: 429 },
      );
    attempts.set(id, now);
    const sent = await sendTestPush(id);
    return sent
      ? NextResponse.json({ sent })
      : NextResponse.json(
          {
            error: "Enable notifications on this device first, then try again.",
          },
          { status: 422 },
        );
  } catch {
    return NextResponse.json(
      { error: "The test notification could not be sent. Please try again." },
      { status: 503 },
    );
  }
}
