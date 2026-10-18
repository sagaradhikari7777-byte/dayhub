// A simulated CWL season in the API's raw format: 8 clans, 15v15, rounds 1-4
// ended, round 5 in battle day, round 6 in preparation, round 7 unscheduled.
import type { RawLeagueGroup, RawWar } from "../../lib/cwl";

export const OUR_TAG = "#U0Y0R2GC";

type Member = { tag: string; name: string; townHallLevel: number };

export function fakeCwl(
  ourMembers: Member[] = Array.from({ length: 15 }, (_, i) => ({
    tag: `#OUR${i}`,
    name: `Ours ${i + 1}`,
    townHallLevel: 17 - (i % 3),
  })),
  seed = 42,
) {
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const names = [
    "Voldemort !!!",
    "Night Raiders",
    "Desert Kings",
    "Iron Legion",
    "Phoenix Fire",
    "Blue Vikings",
    "Shadow Clan",
    "Royal Titans",
  ];
  const clans = names.map((name, c) => ({
    tag: c === 0 ? OUR_TAG : `#CLAN${c}`,
    name,
    clanLevel: 15 + c,
    badgeUrls: {} as Record<string, string>,
    members:
      c === 0
        ? ourMembers
        : Array.from({ length: 20 }, (_, i) => ({
            tag: `#C${c}M${i}`,
            name: `${name.split(" ")[0]} ${i + 1}`,
            townHallLevel: 17 - (i % 4),
          })),
  }));

  // Round-robin: clan 0 fixed, the rest rotate.
  const rotation = [1, 2, 3, 4, 5, 6, 7];
  const wars = new Map<string, RawWar>();
  const rounds: { warTags: string[] }[] = [];
  for (let r = 0; r < 7; r++) {
    const order = [0, ...rotation.slice(r), ...rotation.slice(0, r)];
    const state = r < 4 ? "warEnded" : r === 4 ? "inWar" : "preparation";
    const tags: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = clans[order[i]],
        b = clans[order[7 - i]];
      const tag = `#W${r}${i}`;
      tags.push(r === 6 ? "#0" : tag);
      if (r === 6) continue;
      const lineup = (clan: (typeof clans)[number]) =>
        clan.members.slice(0, 15).map((m, p) => ({ ...m, mapPosition: p + 1 }));
      const la = lineup(a),
        lb = lineup(b);
      const attacks = (from: typeof la, to: typeof lb) =>
        from.map((m, p) => {
          const attacked =
            state === "warEnded"
              ? rand() > 0.07
              : state === "inWar" && rand() > 0.5;
          if (!attacked) return { ...m, townhallLevel: m.townHallLevel };
          const stars = rand() > 0.55 ? 3 : rand() > 0.3 ? 2 : 1;
          return {
            ...m,
            townhallLevel: m.townHallLevel,
            attacks: [
              {
                attackerTag: m.tag,
                defenderTag: to[p].tag,
                stars,
                destructionPercentage:
                  stars === 3 ? 100 : 50 + Math.floor(rand() * 49),
                duration: 80 + Math.floor(rand() * 100),
                order: p + 1,
              },
            ],
          };
        });
      const side = (
        clan: (typeof clans)[number],
        members: ReturnType<typeof attacks>,
      ) => {
        const made = members.filter((m) => "attacks" in m && m.attacks);
        return {
          tag: clan.tag,
          name: clan.name,
          badgeUrls: {},
          attacks: made.length,
          stars: made.reduce(
            (t, m) => t + ("attacks" in m ? m.attacks![0].stars : 0),
            0,
          ),
          destructionPercentage:
            made.reduce(
              (t, m) =>
                t + ("attacks" in m ? m.attacks![0].destructionPercentage : 0),
              0,
            ) / 15,
          members,
        };
      };
      // Put our clan on the opponent side sometimes, as the API does.
      const flip = order[i] === 0 && r % 2 === 1;
      const sa = side(a, attacks(la, lb)),
        sb = side(b, attacks(lb, la));
      wars.set(tag, {
        state,
        teamSize: 15,
        startTime: `2026110${r + 2}T200000.000Z`,
        endTime: `2026110${r + 3}T200000.000Z`,
        clan: flip ? sb : sa,
        opponent: flip ? sa : sb,
      });
    }
    rounds.push({ warTags: tags });
  }
  const group: RawLeagueGroup = {
    state: "inWar",
    season: "2026-11",
    clans,
    rounds,
  };
  return { group, wars };
}
