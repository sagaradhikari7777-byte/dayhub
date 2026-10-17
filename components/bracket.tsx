"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Crown, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildBracket,
  champion,
  compareGame,
  findMatch,
  roundName,
} from "@/lib/bracket";
import type { Match, Player } from "@/lib/types";
import type { Actions } from "./app";
import { formatTime } from "./api";
import { MatchEditor } from "./match-editor";

export function Bracket(actions: Actions) {
  const { state, players } = actions;
  const t = state.tournament;
  const [openId, setOpenId] = useState<string | null>(null);
  const rounds = useMemo(
    () => (t.bracket ? buildBracket(t.bracket.order, t.results, t.format) : []),
    [t.bracket, t.results, t.format],
  );

  if (!t.bracket)
    return (
      <section className="card notice">
        <h2>The bracket isn’t drawn yet</h2>
        <p className="muted">
          {t.players.length} players registered so far. Once registration
          closes, the organisers will draw the matches and they’ll appear here.
        </p>
      </section>
    );

  const winner = champion(rounds);
  const open = openId ? findMatch(rounds, openId) : null;
  const done = rounds.flat().filter((m) => m.status === "done").length;
  const total = rounds.flat().filter((m) => !m.bye).length;

  return (
    <div className="stack">
      {winner && (
        <section className="card champion">
          <Crown size={28} />
          <div>
            <span className="muted small">Champion</span>
            <h2>{players.get(winner)?.name ?? winner}</h2>
          </div>
        </section>
      )}
      <p className="muted small">
        Best of {t.format} · {done} of {total} matches played · Tap a match for
        details
      </p>
      <div className="bracket" role="list">
        {rounds.map((round, r) => (
          <section key={r} className="round" role="listitem">
            <h3>{roundName(r, rounds.length)}</h3>
            <div className="round-matches">
              {round.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  players={players}
                  onOpen={() => setOpenId(m.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <Dialog.Root
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpenId(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="sheet" aria-describedby={undefined}>
            {open && (
              <MatchDetail
                match={open}
                rounds={rounds.length}
                {...actions}
                close={() => setOpenId(null)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function MatchCard({
  match: m,
  players,
  onOpen,
}: {
  match: Match;
  players: Map<string, Player>;
  onOpen: () => void;
}) {
  if (m.bye)
    return (
      <div className="match bye">
        <Slot tag={m.a} players={players} win={Boolean(m.a)} />
        <div className="slot muted small">Bye, advances automatically</div>
      </div>
    );
  const walkover = m.stale ? null : (m.result?.walkover ?? null);
  const showScore = !walkover && (m.status === "done" || m.status === "live");
  return (
    <button className={`match ${m.status}`} onClick={onOpen}>
      <Slot
        tag={m.a}
        players={players}
        win={m.winner !== null && m.winner === m.a}
        lose={m.winner !== null && m.winner !== m.a}
        score={showScore ? m.score.aWins : null}
        walkover={walkover === "a"}
      />
      <Slot
        tag={m.b}
        players={players}
        win={m.winner !== null && m.winner === m.b}
        lose={m.winner !== null && m.winner !== m.b}
        score={showScore ? m.score.bWins : null}
        walkover={walkover === "b"}
      />
      {m.status === "live" && (
        <div className="match-foot live">
          In progress · {m.score.games} game{m.score.games === 1 ? "" : "s"}{" "}
          played
        </div>
      )}
      {m.stale && <div className="match-foot warn">Re-enter result</div>}
    </button>
  );
}

function Slot({
  tag,
  players,
  win,
  lose,
  score,
  walkover,
}: {
  tag: string | null;
  players: Map<string, Player>;
  win?: boolean;
  lose?: boolean;
  score?: number | null;
  walkover?: boolean;
}) {
  const p = tag ? players.get(tag) : null;
  return (
    <div className={`slot${win ? " win" : ""}${lose ? " lose" : ""}`}>
      <span className="slot-name">
        {tag ? (p?.name ?? tag) : <span className="muted">TBD</span>}
      </span>
      {p?.townHallLevel && (
        <span className="muted small">TH{p.townHallLevel}</span>
      )}
      <span className="slot-score">
        {walkover ? "W/O" : score !== null && score !== undefined ? score : ""}
      </span>
    </div>
  );
}

function MatchDetail({
  match: m,
  rounds,
  state,
  players,
  admin,
  notify,
  close,
}: Actions & { match: Match; rounds: number; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const name = (tag: string | null) =>
    tag ? (players.get(tag)?.name ?? tag) : "TBD";
  const isAdmin = Boolean(state.admin);
  const result = m.stale ? null : m.result;
  const s = m.score;

  return (
    <>
      <div className="sheet-head">
        <div>
          <span className="muted small">
            {roundName(m.round, rounds)} · Match {m.index + 1} · Best of{" "}
            {state.tournament.format}
          </span>
          <Dialog.Title>
            {name(m.a)} vs {name(m.b)}
          </Dialog.Title>
        </div>
        <Dialog.Close className="icon-btn" aria-label="Close">
          <X size={18} />
        </Dialog.Close>
      </div>

      {editing && m.a && m.b ? (
        <MatchEditor
          match={m}
          format={state.tournament.format}
          aName={name(m.a)}
          bName={name(m.b)}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            if (await admin({ type: "saveResult", matchId: m.id, ...body })) {
              notify("Result saved");
              setEditing(false);
            }
          }}
          onClear={async () => {
            if (await admin({ type: "clearResult", matchId: m.id })) {
              notify("Result cleared");
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          {m.stale && (
            <p className="notice error small">
              An earlier result changed who plays here, so the saved result no
              longer applies. Enter it again.
            </p>
          )}
          {!result && !m.stale && (
            <p className="muted">
              {m.a && m.b
                ? "Not played yet."
                : "Waiting for the previous matches to finish."}
            </p>
          )}
          {result?.walkover && (
            <p className="summary">
              <strong>{name(m.winner)}</strong> advances by walkover.
            </p>
          )}
          {result && !result.walkover && (
            <>
              <div className="series">
                <div className={m.winner === m.a ? "win" : ""}>
                  <span>{name(m.a)}</span>
                  <strong>{s.aWins}</strong>
                </div>
                <span className="muted">–</span>
                <div className={m.winner === m.b ? "win" : ""}>
                  <strong>{s.bWins}</strong>
                  <span>{name(m.b)}</span>
                </div>
              </div>
              <Lead match={m} name={name} />
              <table className="games">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{name(m.a)}</th>
                    <th>{name(m.b)}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.games.map((g, i) => {
                    const c = compareGame(g);
                    return (
                      <tr key={i}>
                        <td className="muted">{i + 1}</td>
                        <td className={c > 0 ? "win" : ""}>
                          <AttackCell {...g.a} />
                        </td>
                        <td className={c < 0 ? "win" : ""}>
                          <AttackCell {...g.b} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="totals">
                    <td className="muted">Total</td>
                    <td>
                      {s.aStars}★ · avg {s.aDestruction}%
                    </td>
                    <td>
                      {s.bStars}★ · avg {s.bDestruction}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {result?.note && <p className="muted small">“{result.note}”</p>}
          {result && (
            <p className="muted small">
              Entered by {result.updatedBy} ·{" "}
              {new Date(result.updatedAt).toLocaleString()}
            </p>
          )}
          <div className="actions">
            {isAdmin && m.a && m.b && (
              <button className="btn primary" onClick={() => setEditing(true)}>
                {result ? "Edit result" : "Enter result"}
              </button>
            )}
            <button className="btn" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Lead({
  match: m,
  name,
}: {
  match: Match;
  name: (tag: string | null) => string;
}) {
  const s = m.score;
  if (!m.winner)
    return (
      <p className="summary muted">
        Match in progress, {s.games} game{s.games === 1 ? "" : "s"} played.
      </p>
    );
  const aWon = m.winner === m.a;
  const stars = aWon ? s.aStars - s.bStars : s.bStars - s.aStars;
  const pct =
    Math.round(
      (aWon
        ? s.aDestruction - s.bDestruction
        : s.bDestruction - s.aDestruction) * 10,
    ) / 10;
  return (
    <p className="summary">
      <strong>{name(m.winner)}</strong> advances{" "}
      {aWon ? `${s.aWins}–${s.bWins}` : `${s.bWins}–${s.aWins}`}
      {stars !== 0 && (
        <>
          {" "}
          · {stars > 0 ? "+" : ""}
          {stars} star{Math.abs(stars) === 1 ? "" : "s"}
        </>
      )}
      {pct !== 0 && (
        <>
          {" "}
          · {pct > 0 ? "+" : ""}
          {pct}% avg destruction
        </>
      )}
    </p>
  );
}

function AttackCell({
  stars,
  destruction,
  seconds,
}: {
  stars: number;
  destruction: number;
  seconds: number | null;
}) {
  return (
    <span className="attack">
      <span className="stars" aria-label={`${stars} stars`}>
        {[0, 1, 2].map((i) => (
          <Star key={i} size={12} className={i < stars ? "on" : ""} />
        ))}
      </span>
      <span>{destruction}%</span>
      {seconds !== null && <span className="muted">{formatTime(seconds)}</span>}
    </span>
  );
}
