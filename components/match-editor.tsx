"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { compareGame, seriesWinner, winsNeeded } from "@/lib/bracket";
import type { BattleMode, Format, Game, Match } from "@/lib/types";
import { formatTime, parseTime } from "./api";

type Draft = { stars: number; destruction: string; time: string };
type DraftGame = { a: Draft; b: Draft };

const blank = (): DraftGame => ({
  a: { stars: 0, destruction: "", time: "" },
  b: { stars: 0, destruction: "", time: "" },
});

function toGame(d: DraftGame): Game | string {
  const side = (s: Draft, who: string) => {
    const destruction = Number(s.destruction.replace(",", "."));
    if (
      s.destruction.trim() === "" ||
      !(destruction >= 0 && destruction <= 100)
    )
      return `${who}: destruction must be 0–100%`;
    const seconds = parseTime(s.time);
    if (seconds === undefined) return `${who}: time must look like 2:15`;
    if (s.stars === 3 && destruction !== 100)
      return `${who}: 3 stars means 100% destruction`;
    return {
      stars: s.stars,
      destruction: Math.round(destruction * 10) / 10,
      seconds,
    };
  };
  const a = side(d.a, "Player 1");
  if (typeof a === "string") return a;
  const b = side(d.b, "Player 2");
  if (typeof b === "string") return b;
  return { a, b };
}

export function MatchEditor({
  match,
  format,
  aName,
  bName,
  onSave,
  onCancel,
  onClear,
}: {
  match: Match;
  format: Format;
  aName: string;
  bName: string;
  onSave: (body: {
    games: Game[];
    walkover: "a" | "b" | null;
    mode: BattleMode;
    note: string;
  }) => Promise<void>;
  onCancel: () => void;
  onClear: () => Promise<void>;
}) {
  const saved = match.stale ? null : match.result;
  const [games, setGames] = useState<DraftGame[]>(() =>
    saved?.games.length
      ? saved.games.map((g) => ({
          a: {
            stars: g.a.stars,
            destruction: String(g.a.destruction),
            time: formatTime(g.a.seconds),
          },
          b: {
            stars: g.b.stars,
            destruction: String(g.b.destruction),
            time: formatTime(g.b.seconds),
          },
        }))
      : Array.from({ length: winsNeeded(format) }, blank),
  );
  const [walkover, setWalkover] = useState<"a" | "b" | null>(
    saved?.walkover ?? null,
  );
  const [mode, setMode] = useState<BattleMode>(saved?.mode ?? "normal");
  const [note, setNote] = useState(saved?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = games.map(toGame);
  const valid = parsed.filter((g): g is Game => typeof g !== "string");
  const winnerSide =
    walkover ??
    (valid.length === parsed.length
      ? seriesWinner({ games: valid, walkover: null }, format)
      : null);

  const update = (i: number, who: "a" | "b", patch: Partial<Draft>) =>
    setGames((gs) =>
      gs.map((g, j) =>
        j === i ? { ...g, [who]: { ...g[who], ...patch } } : g,
      ),
    );

  const save = async () => {
    const problem = walkover ? null : parsed.find((g) => typeof g === "string");
    if (problem) {
      setError(problem as string);
      return;
    }
    if (
      !walkover &&
      !winnerSide &&
      !confirm("No winner yet. Save as in progress?")
    )
      return;
    setBusy(true);
    setError(null);
    await onSave({ games: walkover ? [] : valid, walkover, mode, note });
    setBusy(false);
  };

  return (
    <div className="editor stack">
      <div className="field">
        <span>Result type</span>
        <div className="segmented">
          <button
            className={walkover === null ? "active" : ""}
            onClick={() => setWalkover(null)}
          >
            Played
          </button>
          <button
            className={walkover === "a" ? "active" : ""}
            onClick={() => setWalkover("a")}
          >
            W/O {aName}
          </button>
          <button
            className={walkover === "b" ? "active" : ""}
            onClick={() => setWalkover("b")}
          >
            W/O {bName}
          </button>
        </div>
      </div>

      {walkover === null && (
        <div className="field">
          <span>Battle mode</span>
          <div className="segmented">
            <button
              className={mode === "normal" ? "active" : ""}
              onClick={() => setMode("normal")}
            >
              Normal
            </button>
            <button
              className={mode === "hard" ? "active" : ""}
              onClick={() => setMode("hard")}
            >
              Hard Mode
            </button>
          </div>
        </div>
      )}

      {walkover === null &&
        games.map((g, i) => {
          const result = parsed[i];
          const c = typeof result === "string" ? null : compareGame(result);
          return (
            <fieldset key={i} className="game">
              <legend>
                Game {i + 1}
                {c !== null && (
                  <span className="muted small">
                    {" "}
                    · {c > 0 ? aName : c < 0 ? bName : "Draw"}
                    {c !== 0 ? " wins" : ""}
                  </span>
                )}
              </legend>
              {(["a", "b"] as const).map((who) => (
                <div className="attack-row" key={who}>
                  <span className="attack-name">
                    {who === "a" ? aName : bName}
                  </span>
                  <div
                    className="star-pick"
                    role="radiogroup"
                    aria-label="Stars"
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <button
                        key={n}
                        role="radio"
                        aria-checked={g[who].stars === n}
                        className={g[who].stars === n ? "active" : ""}
                        onClick={() =>
                          update(i, who, {
                            stars: n,
                            ...(n === 3 ? { destruction: "100" } : {}),
                          })
                        }
                      >
                        {n}★
                      </button>
                    ))}
                  </div>
                  <input
                    className="input pct"
                    inputMode="decimal"
                    placeholder="%"
                    aria-label="Destruction percent"
                    value={g[who].destruction}
                    onChange={(e) =>
                      update(i, who, { destruction: e.target.value })
                    }
                  />
                  <input
                    className="input time"
                    placeholder="time"
                    aria-label="Attack time, for example 2:15 (optional)"
                    value={g[who].time}
                    onChange={(e) => update(i, who, { time: e.target.value })}
                  />
                </div>
              ))}
              {games.length > 1 && (
                <button
                  className="link-btn danger small"
                  onClick={() => setGames((gs) => gs.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} /> Remove game
                </button>
              )}
            </fieldset>
          );
        })}

      {walkover === null && games.length < format + 2 && (
        <button
          className="btn"
          onClick={() => setGames((gs) => [...gs, blank()])}
        >
          <Plus size={16} /> Add game
        </button>
      )}

      <label className="field">
        <span>Note (optional)</span>
        <input
          className="input"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <p className="summary">
        {winnerSide ? (
          <>
            <strong>{winnerSide === "a" ? aName : bName}</strong> advances
          </>
        ) : (
          <span className="muted">
            No winner yet. First to {winsNeeded(format)} game wins. Ties go to
            stars, then destruction, then faster time.
          </span>
        )}
      </p>
      {error && <p className="error-text small">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save result"}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {saved && (
          <button
            className="btn danger"
            onClick={() => confirm("Clear this result?") && onClear()}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
