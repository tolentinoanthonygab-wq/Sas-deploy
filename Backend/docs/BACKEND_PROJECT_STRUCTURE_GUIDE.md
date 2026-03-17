# Backend Project Structure Guide

## Purpose

This guide documents the current backend module layout so new work lands in the right layer and the app stays readable as it grows.

## Current Canonical Structure

```text
Backend/app/
├── main.py
├── core/
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   └── security.py
├── models/
├── repositories/
├── routers/
├── schemas/
├── services/
├── utils/
├── worker/        # compatibility wrapper for legacy imports
├── workers/       # canonical Celery package
└── tests/
```

## Layer Responsibilities

- `core/`
  - shared application wiring
  - settings, database engine/session setup, shared dependencies, and auth/security helpers
- `models/`
  - SQLAlchemy table definitions and model relationships only
- `schemas/`
  - Pydantic request and response models
  - route-owned request payloads should not live inside routers
- `routers/`
  - HTTP routing, dependency injection, and response wiring
  - keep route handlers thin and delegate business rules to services
- `services/`
  - business rules, orchestration, validation, and reusable domain logic
- `workers/`
  - Celery app configuration and background task execution bodies
- `utils/`
  - small reusable helpers with no domain ownership

## Key Refactors Applied

- database engine, session factory, and shared DB dependency now live in:
  - `Backend/app/core/database.py`
  - `Backend/app/core/dependencies.py`
- `Backend/app/database.py` is now a compatibility wrapper instead of defining a second ORM `Base`
- canonical Celery modules now live in:
  - `Backend/app/workers/celery_app.py`
  - `Backend/app/workers/tasks.py`
- `Backend/app/worker/` remains only as a compatibility wrapper for older imports and startup commands
- department and program CRUD business rules now live in:
  - `Backend/app/services/department_service.py`
  - `Backend/app/services/program_service.py`
- manual and bulk attendance request schemas now live in:
  - `Backend/app/schemas/attendance_requests.py`
- auth-side async dispatch orchestration now lives in:
  - `Backend/app/services/auth_task_dispatcher.py`

## How To Place New Code

- add new tables or SQLAlchemy relationships in `models/`
- add request and response payloads in `schemas/`
- add reusable domain logic in `services/`
- keep routers focused on:
  - request parsing
  - dependency injection
  - calling a service
  - returning the service result
- put Celery task bodies in `workers/tasks.py` or a small worker-focused module under `workers/`

## Compatibility Notes

- legacy imports from `app.database` still work, but new code should use `app.core.database` and `app.core.dependencies`
- legacy imports from `app.worker` still work, but new code should use `app.workers`
- legacy Celery task names under `app.worker.tasks.*` are still registered to avoid breaking in-flight integrations during the transition

## Configuration Notes

- local development can use `Backend/.env` for backend settings
- `Backend/.env` values override process env vars when present
- Alembic reads the same `Backend/.env` for `DATABASE_URL` when present

## How To Test

1. Run `python -m compileall Backend/app`.
2. Run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_auth_task_dispatcher.py Backend/app/tests/test_models.py Backend/app/tests/test_api.py`.
3. Start Celery with the canonical module path:
   - worker: `celery -A app.workers.celery_app.celery_app worker --loglevel=info`
   - beat: `celery -A app.workers.celery_app.celery_app beat --loglevel=info --schedule /tmp/celerybeat-schedule`
4. Smoke-test:
   - `POST /login`
   - `POST /auth/mfa/verify`
   - `POST /api/admin/import-students`
   - `POST /attendance/manual`
   - `GET /departments`
   - `GET /programs`
