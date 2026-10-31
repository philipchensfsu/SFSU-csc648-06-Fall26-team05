"""A02 database rules against the local stack: who can call the AI record
functions and write durable context, through the Data API."""


from conftest import SERVICE_KEY, SUPABASE_URL, http

ZERO = "00000000-0000-0000-0000-000000000000"


def as_service(method, path, **kwargs):
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    return http.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, **kwargs)


def test_acceptance_functions_are_closed_even_to_the_service_role(make_user):
    # Only save_prd (a definer function) may call these, inside the save.
    take = {"p_actor": ZERO, "p_prd_id": ZERO, "p_generation_record_id": ZERO, "p_base_revision": 1}
    apply_patch = {"p_prd_id": ZERO, "p_patch": {}}
    for function, body in (("ai_take_proposal", take), ("ai_apply_context_patch", apply_patch)):
        assert as_service("POST", f"rpc/{function}", json=body).status_code in (401, 403, 404)
        assert make_user().rest("POST", f"rpc/{function}", json=body).status_code in (401, 403, 404)


def test_recording_is_for_the_service_role_only(make_user):
    body = {"p_actor": ZERO, "p_proposal_id": ZERO}
    assert make_user().rest("POST", "rpc/ai_reject_proposal", json=body).status_code in (401, 403, 404)
    # The service role reaches the function; an unknown proposal is refused inside it.
    r = as_service("POST", "rpc/ai_reject_proposal", json=body)
    assert r.status_code == 400 and r.json()["code"] == "NTPRP"


def test_editors_read_context_but_cannot_write_it(make_user, db):
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Context"}).json()["id"]
    db.execute("insert into prd_context (prd_id, context_json) values (%s, '{\"decisions\": [\"Keep\"]}')", (prd,))
    assert alice.rest("GET", f"prd_context?prd_id=eq.{prd}&select=context_json").json() == \
        [{"context_json": {"decisions": ["Keep"]}}]
    assert alice.rest("PATCH", f"prd_context?prd_id=eq.{prd}", json={"version": 99}).status_code in (401, 403)
    assert alice.rest("DELETE", f"prd_context?prd_id=eq.{prd}").status_code in (401, 403)
    assert db.execute("select version from prd_context where prd_id = %s", (prd,)).fetchone()[0] == 1
