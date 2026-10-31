"""Join codes: admins share their org's code, and a member sign-up uses it to
join as a member with no department or team."""

import re

from conftest import data_api

CODE = re.compile(r"^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$")


def org_with_admin(make_user):
    admin = make_user(org=False)
    org = admin.api("POST", "/organizations", json={"name": "Acme"}).json()["organization_id"]
    return admin, org


def join_code(admin, org):
    r = admin.api("GET", f"/organizations/{org}/join-code")
    assert r.status_code == 200, r.text
    return r.json()["join_code"]


def test_a_new_org_has_a_readable_code(make_user):
    admin, org = org_with_admin(make_user)
    assert CODE.match(join_code(admin, org))


def test_joining_makes_a_member_with_no_department_or_team(make_user, db):
    admin, org = org_with_admin(make_user)
    erin = make_user(org=False)
    r = erin.api("POST", "/organizations/join", json={"code": join_code(admin, org)})
    assert r.status_code == 200 and r.json() == {"organization_id": org}
    assert erin.api("GET", "/me").json()["organization"] == {"organization_id": org, "name": "Acme", "access_role": "member"}
    assert db.execute("select department_id from organization_member where organization_id = %s and user_id = %s",
                      (org, erin.id)).fetchone() == (None,)
    assert db.execute("select count(*) from team_member where user_id = %s", (erin.id,)).fetchone()[0] == 0


def test_codes_ignore_case_dashes_and_spaces(make_user):
    admin, org = org_with_admin(make_user)
    typed = " " + join_code(admin, org).lower().replace("-", " ") + " "
    assert make_user(org=False).api("POST", "/organizations/join", json={"code": typed}).status_code == 200


def test_joining_again_is_a_no_op(make_user, db):
    admin, org = org_with_admin(make_user)
    erin, code = make_user(org=False), join_code(admin, org)
    for _ in range(2):
        assert erin.api("POST", "/organizations/join", json={"code": code}).status_code == 200
    assert db.execute("select count(*) from organization_member where user_id = %s", (erin.id,)).fetchone()[0] == 1
    # The admin joining their own org keeps their admin role.
    assert admin.api("POST", "/organizations/join", json={"code": code}).status_code == 200
    assert admin.api("GET", "/me").json()["organization"]["access_role"] == "admin"


def test_someone_in_another_org_cannot_join(make_user):
    admin, org = org_with_admin(make_user)
    other_admin, _ = org_with_admin(make_user)
    r = other_admin.api("POST", "/organizations/join", json={"code": join_code(admin, org)})
    assert r.status_code == 409 and r.json()["code"] == "already_in_organization"


def test_a_wrong_code_is_404(make_user):
    r = make_user(org=False).api("POST", "/organizations/join", json={"code": "AAAA-BBBB-CCCC"})
    assert r.status_code == 404 and r.json()["code"] == "invalid_join_code"


def test_a_deactivated_member_cannot_rejoin(make_user, db):
    admin, org = org_with_admin(make_user)
    erin, code = make_user(org=False), join_code(admin, org)
    erin.api("POST", "/organizations/join", json={"code": code})
    db.execute("update organization_member set active = false where organization_id = %s and user_id = %s",
               (org, erin.id))
    r = erin.api("POST", "/organizations/join", json={"code": code})
    assert r.status_code == 403 and r.json()["code"] == "membership_inactive"
    assert db.execute("select active from organization_member where organization_id = %s and user_id = %s",
                      (org, erin.id)).fetchone() == (False,)


def test_regenerating_replaces_the_old_code(make_user):
    admin, org = org_with_admin(make_user)
    old = join_code(admin, org)
    r = admin.api("POST", f"/organizations/{org}/join-code")
    assert r.status_code == 200 and CODE.match(r.json()["join_code"]) and r.json()["join_code"] != old
    assert make_user(org=False).api("POST", "/organizations/join", json={"code": old}).status_code == 404
    assert make_user(org=False).api("POST", "/organizations/join", json={"code": r.json()["join_code"]}).status_code == 200


def test_only_admins_see_or_change_the_code(make_user):
    admin, org = org_with_admin(make_user)
    erin, outsider = make_user(org=False), make_user(org=False)
    erin.api("POST", "/organizations/join", json={"code": join_code(admin, org)})
    for method in ("GET", "POST"):
        assert erin.api(method, f"/organizations/{org}/join-code").status_code == 403
        assert outsider.api(method, f"/organizations/{org}/join-code").status_code == 404


def test_members_cannot_read_the_code_through_the_data_api(make_user):
    admin, org = org_with_admin(make_user)
    erin = make_user(org=False)
    erin.api("POST", "/organizations/join", json={"code": join_code(admin, org)})
    assert erin.rest("GET", f"organization?id=eq.{org}&select=join_code").status_code in (401, 403)
    assert erin.rest("GET", f"organization?id=eq.{org}&select=id,name").json() == [{"id": org, "name": "Acme"}]
    assert erin.rest("POST", "rpc/org_join_code", json={"target_org": org}).json() is None


def test_signed_out_callers_cannot_join():
    assert data_api("POST", "rpc/join_organization", json={"code": "AAAABBBBCCCC"}).status_code in (401, 403, 404)
