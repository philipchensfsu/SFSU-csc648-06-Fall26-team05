"""One error shape for every route (Backend Tasks S01): {"detail", "code"}.

`detail` is always a readable string the frontend can show as-is; `code` is a
stable machine-readable value. Validation errors also carry an `errors` list.
"""

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Used when a route raises without naming a more specific code.
DEFAULT_CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    500: "database_error",
    503: "service_unavailable",
}


class ApiError(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str | None = None):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code or DEFAULT_CODES.get(status_code, "error")


def error_response(status_code: int, detail: str, code: str | None = None, headers=None, **extra):
    code = code or DEFAULT_CODES.get(status_code, "error")
    content = {"detail": detail, "code": code, **extra}
    return JSONResponse(status_code=status_code, content=content, headers=headers)


async def http_error_handler(request, exc: StarletteHTTPException):
    # Also covers FastAPI's own 404/405 for unknown routes and methods.
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return error_response(exc.status_code, detail, getattr(exc, "code", None), exc.headers)


async def validation_error_handler(request, exc: RequestValidationError):
    errors = [
        {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
        for e in exc.errors()
    ]
    first = errors[0] if errors else None
    detail = "Invalid request"
    if first:
        # Drop the "body"/"query"/"path" prefix so the message names the field.
        field = ".".join(str(part) for part in first["loc"][1:]) or first["loc"][0]
        detail = f"Invalid request: {field}: {first['msg']}"
    return error_response(422, detail, errors=errors)


# When RLS rejects a write, or a constraint fails, the Supabase client raises
# instead of returning empty data -- so without this, those cases surface as
# a bare 500 rather than the 403/400 the sequence diagrams describe.
async def postgrest_error_handler(request, exc: APIError):
    pg_code = exc.code or ""
    if pg_code == "42501":
        return error_response(403, "Not allowed")
    if pg_code == "23503":
        return error_response(404, "Related record not found")
    if pg_code.startswith(("22", "23")):
        return error_response(400, exc.message or "Invalid value")
    return error_response(500, "Database error")


def register_error_handlers(app):
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(APIError, postgrest_error_handler)
