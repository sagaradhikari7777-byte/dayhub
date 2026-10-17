import { NextResponse } from "next/server";
import { CocError } from "./coc";
import { ConflictError, StorageError } from "./storage";
import { ActionError } from "./tournament";

export function errorResponse(error: unknown) {
  if (error instanceof ActionError)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof CocError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ConflictError)
    return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof StorageError)
    return NextResponse.json({ error: error.message }, { status: 503 });
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
