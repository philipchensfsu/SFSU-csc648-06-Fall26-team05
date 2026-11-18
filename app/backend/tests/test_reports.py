"""Feature 10: when the progress report looks up names."""

from routes.reports import directory_names


class NoCalls:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected client call: {name}")


def test_no_directory_fetch_when_no_name_is_needed():
    report = {"by_owner": [], "activity": [{"payload": {}}, {"payload": None}]}
    assert directory_names(NoCalls(), "00000000-0000-0000-0000-00000000000a", report) == {}
