import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import InviteCard from "./InviteCard";
import { initialsOf } from "./format";
import { Alert, Avatar } from "./ui";

// People (admins only): the join code, and everyone in the organization with
// their org role. Read-only for now; changing roles and deactivating people
// need admin routes the backend doesn't have yet (E02).
function PeoplePage({ organization, userId }) {
  const orgId = organization.organization_id;
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

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

  const admins =
    members?.filter((member) => member.access_role === "admin").length ?? 0;

  const filteredMembers =
    members?.filter((member) => {
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
    }) ?? [];

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
          Members
        </h2>

        <div className="nw-filter">
          <input
            type="search"
            placeholder="Search people"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="nw-select"
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
                  <th scope="col">EMAIL</th>
                  <th scope="col">ORG ROLE</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <span className="nw-person">
                        <Avatar
                          initials={initialsOf(member.name, member.email)}
                        />
                        <span>
                          {member.name || member.email}
                          {member.user_id === userId ? (
                            <span className="nw-person-you"> (you)</span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="nw-person-email">{member.email}</td>
                    <td>
                      <span
                        className={`nw-role nw-role-${member.access_role}`}
                      >
                        {member.access_role === "admin" ? "Admin" : "Member"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default PeoplePage;