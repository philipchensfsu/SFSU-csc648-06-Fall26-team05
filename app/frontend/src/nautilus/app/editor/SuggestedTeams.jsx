import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import {
  addsLabel,
  describeDecideError,
  describeSuggestError,
  isSuggestionStale,
  suggestionResultSentence,
} from "./teamSuggestions";

// Viewer first: it's the safer default for a team someone else suggested.
const ROLES = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
];
const IDLE = { status: "idle" };
// After these, the suggestion can't be used any more: ask for a new one.
const SPENT = new Set(["recommendation_unavailable", "team_not_found", "team_not_recommended"]);

// "Suggest teams" in the Share dialog's team form (feature 08b): the AI
// suggests up to three teams with a reason each, and nothing changes until
// the owner picks which to add and as what.
// Props:
//   prdId, revision  the PRD, and the revision the dialog was opened with
//   busy             another change in the dialog is running
//   apply(request, options)  the dialog's change runner: it marks the dialog
//                    busy, sets the people list from what `request` resolves
//                    to, and refreshes the PRD. Resolves to true on success
//   canAsk           some team would bring someone new; without one, only the
//                    last result stays (after adding everyone, say)
export default function SuggestedTeams({ prdId, revision, busy, apply, canAsk }) {
  const ids = useId();
  const [state, setState] = useState(IDLE);
  // team_id -> { checked, role } for the teams on show.
  const [picks, setPicks] = useState({});
  const [adding, setAdding] = useState(false);
  const [decideError, setDecideError] = useState("");
  const [result, setResult] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function ask() {
    setState({ status: "loading" });
    setDecideError("");
    setResult("");
    try {
      const answer = await api.recommendTeams(prdId, revision);
      if (!mounted.current) return;
      const teams = answer.recommendation?.teams ?? [];
      setPicks(Object.fromEntries(teams.map((team) => [team.team_id, { checked: false, role: "viewer" }])));
      setState({ status: "shown", id: answer.recommendation.id, teams, baseRevision: answer.base_revision });
    } catch (error) {
      if (!mounted.current) return;
      setState({ status: error?.code === "no_eligible_teams" ? "note" : "error", message: describeSuggestError(error) });
    }
  }

  function pick(teamId, change) {
    setPicks((current) => ({ ...current, [teamId]: { ...current[teamId], ...change } }));
  }

  async function add() {
    const chosen = state.teams
      .filter((team) => picks[team.team_id]?.checked)
      .map((team) => ({ teamId: team.team_id, role: picks[team.team_id].role }));
    if (!chosen.length) return;
    setAdding(true);
    setDecideError("");
    let answer = null;
    let failure = null;
    const done = await apply(
      async () => {
        try {
          answer = await api.decideTeamRecommendation(prdId, state.id, chosen);
        } catch (error) {
          failure = error;
          throw error;
        }
        return answer.members;
      },
      { quiet: true },
    );
    if (!mounted.current) return;
    setAdding(false);
    if (done) {
      setResult(suggestionResultSentence(answer.results, state.teams));
      setState(IDLE);
    } else if (SPENT.has(failure?.code)) {
      setState({ status: "error", message: describeDecideError(failure) });
    } else {
      setDecideError(describeDecideError(failure));
    }
  }

  // An undecided suggestion changes nothing, so a failed rejection doesn't
  // matter: it's dropped here either way.
  function notNow() {
    api.decideTeamRecommendation(prdId, state.id, []).catch(() => {});
    setState(IDLE);
    setDecideError("");
  }

  if (state.status !== "shown") {
    const loading = state.status === "loading";
    if (!canAsk && state.status === "idle" && !result) return null;
    return (
      <div className="ne-suggest">
        {result ? (
          <p className="ne-share-result" role="status">
            <strong>{result}</strong>
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="nw-error" role="alert">
            {state.message}
          </p>
        ) : null}
        {state.status === "note" ? <p className="ne-share-note">{state.message}</p> : null}
        {canAsk || loading ? (
          <div className="ne-suggest-ask">
            <button
              type="button"
              className="nw-btn nw-btn-secondary nw-btn-sm"
              disabled={busy || loading}
              onClick={ask}
            >
              {loading ? "Finding teams…" : "Suggest teams"}
            </button>
            <span className="ne-share-note" role={loading ? "status" : undefined}>
              {loading
                ? "Nautilus is reading this PRD…"
                : "Nautilus reads this PRD and suggests teams. Nothing changes until you add them."}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const count = state.teams.filter((team) => picks[team.team_id]?.checked).length;
  const locked = busy || adding;
  return (
    <section className="ne-suggest is-open" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`} className="ne-suggest-title">
        Suggested teams
      </h4>
      {isSuggestionStale(state.baseRevision, revision) ? (
        <p className="ne-share-note">Suggested before the latest edits. You can still add them, or ask again.</p>
      ) : null}
      {state.teams.length ? (
        <ul className="ne-suggest-list">
          {state.teams.map((team) => {
            const choice = picks[team.team_id] ?? { checked: false, role: "viewer" };
            return (
              <li key={team.team_id} className={`ne-suggest-team${choice.checked ? " is-picked" : ""}`}>
                <label className="ne-suggest-pick">
                  <input
                    type="checkbox"
                    checked={choice.checked}
                    disabled={locked}
                    onChange={(event) => pick(team.team_id, { checked: event.target.checked })}
                  />
                  <span className="ne-share-name">{team.name}</span>
                  {team.department ? <span className="ne-share-email">{team.department}</span> : null}
                </label>
                <span className="ne-suggest-adds">{addsLabel(team.new_members)}</span>
                <select
                  className="nw-select ne-suggest-role"
                  aria-label={`Role for ${team.name}`}
                  value={choice.role}
                  disabled={locked}
                  onChange={(event) => pick(team.team_id, { role: event.target.value, checked: true })}
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                {/* Plain text from the AI: React escapes it. */}
                <p className="ne-suggest-reason">{team.reason}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ne-share-note">Nautilus didn’t find a team that fits this PRD.</p>
      )}
      {decideError ? (
        <p className="nw-error" role="alert">
          {decideError}
        </p>
      ) : null}
      <div className="ne-suggest-actions">
        <button type="button" className="nw-btn nw-btn-secondary nw-btn-sm" disabled={locked} onClick={notNow}>
          Not now
        </button>
        {state.teams.length ? (
          <button type="button" className="nw-btn nw-btn-primary nw-btn-sm" disabled={locked || !count} onClick={add}>
            {adding ? "Adding…" : count > 1 ? `Add ${count} teams` : "Add team"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
