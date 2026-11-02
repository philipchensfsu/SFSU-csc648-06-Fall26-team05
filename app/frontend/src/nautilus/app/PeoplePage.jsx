import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import "./people.css";
import DeactivateDialog from "./DeactivateDialog";
import EditMemberDialog from "./EditMemberDialog";
import InviteCard from "./InviteCard";
import { initialsOf } from "./format";
import { IconMore } from "./icons";
import { personName } from "./people";
import { Alert, Avatar, MenuButton } from "./ui";

// Where someone sits, for the Directory table. Archived units are greyed out.
function Placement({ member, departments, teams }) {
  const places = [
    departments.find((department) => department.id === member.department_id),
    ...teams.filter((team) => member.team_ids?.includes(team.id)),
  ].filter(Boolean);
  if (!places.length) return "—";
  // One span, so the narrow table's flex cells keep the spaces around " · ".
  return (
    <span>
      {places.map((place, index) => (
        <span key={place.id} className={place.archived ? "nw-people-archived" : undefined}>
          {index ? " · " : ""}
          {place.name}
        </span>
      ))}
    </span>
  );
}

// People (admins only): the join code, and everyone in the organization with
// their org role, department, manager and title. The directory lists active
// members only and no route lists deactivated ones, so someone deactivated
// here stays visible until the page is left, and can't be reactivated yet.
function PeoplePage({ organization, userId }) {
  const orgId = organization.organization_id;
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [deactivated, setDeactivated] = useState([]);

  // Read again after every change: they have side effects, such as
  // deactivating someone clearing their head and lead positions.
  const reload = useCallback(
    () =>
      api
        .getDirectory(orgId)
        .then(setDirectory)
        .catch((reason) => setError(reason.message)),
    [orgId],
  );

  useEffect(() => {
    let current = true;
    api
      .getDirectory(orgId)
      .then((data) => current && setDirectory(data))
      .catch((reason) => current && setError(reason.message));
    return () => {
      current = false;
    };
  }, [orgId, attempt]);

  const members = directory?.members ?? null;
  const departments = directory?.departments ?? [];
  const teams = directory?.teams ?? [];

  const admins =
    members?.filter((member) => member.access_role === "admin").length ?? 0;

  const deactivatedIds = new Set(deactivated.map((member) => member.user_id));
  const rows = [
    ...(members ?? []).filter((member) => !deactivatedIds.has(member.user_id)),
    ...deactivated,
  ];

  const filteredMembers = rows.filter((member) => {
    const term = search.trim().toLowerCase();

    const matchesSearch =
      !term ||
      member.name?.toLowerCase().includes(term) ||
      member.email?.toLowerCase().includes(term) ||
      member.title?.toLowerCase().includes(term);

    const matchesDepartment =
      !departmentFilter ||
      member.department_id === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  return (
    <div className="nw-page">
      <div className="nw-head">
        <div>
          <h1 className="nw-h1">
            People in <span className="nw-serif">{organization.name}</span>
          </h1>
          <p className="nw-lede">
            {members
              ? `${members.length} ${
                  members.length === 1 ? "person" : "people"
                } · ${admins} ${
                  admins === 1 ? "admin" : "admins"
                }. Each PRD still chooses who can open it.`
              : "Everyone who has joined your organization."}
          </p>
        </div>
      </div>

      <InviteCard organization={organization} />

      <section className="nw-section" aria-labelledby="nw-people-h">
        <h2 id="nw-people-h" className="nw-h2">
          Directory
        </h2>

        <div className="nw-people-filters">
          <input
            type="search"
            className="nw-input"
            aria-label="Search people"
            placeholder="Search people"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="nw-select"
            aria-label="Department"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="">All departments</option>
            {departments
              .filter((department) => !department.archived)
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
          </select>
        </div>

        {error ? (
          <Alert
            onRetry={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            <strong>Couldn’t load the members.</strong> {error}
          </Alert>
        ) : !members ? (
          <p className="nw-loading" role="status">
            Loading members…
          </p>
        ) : (
          <div className="nw-table-card">
            <table className="nw-table nw-people-table">
              <thead>
                <tr>
                  <th scope="col">PERSON</th>
                  <th scope="col">DEPARTMENT · TEAM</th>
                  <th scope="col">ORG ROLE</th>
                  <th scope="col">STATUS</th>
                  <th scope="col">
                    <span className="nw-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const name = personName(member);
                  const isDeactivated = deactivatedIds.has(member.user_id);
                  const details = [
                    member.title,
                    member.name ? member.email : null,
                  ].filter(Boolean);
                  return (
                    <tr key={member.user_id}>
                      <td>
                        <span className="nw-person">
                          <Avatar
                            initials={initialsOf(member.name, member.email)}
                          />
                          <span className="nw-person-text">
                            <span>
                              {name}
                              {member.user_id === userId ? (
                                <span className="nw-person-you"> (you)</span>
                              ) : null}
                            </span>
                            {details.length ? (
                              <span className="nw-person-sub">
                                {details.join(" · ")}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Placement
                          member={member}
                          departments={departments}
                          teams={teams}
                        />
                      </td>
                      <td>
                        <span
                          className={`nw-role nw-role-${member.access_role}`}
                        >
                          {member.access_role === "admin" ? "Admin" : "Member"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`nw-chip ${
                            isDeactivated ? "nw-chip-draft" : "nw-chip-final"
                          }`}
                        >
                          {isDeactivated ? "Deactivated" : "Active"}
                        </span>
                      </td>
                      <td className="nw-row-actions">
                        {isDeactivated ? null : (
                          <MenuButton
                            label={`Actions for ${name}`}
                            items={[
                              {
                                label: "Edit",
                                onSelect: () => setEditing(member),
                              },
                              // Your own access stays; another admin can
                              // deactivate you.
                              ...(member.user_id === userId
                                ? []
                                : [
                                    {
                                      label: "Deactivate",
                                      danger: true,
                                      onSelect: () => setDeactivating(member),
                                    },
                                  ]),
                            ]}
                          >
                            <IconMore />
                          </MenuButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredMembers.length ? null : (
                  <tr>
                    <td colSpan={5} className="nw-table-empty">
                      No people match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing ? (
        <EditMemberDialog
          member={editing}
          organizationId={orgId}
          departments={departments}
          members={members}
          onSaved={reload}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deactivating ? (
        <DeactivateDialog
          member={deactivating}
          members={members}
          organizationId={orgId}
          onDeactivated={(member) => {
            setDeactivated((current) => [...current, member]);
            return reload();
          }}
          onClose={() => setDeactivating(null)}
        />
      ) : null}
    </div>
  );
}

export default PeoplePage;