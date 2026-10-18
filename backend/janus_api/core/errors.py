import json
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, *, commit: bool = False):
        self.code, self.message, self.status, self.commit = code, message, status, commit


def install_errors(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(request: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": error.code, "message": error.message}}, status_code=error.status
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": "validation_error", "message": "Invalid request."}}, status_code=422
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": "http_error", "message": str(error.detail)}},
            status_code=error.status_code,
        )

    @app.exception_handler(IntegrityError)
    async def conflict(request: Request, error: IntegrityError) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "code": "conflict",
                    "message": "This change conflicts with an existing record.",
                }
            },
            status_code=409,
        )

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception) -> JSONResponse:
        # Exception text and request URLs may contain secrets; never log them.
        logging.getLogger("janus").error(
            json.dumps(
                {
                    "event": "request_failed",
                    "exception_type": type(error).__name__,
                    "request_id": getattr(request.state, "request_id", None),
                }
            )
        )
        return JSONResponse(
            {"error": {"code": "internal_error", "message": "An unexpected error occurred."}},
            status_code=500,
        )


class ProcessingError(Exception):
    """A permanent ingestion failure with a safe, payload-free error code."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)
