import { NextResponse } from "next/server";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url),
      q = u.searchParams.get("q");
    if (q) {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.slice(0, 100))}&count=5&language=en&format=json`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) },
      );
      if (!r.ok) throw new Error();
      return NextResponse.json(await r.json());
    }
    const lat = Number(u.searchParams.get("lat")),
      lon = Number(u.searchParams.get("lon"));
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return NextResponse.json(
        { error: "Choose a valid location." },
        { status: 400 },
      );
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`,
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw new Error();
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json(
      { error: "Weather is temporarily unavailable. Try again shortly." },
      { status: 503 },
    );
  }
}
