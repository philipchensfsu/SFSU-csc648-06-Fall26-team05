"""first_row: a read after a successful database call is 404, not 500, when the
row has become unreadable."""

from types import SimpleNamespace

import pytest

from errors import ApiError
from main import first_row


class Query:
    def __init__(self, rows):
        self.rows = rows

    def execute(self):
        return SimpleNamespace(data=self.rows)


def test_returns_the_first_row():
    assert first_row(Query([{"id": 1}, {"id": 2}]), "Not found") == {"id": 1}


def test_an_empty_read_is_a_404():
    with pytest.raises(ApiError) as error:
        first_row(Query([]), "Review round not found")
    assert (error.value.status_code, error.value.detail, error.value.code) == (404, "Review round not found", "not_found")
