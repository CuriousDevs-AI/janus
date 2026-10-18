FROM ghcr.io/astral-sh/uv:0.12.10 AS uv
FROM python:3.12-slim
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
RUN useradd --uid 10001 --create-home janus
USER janus
CMD ["/app/.venv/bin/uvicorn", "janus_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--no-access-log"]
