"""Feature 10: when the progress report looks up names."""

from routes.reports import directory_names


class NoCalls:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected client call: {name}")


def test_no_directory_fetch_when_no_name_is_needed():
    report = {"by_owner": [], "activity": [{"payload": {}}, {"payload": None}]}
    assert (
        directory_names(NoCalls(), "00000000-0000-0000-0000-00000000000a", report) == {}
    )


class Directory:
    """Answers the two lookups directory_names makes, and records them."""

    def __init__(self):
        self.calls = []

    def table(self, name):
        self.calls.append(name)
        return Query([{"organization_id": "org-1"}])

    def rpc(self, name, params):
        self.calls.append((name, params))
        return Query([{"user_id": BEN, "full_name": "Ben Lee"}])


class Query:
    def __init__(self, data):
        self.data = data

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        return self


BEN = "00000000-0000-0000-0000-00000000000b"


def test_the_directory_is_fetched_when_an_owner_or_a_payload_needs_a_name():
    named_in_activity = {"by_owner": [], "activity": [{"payload": {"user_id": BEN}}]}
    owners_only = {"by_owner": [{"user_id": BEN}], "activity": []}
    for report in (named_in_activity, owners_only):
        client = Directory()
        assert directory_names(
            client, "00000000-0000-0000-0000-00000000000a", report
        ) == {BEN: "Ben Lee"}
        assert client.calls == [
            "organization_member",
            ("org_directory_people", {"target_org": "org-1"}),
        ]
