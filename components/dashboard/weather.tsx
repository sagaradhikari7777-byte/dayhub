"use client";
import { useEffect, useState } from "react";
import { CloudSun, CloudRain, Sun, MapPin, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
export function WeatherCard({ onLocation }: { onLocation: () => void }) {
  const { settings } = useStore();
  const [data, setData] = useState<{
      current: { temperature_2m: number; weather_code: number };
      daily: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    } | null>(null),
    [error, setError] = useState(false);
  const load = () => {
    setError(false);
    fetch(`/api/weather?lat=${settings.latitude}&lon=${settings.longitude}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setError(true));
  };
  useEffect(load, [settings.latitude, settings.longitude]);
  const code = data?.current.weather_code || 0;
  return (
    <div className="weather-card">
      <button className="weather-location" onClick={onLocation}>
        <MapPin size={13} />
        {settings.location}
      </button>
      {data ? (
        <>
          <div className="weather-main">
            <strong>
              {Math.round(data.current.temperature_2m)}
              <sup>°</sup>
            </strong>
            {code >= 50 ? <CloudRain /> : code > 0 ? <CloudSun /> : <Sun />}
          </div>
          <span>
            {code >= 50
              ? "Rainy"
              : code > 3
                ? "Cloudy"
                : code > 0
                  ? "Partly cloudy"
                  : "Clear skies"}
          </span>
          <small>
            H:{Math.round(data.daily.temperature_2m_max[0])}° L:
            {Math.round(data.daily.temperature_2m_min[0])}° · Rain{" "}
            {data.daily.precipitation_probability_max[0]}%
          </small>
        </>
      ) : error ? (
        <div className="weather-error">
          <CloudSun size={28} />
          <span>Weather unavailable</span>
          <button className="text-button" onClick={load}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : (
        <div className="weather-error shimmer">Checking the skies…</div>
      )}
    </div>
  );
}
