import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { formatDay, prdSummary } from "./format";
import { StatusChip } from "./ui";

const ROLE_LABELS = { editor: "Editor", viewer: "Viewer" };

function ownerNames(owners) {
  return owners.map((owner) => owner.name ?? "Unnamed member").join(", ") || "Unknown";
}

// "Shared with me" (Decision 8): PRDs someone invited this person to, with
// their role. The owner's name and the owner's project only come with each
// PRD's detail read, so they fill in afterwards; the project is a plain label
// because this person can't open it.
function SharedPrds({ prds, onOpenPrd }) {
  const [details, setDetails] = useState({}); // id -> { owners, project } or { failed: true }

  const ids = prds.map((prd) => prd.id).join(",");
  useEffect(() => {
    let current = true;
    ids.split(",").filter(Boolean).forEach((id) => {
      api
        .getPrd(id)
        .then((row) => ({ owners: row.owners ?? [], project: row.project ?? null }))
        .catch(() => ({ failed: true }))
        .then((detail) => {
          if (current) setDetails((known) => ({ ...known, [id]: detail }));
        });
    });
    return () => {
      current = false;
    };
  }, [ids]);

  return (
    <section className="nw-section" aria-labelledby="nw-shared-h">
      <h2 id="nw-shared-h" className="nw-h2">
        Shared with me
      </h2>
      <div className="nw-table-card">
        <table className="nw-table">
          <thead>
            <tr>
              <th scope="col">PRD</th>
              <th scope="col">Your role</th>
              <th scope="col">Owner</th>
              <th scope="col">Project</th>
              <th scope="col">Status</th>
              <th scope="col" aria-sort="descending">
                Updated <span aria-hidden="true">↓</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {prds.map((prd) => {
              const summary = prdSummary(prd);
              const detail = details[prd.id];
              let owner = <span className="nw-muted">Loading…</span>;
              let project = owner;
              if (detail?.failed) {
                owner = <span className="nw-muted">Not available</span>;
                project = owner;
              } else if (detail) {
                owner = ownerNames(detail.owners);
                project = detail.project?.name ?? <span className="nw-muted">No project</span>;
              }
              return (
                <tr key={prd.id}>
                  <td>
                    <button type="button" className="nw-row-title" onClick={() => onOpenPrd(prd)}>
                      {prd.title}
                    </button>
                    {summary ? <div className="nw-row-sub">{summary}</div> : null}
                  </td>
                  <td className="nw-nowrap">{ROLE_LABELS[prd.myRole]}</td>
                  <td>{owner}</td>
                  <td>{project}</td>
                  <td>
                    <StatusChip status={prd.status} reviewState={prd.reviewState} />
                  </td>
                  <td className="nw-nowrap nw-row-date">{formatDay(prd.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SharedPrds;
