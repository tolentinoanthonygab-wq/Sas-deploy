# Backend Change Log

This file records backend behavior changes that should stay visible after code merges.

## Documentation Rule

For every backend code change in `Backend/`, update this file.

At minimum include:

- date
- purpose
- affected files
- route or schema changes
- migration or configuration impact

## 2026-03-17 - Load Backend/.env for app and Alembic

### Purpose

Let local development use a single `Backend/.env` file without exporting shell variables for the app, seeder, or Alembic.

### Main files

- `Backend/app/core/config.py`
- `Backend/alembic/env.py`
- `Backend/.env`
- `Backend/docs/BACKEND_PROJECT_STRUCTURE_GUIDE.md`

### Backend changes

- backend settings now load `Backend/.env` when present
- Alembic now loads the same `Backend/.env` before reading `DATABASE_URL`
- `.env` values now override any existing process env vars when present
- added a local `.env` template with default dev values

### Route or schema impact

- no route or schema changes

### Migration impact

- no migration required
- Alembic now reads `DATABASE_URL` from `Backend/.env` when present

### How to test

1. Edit `Backend/.env` with your local PostgreSQL password.
2. Run `alembic upgrade head` and confirm it connects without exporting `DATABASE_URL` in the shell.
3. Start `uvicorn app.main:app --reload` and confirm `GET /health` succeeds.

## 2026-03-17 - Sync Campus Admin status with school lockout

### Purpose

Aligned Campus Admin account activation with school activation so disabling a Campus Admin now disables the whole school and re-enabling that Campus Admin restores the school for all otherwise-active school-scoped users.

### Main files

- `Backend/app/routers/school.py`
- `Backend/app/tests/test_api.py`
- `Backend/docs/BACKEND_FRONTEND_AUTH_ONBOARDING_GUIDE.md`

### Backend changes

- changed `PATCH /api/school/admin/school-it-accounts/{user_id}/status` so it now:
  - updates the targeted Campus Admin account
  - updates the linked `School.active_status`
  - syncs every Campus Admin account in that same school to the same active state
- changed `PATCH /api/school/admin/{school_id}/status` so `active_status` updates also sync all Campus Admin accounts in that school
- kept `subscription_status`-only school updates from changing Campus Admin account activation
- kept login and protected-route auth on the existing inactive-school guard, so blocked users still receive `This account's school is inactive.`
- expanded school audit details to record the synchronized school and Campus Admin state

### Route or schema impact

- no request or response schema changes
- runtime behavior change only for:
  - `PATCH /api/school/admin/school-it-accounts/{user_id}/status`
  - `PATCH /api/school/admin/{school_id}/status`

### How to test

1. Call `PATCH /api/school/admin/school-it-accounts/{user_id}/status` with `{"is_active": false}` for a Campus Admin account.
2. Confirm the targeted Campus Admin and any other Campus Admin accounts in that school now have `is_active=false`.
3. Confirm the linked school now has `active_status=false`.
4. Try `POST /login` for a student in that school and confirm the response is `403` with `This account's school is inactive.`
5. Use a previously issued token for a user in that school on `GET /users/me/` and confirm it also returns `403`.
6. Call the same Campus Admin status route with `{"is_active": true}` and confirm the school plus all Campus Admin accounts return to active state.
7. Call `PATCH /api/school/admin/{school_id}/status` with `{"active_status": false}` and then `{"active_status": true}` and confirm Campus Admin accounts stay synchronized both times.
8. Call `PATCH /api/school/admin/{school_id}/status` with only `{"subscription_status": "paid"}` and confirm Campus Admin `is_active` values do not change.
9. After reactivating the school, try logging in with a user whose own `is_active=false` and confirm the response still says `This account is inactive. Contact your administrator.`

### Migration impact

- no database migration required

## 2026-03-16 - Add production Docker release path and concurrent load-test harness

### Purpose

Added a release-oriented deployment path beside the current dev stack so the system can be built and tested in a production-style container setup without `vite dev` or `uvicorn --reload`.

### Main files

- `Backend/Dockerfile.prod`
- `Backend/.dockerignore`
- `Frontend/Dockerfile.prod`
- `Frontend/nginx.prod.conf`
- `Frontend/.dockerignore`
- `docker-compose.prod.yml`
- `tools/load_test.py`
- `Backend/docs/BACKEND_PRODUCTION_DEPLOYMENT_GUIDE.md`

### Backend changes

- added a backend production image that runs `uvicorn` with worker processes and no hot reload
- kept Celery worker and beat on the same production image base so the stack stays consistent
- added a production compose file that keeps the backend internal and serves the app through the frontend proxy
- corrected the production build contexts to use the real `Backend/` and `Frontend/` directory casing for Linux compatibility
- added a concurrent load-test utility that can exercise health, login, event, and mixed authenticated API traffic

### Route or schema impact

- no API route paths changed
- no request or response schemas changed
- runtime deployment and operational tooling only

### Migration impact

- no database migration required
- new production Docker/runtime configuration only

### Testing

- run `docker compose -f docker-compose.prod.yml config -q`
- run `npm run lint`
- run `npm run build`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests`
- run `python tools/load_test.py --help`
- optional smoke/load checks:
  - `python tools/load_test.py --base-url http://127.0.0.1:8000 --scenario health --requests 20 --concurrency 5`
  - after starting the production stack, open `/api/docs` through the frontend proxy and verify `/openapi.json` resolves correctly

## 2026-03-16 - Add school event defaults plus SG/ORG override defaults for future events

### Purpose

Moved attendance-window defaults for future events out of frontend hardcoding and into backend-managed school and governance settings, so:

- Campus Admin controls the school-wide defaults
- `SG` and `ORG` can override those defaults for their own future events
- new events automatically inherit the effective default when the client omits the timing fields

### Main files

- `Backend/app/core/event_defaults.py`
- `Backend/app/models/school.py`
- `Backend/app/models/governance_hierarchy.py`
- `Backend/app/models/event.py`
- `Backend/app/schemas/school.py`
- `Backend/app/schemas/school_settings.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_api.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/f5d2c8a1b4e9_add_school_and_governance_event_defaults.py`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`

### Backend changes

- added school-level default fields on `school_settings`:
  - `event_default_early_check_in_minutes`
  - `event_default_late_threshold_minutes`
  - `event_default_sign_out_grace_minutes`
- added optional SG/ORG override fields on `governance_units`:
  - `event_default_early_check_in_minutes`
  - `event_default_late_threshold_minutes`
  - `event_default_sign_out_grace_minutes`
- changed `POST /events/` so omitted timing fields now resolve in this order:
  - `ORG` override
  - else `SG` override
  - else school default
  - else hard fallback `30 / 10 / 20`
- kept explicit per-event request values higher priority than defaults when the client does send them
- added governance event-default read/update service logic for SG/ORG units
- kept `SSG` tied to the school default instead of giving SSG its own separate override layer

### Route or schema impact

- changed school response schemas:
  - `GET /api/school/me`
  - `PUT /api/school/update`
  - `GET /school-settings/me`
  - `PUT /school-settings/me`
- added new governance routes:
  - `GET /api/governance/units/{governance_unit_id}/event-defaults`
  - `PUT /api/governance/units/{governance_unit_id}/event-defaults`
- new governance route behavior:
  - `SG` and `ORG` may store override values
  - `SSG` update attempts are rejected and must use school settings instead

### Migration impact

- requires `Backend/alembic/versions/f5d2c8a1b4e9_add_school_and_governance_event_defaults.py`

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py -k "default_attendance_window or school_event_defaults"`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py -k event_default_override`
- run `npm run build` in `Frontend/`
- manual checks:
  - as Campus Admin, update the school event defaults from the Events page
  - create a new school-wide or SSG event and confirm it uses the school defaults without manually entering the three timing values
  - as SG or ORG with `manage_events`, save a unit override and confirm the next new event in that workspace uses the override
  - reset the SG/ORG override to inherit and confirm the next new event falls back to the school default

## 2026-03-16 - Set default event attendance windows for new events

### Purpose

Changed the default attendance timing values applied to newly created events so governance users start with practical windows without manually filling all three fields every time.

### Main files

- `Backend/app/models/event.py`
- `Backend/app/schemas/event.py`
- `Backend/app/tests/test_api.py`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- changed the event model defaults to:
  - `early_check_in_minutes = 30`
  - `late_threshold_minutes = 10`
  - `sign_out_grace_minutes = 20`
- changed the event create schema defaults to the same values
- added a regression test proving `POST /events/` persists those defaults when the client omits the timing fields

### Route or schema impact

- no route path changes
- `POST /events/` now defaults missing attendance-window fields to:
  - `30` minutes early check-in
  - `10` minutes late threshold
  - `20` minutes sign-out grace

### Migration impact

- no migration required
- existing events keep their stored values

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py -k default_attendance_window`
- run `npm run build` in `Frontend/`
- manual checks:
  - open Create Event in the governance Events page
  - confirm the default form values are `30`, `10`, and `20`
  - create an event without changing them and confirm the saved event keeps those values

## 2026-03-16 - Make sign-out override duration user-defined instead of fixed

### Purpose

Changed the early sign-out override flow so the caller now supplies the override duration dynamically, instead of the backend always forcing a fixed 15-minute window.

### Main files

- `Backend/app/schemas/event.py`
- `Backend/app/routers/events.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added a request schema for opening sign-out override with `override_minutes`
- changed `POST /events/{event_id}/sign-out-override/open` to set:
  - `sign_out_override_until = now + override_minutes`
- removed the hardcoded 15-minute duration from the route logic

### Route or schema impact

- changed route contract:
  - `POST /events/{event_id}/sign-out-override/open`
- the route now expects a JSON body:

```json
{
  "override_minutes": 12
}
```

### Migration impact

- no migration required

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py -k override`
- run `npm run build` in `Frontend/`
- manual checks:
  - open the governance event details page
  - choose `Open Sign-Out Override`
  - enter a custom minute value
  - confirm the returned `sign_out_override_until` matches the requested duration
  - cancel or leave the prompt blank and confirm the scheduled sign-out timing remains unchanged

## 2026-03-16 - Make Alembic respect DATABASE_URL for local and Docker migrations

### Purpose

Fixed the migration runner so Alembic now uses the same `DATABASE_URL` environment variable path as the backend app, instead of relying only on the Docker-oriented hostname inside `alembic.ini`.

### Main files

- `Backend/alembic/env.py`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- Alembic now loads the database URL from `DATABASE_URL` through the shared backend settings path
- if `DATABASE_URL` is set, it overrides the static URL in `alembic.ini`
- `alembic.ini` now defaults to `localhost` for local development
- if `DATABASE_URL` is not set, Alembic falls back to the URL in `alembic.ini` before using the backend settings default
- this keeps Docker behavior working while also allowing local Windows and localhost PostgreSQL migrations without editing code each time

### Route or schema impact

- no route changes
- no schema changes
- migration runner behavior only

### Migration impact

- no new migration file
- runtime migration configuration change only

### Testing

- run `Backend\.venv\Scripts\python.exe -m py_compile Backend/alembic/env.py`
- with Docker DB: run Alembic as before and confirm it still connects through `db`
- with local PostgreSQL: set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fastapi_db` and run Alembic from `Backend/`

## 2026-03-16 - Add event attendance windows, sign-out override, audit fields, and effective-close auto-finalization

### Purpose

Implemented per-event attendance timing so events can control early check-in, late/absent check-in, sign-out grace, and a temporary early sign-out override while preserving final attendance reporting.

### Main files

- `Backend/app/models/event.py`
- `Backend/app/models/attendance.py`
- `Backend/app/schemas/event.py`
- `Backend/app/schemas/attendance.py`
- `Backend/app/services/event_time_status.py`
- `Backend/app/services/attendance_status.py`
- `Backend/app/services/event_attendance_service.py`
- `Backend/app/services/event_workflow_status.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/tests/test_event_time_status.py`
- `Backend/app/tests/test_attendance_status_support.py`
- `Backend/app/tests/test_event_workflow_status.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/e4b7c1d9f6a2_add_event_attendance_window_controls.py`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_ATTENDANCE_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_EVENT_AUTO_STATUS_GUIDE.md`

### Backend changes

- added event timing fields:
  - `early_check_in_minutes`
  - `sign_out_grace_minutes`
  - `sign_out_override_until`
- added attendance audit fields:
  - `check_in_status`
  - `check_out_status`
- replaced the old `upcoming/open/late/closed` attendance window model with:
  - `before_check_in`
  - `early_check_in`
  - `late_check_in`
  - `absent_check_in`
  - `sign_out_open`
  - `closed`
- implemented explicit check-in and sign-out decision helpers
- added the early sign-out override endpoint
- changed workflow auto-sync so events stay `ongoing` through the sign-out window and complete only after the effective sign-out close
- changed attendance finalization so missing sign-out rows and missing participants are marked absent after the effective sign-out close
- updated manual and operator face-scan attendance routes to branch on active attendance first so sign-out works correctly during the override window

### Route or schema impact

- new route:
  - `POST /events/{event_id}/sign-out-override/open`
- changed event response and request schemas:
  - `early_check_in_minutes`
  - `sign_out_grace_minutes`
  - `sign_out_override_until`
- changed attendance response schemas:
  - `check_in_status`
  - `check_out_status`
- runtime behavior changed for:
  - `POST /attendance/manual`
  - `POST /attendance/face-scan`
  - `POST /attendance/{attendance_id}/time-out`
  - `POST /attendance/face-scan-timeout`
  - `POST /face/face-scan-with-recognition`
  - `GET /events/{event_id}/time-status`
  - `POST /events/{event_id}/verify-location`

### Migration impact

- requires `Backend/alembic/versions/e4b7c1d9f6a2_add_event_attendance_window_controls.py`

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_event_time_status.py Backend/app/tests/test_attendance_status_support.py Backend/app/tests/test_event_workflow_status.py Backend/app/tests/test_governance_hierarchy_api.py -k "override or attendance or workflow or time_status"`
- run `npm run build` in `Frontend/`
- manual checks:
  - create an event with early check-in, late threshold, and sign-out grace values
  - verify check-in before start is `present`, exact start is `late`, and after the threshold is `absent`
  - verify sign-out is blocked before sign-out opens
  - call `POST /events/{event_id}/sign-out-override/open` and confirm the same active attendance can sign out
  - confirm the event stays `ongoing` until the effective sign-out close and only then becomes `completed`

## 2026-03-16 - Preserve inactive governance memberships so deleted officers can be re-added cleanly

### Purpose

Fixed the governance member reactivation bug where deleting an officer and then assigning the same student again could fail on Manage `SSG`, `SG`, or `ORG`.

### Main files

- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`

### Backend changes

- changed the governance response-preparation helpers to stop mutating live SQLAlchemy relationship collections during sorting/filtering
- preserved inactive `governance_members` rows during later unit reads instead of accidentally orphaning them for deletion
- restored the intended behavior for `POST /api/governance/units/{governance_unit_id}/members`:
  - if the student already has an inactive membership in that unit, the backend now reactivates the same membership row
  - member permissions are re-applied cleanly on reactivation

### Route or schema impact

- no route changes
- no schema changes
- behavior fix for:
  - `POST /api/governance/units/{governance_unit_id}/members`
  - `DELETE /api/governance/members/{governance_member_id}`

### Migration impact

- no migration required

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py -k reactivate`
- in the frontend or API, add a governance member with permissions, delete that member, then add the same student again
- confirm the second add succeeds for `SSG`, `SG`, and `ORG` management flows and the officer regains the selected permission set

## 2026-03-16 - Rename Campus Admin frontend routes and lock the academic scope wording

### Purpose

Finished the naming cleanup for the Campus Admin frontend entry paths and clarified the governance documentation so the academic structure matches the intended model: `SSG` is campus-wide, `department` is the college-level scope, and `program` is the program/org-level scope.

### Main files

- `Frontend/src/App.tsx`
- `Frontend/src/authFlow.ts`
- `Frontend/src/components/NavbarSchoolIT.tsx`
- `Frontend/src/dashboard/SchoolITDashboard.tsx`
- `Frontend/src/pages/SecurityCenter.tsx`
- `Frontend/src/utils/redirects.ts`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`

### Frontend changes

- renamed the primary Campus Admin route family from `/school_it_*` to `/campus_admin_*`
- updated Campus Admin navbar, dashboard cards, auth redirect targets, and security-center links to the new path family
- kept legacy `/school_it_*` routes as redirects so existing bookmarks and older links still work
- expanded the redirect allowlist to accept both the new `campus_admin` paths and the legacy `school_it` paths during the transition

### Documentation changes

- removed the implication that a separate `colleges` table is still expected for governance
- clarified that this system intentionally uses:
  - `SSG` for the whole campus
  - `department_id` for the college-level scope
  - `program_id` for the program/org-level scope
- updated the governance guide route examples and test steps to use the new `/campus_admin_*` paths

### Migration impact

- no migration required

### Testing

- run `npm run build` in `Frontend/`
- log in as a Campus Admin user and confirm the app lands on `/campus_admin_dashboard`
- open the old `/school_it_dashboard` path and confirm it redirects to `/campus_admin_dashboard`
- open `/campus_admin_governance_hierarchy` and confirm the Manage SSG page still loads

## 2026-03-16 - Enforce server-side role guards before protected route handlers execute

### Purpose

Moved protected-route role validation into reusable backend dependencies so the server now rejects unsupported roles before protected handlers run. This keeps the backend aligned with the current role model and stops frontend-only protection from being the only gate.

### Main files

- `Backend/app/core/security.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/audit_logs.py`
- `Backend/app/routers/departments.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/governance.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/routers/notifications.py`
- `Backend/app/routers/programs.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/routers/security_center.py`
- `Backend/app/routers/subscription.py`
- `Backend/app/routers/users.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`

### Backend changes

- added reusable role-guard helpers in `security.py`:
  - `ensure_user_has_any_role()`
  - `require_current_user_with_roles()`
  - `get_current_admin_or_campus_admin`
  - `get_current_application_user`
  - `get_current_student_user`
- moved fixed-role route protection to dependency-level checks for:
  - Campus Admin or admin routes
  - student-only face registration routes
  - general authenticated app routes that must still match a supported role
- added a governance-specific route guard that allows:
  - `admin`
  - `campus_admin`
  - `student`
  - legacy governance-role users
  - users with active governance membership even if their base role is transitional
- preserved governance permission checks in services, so this change adds an outer server role gate instead of replacing the existing permission model

### Route or schema impact

- no schema changes
- no new public routes
- role enforcement now runs earlier on protected routes backed by:
  - `/api/governance/*`
  - `/users/*`
  - `/departments/*`
  - `/programs/*`
  - `/school-settings/*`
  - `/api/audit-logs`
  - `/api/notifications/*`
  - `/api/subscription/*`
  - `/auth/security/*`
  - selected `/auth/*` self-service and password-reset routes

### Migration impact

- no migration required

### Testing

- run `Backend\.venv\Scripts\python.exe -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- manual checks:
  - Campus Admin can still open Campus Admin routes like `/users/`, `/school-settings/me`, and `/api/governance/announcements/monitor`
  - student face registration still works for student accounts only
  - unsupported or stray roles get `403` on governance routes before handler logic runs
  - governance officers can still access governance routes when their access comes from active membership

## 2026-03-16 - Add Campus Admin monitoring routes for reports, attendance, and school-scoped governance announcements

### Purpose

Continued the Campus Admin rollout by exposing the existing school-scoped reports and attendance monitoring pages to Campus Admin and adding a read-only governance announcements monitor that only returns SSG, SG, and ORG announcements from the current campus.

### Main files

- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Frontend/src/api/governanceHierarchyApi.ts`
- `Frontend/src/pages/CampusAnnouncementsMonitor.tsx`
- `Frontend/src/pages/Reports.tsx`
- `Frontend/src/pages/Records.tsx`
- `Frontend/src/components/NavbarSchoolIT.tsx`
- `Frontend/src/dashboard/SchoolITDashboard.tsx`
- `Frontend/src/App.tsx`

### Backend changes

- added a Campus Admin announcement monitor service that aggregates governance announcements across the current school only
- included governance unit metadata in the monitor response:
  - `governance_unit_code`
  - `governance_unit_name`
  - `governance_unit_type`
  - `governance_unit_description`
- enforced Campus Admin or admin-school context on the monitor endpoint
- added a regression test proving Campus Admin only sees announcement records from the same campus

### Route or schema impact

- new schema:
  - `GovernanceAnnouncementMonitorResponse`
- new route:
  - `GET /api/governance/announcements/monitor`
    - supports `status`
    - supports `unit_type`
    - supports `q`
    - supports `limit`

### Migration impact

- no migration required

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py`
- run `npm run build` in `Frontend/`
- verify in the UI:
  - `Campus Admin -> Reports` opens school-scoped attendance reports
  - `Campus Admin -> Attendance` opens the attendance monitoring page
  - `Campus Admin -> Announcements` only lists SSG, SG, and ORG announcements from the current campus

## 2026-03-16 - Persist governance announcements and student notes, filter student event visibility, and enable SG/ORG deactivation

### Purpose

Finished the next governance cleanup by moving SSG, SG, and ORG announcements plus governance student notes out of browser storage into backend tables, filtering normal student event visibility by the same department and program scope rules, and enabling safe SG and ORG deactivation.

### Main files

- `Backend/app/models/governance_hierarchy.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/routers/events.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/f2a6b8c9d0e1_add_governance_announcements_and_student_.py`
- `Frontend/src/api/governanceHierarchyApi.ts`
- `Frontend/src/pages/SsgAnnouncements.tsx`
- `Frontend/src/pages/GovernanceAnnouncementsPage.tsx`
- `Frontend/src/pages/SsgStudents.tsx`
- `Frontend/src/pages/GovernanceStudentsPage.tsx`
- `Frontend/src/dashboard/SSGDashboard.tsx`
- `Frontend/src/pages/GovernanceDashboardPage.tsx`
- `Frontend/src/pages/ManageSg.tsx`
- `Frontend/src/pages/ManageOrg.tsx`

### Backend changes

- added `governance_announcements` for SSG, SG, and ORG announcement persistence
- added `governance_student_notes` for governance-only tags and notes per `governance_unit_id + student_profile_id`
- added governance announcement CRUD endpoints
- added governance student-note read and save endpoints
- enforced unit-scoped permissions for:
  - `manage_announcements`
  - `view_students`
  - `manage_students`
- added soft-delete and deactivate behavior for `SG` and `ORG` units
- blocked deletion of the fixed campus `SSG`
- blocked governance unit deletion when active child units still exist
- filtered normal student event lists and event detail access to:
  - school-wide events
  - department-wide events matching the student's department
  - program-wide events matching the student's program

### Route or schema impact

- `GET /api/governance/units/{governance_unit_id}/announcements`
- `POST /api/governance/units/{governance_unit_id}/announcements`
- `PATCH /api/governance/announcements/{announcement_id}`
- `DELETE /api/governance/announcements/{announcement_id}`
- `GET /api/governance/units/{governance_unit_id}/student-notes/{student_profile_id}`
- `PUT /api/governance/units/{governance_unit_id}/student-notes/{student_profile_id}`
- `DELETE /api/governance/units/{governance_unit_id}`
- `GET /events/`
- `GET /events/ongoing`
- `GET /events/{event_id}`
- `GET /events/{event_id}/time-status`
- `POST /events/{event_id}/verify-location`

### Migration impact

- apply `Backend/alembic/versions/f2a6b8c9d0e1_add_governance_announcements_and_student_.py`

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- run `npm run build` in `Frontend/`
- apply the migration, then verify:
  - SSG, SG, and ORG announcements persist after browser refresh and across logins
  - SSG, SG, and ORG student notes persist after browser refresh
  - a normal student only sees events aligned to school, department, or program scope
  - deleting an `SG` or `ORG` deactivates it and removes it from the active unit list

## 2026-03-16 - Harden governance-scoped event writes without explicit governance_context

### Purpose

Closed the event-write scope gap where governance officers could omit `governance_context` and submit their own `department_ids` or `program_ids`, which bypassed the intended `SSG`, `SG`, and `ORG` event scope rules.

### Main files

- `Backend/app/routers/events.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- event write routes now infer the caller's `manage_events` governance scope when the caller is not `admin` or `campus_admin` and `governance_context` is omitted
- `SSG` event writes still resolve to school-wide scope
- `SG` event writes still resolve to the officer's department-wide scope
- `ORG` event writes still resolve to the officer's program-level scope
- governance event update, delete, and status writes now reject out-of-scope events even when the request omits `governance_context`
- governance accounts that can manage multiple event unit types must now send `governance_context=SSG|SG|ORG` for event writes so the backend does not guess the wrong scope

### Route or schema impact

- `POST /events/`
- `PATCH /events/{event_id}`
- `DELETE /events/{event_id}`
- `PATCH /events/{event_id}/status`
  - runtime behavior changed for governance writers when `governance_context` is omitted
  - no schema changes

### Migration impact

- no migration required

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py -k "event_queries_are_filtered or event_create_without_governance_context or event_update_without_governance_context"`
- log in as an `SG` officer with `manage_events` and call `POST /events/` without `governance_context`
  - submit another department in `department_ids`
  - confirm the created event is still forced to the SG department only
- log in as an `ORG` officer with `manage_events` and call `POST /events/` without `governance_context`
  - submit another program in `program_ids`
  - confirm the created event is still forced to the ORG program scope
- log in as an `SG` officer with `manage_events` and call `PATCH /events/{event_id}` without `governance_context`
  - target an event outside the SG department
  - confirm the backend returns `404 Event not found`

## 2026-03-16 - Finish SG/ORG workspace routing and enforce governance-scoped events and attendance

### Purpose

Completed the next governance layer so `SG` and `ORG` officers now have their own frontend workspaces, while backend event and attendance routes enforce department or program scope when the caller uses a governance context.

### Main files

- `Backend/app/routers/events.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Frontend/src/App.tsx`
- `Frontend/src/authFlow.ts`
- `Frontend/src/components/ProtectedRoute.tsx`
- `Frontend/src/hooks/useGovernanceWorkspace.ts`
- `Frontend/src/components/GovernanceSidebar.tsx`
- `Frontend/src/pages/Events.tsx`
- `Frontend/src/pages/Records.tsx`
- `Frontend/src/pages/ManualAttendance.tsx`
- `Frontend/src/pages/Profile.tsx`
- `Frontend/src/pages/ManageSg.tsx`
- `Frontend/src/pages/ManageOrg.tsx`
- `Frontend/src/pages/GovernanceDashboardPage.tsx`
- `Frontend/src/pages/GovernanceAnnouncementsPage.tsx`
- `Frontend/src/pages/GovernanceStudentsPage.tsx`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added governance-context filtering to event routes through `governance_context=SSG|SG|ORG`
- enforced governance event visibility by unit scope:
  - `SSG` sees school-wide events only
  - `SG` sees only its department-wide events
  - `ORG` sees only its program-level events
- enforced governance event write scope:
  - `SSG` event writes become school-wide
  - `SG` event writes are forced to the officer's department only
  - `ORG` event writes are forced to the officer's program only
- added governance-context filtering to attendance report and operator routes
- enforced SG attendance operators to stay inside their department scope
- enforced ORG attendance operators to stay inside their program scope
- extended `GET /api/governance/students` so frontend pages can request a specific governance context
- added backend regression tests for:
  - SG department-scoped event listing
  - ORG program-scoped event listing
  - SG manual-attendance blocking for out-of-scope students

### Route or schema impact

- `GET /events/`
- `GET /events/ongoing`
- `GET /events/{event_id}`
- `GET /events/{event_id}/time-status`
- `POST /events/`
- `PATCH /events/{event_id}`
- `DELETE /events/{event_id}`
- `GET /events/{event_id}/attendees`
- `GET /events/{event_id}/stats`
- `PATCH /events/{event_id}/status`
  - all now accept optional `governance_context`
- `GET /attendance/events/{event_id}/report`
- `GET /attendance/students/overview`
- `GET /attendance/students/{student_id}/report`
- `POST /attendance/manual`
- `POST /attendance/bulk`
- `POST /attendance/events/{event_id}/mark-excused`
- `GET /attendance/events/{event_id}/attendees`
- `POST /attendance/{attendance_id}/time-out`
- `POST /attendance/face-scan-timeout`
- `GET /attendance/events/{event_id}/attendances`
- `GET /attendance/events/{event_id}/attendances/{status}`
- `GET /attendance/events/{event_id}/attendances-with-students`
- `POST /attendance/mark-absent-no-timeout`
  - all now accept optional `governance_context`
- `GET /api/governance/students`
  - now accepts optional `governance_context`

### Migration impact

- no migration required

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py Backend/app/tests/test_api.py`
- run `npm run build` in `Frontend/`
- log in as an SG officer with `manage_events` and confirm:
  - `/sg_dashboard` loads
  - `/sg_events` opens
  - only SG department events are visible
- log in as an ORG officer with `manage_events` and confirm:
  - `/org_dashboard` loads
  - `/org_events` opens
  - only ORG program events are visible
- log in as an SG officer with `manage_attendance` and confirm:
  - `/sg_records` and `/sg_manual_attendance` load
  - out-of-scope students cannot be recorded manually for SG attendance

## 2026-03-16 - Enforce school-scoped departments, programs, and governance-linked academic access

### Purpose

Fixed the cross-campus data leak where Campus Admin users could see academic scope records and governance-linked data from another campus because `departments` and `programs` were still effectively global.

### Main files

- `Backend/app/models/department.py`
- `Backend/app/models/program.py`
- `Backend/app/schemas/department.py`
- `Backend/app/schemas/program.py`
- `Backend/app/services/department_service.py`
- `Backend/app/services/program_service.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/departments.py`
- `Backend/app/routers/programs.py`
- `Backend/app/routers/users.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/admin_import.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/services/student_import_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/d8e2f4c1b7aa_scope_departments_and_programs_per_school.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `school_id` to `departments` and `programs`
- changed department and program uniqueness from global `name` uniqueness to per-school uniqueness
- filtered `GET /departments`, `GET /departments/{id}`, `GET /programs`, and `GET /programs/{id}` by the authenticated actor's `school_id`
- scoped department and program create, update, and delete operations to the actor's campus
- tightened governance validation so `department_id` and `program_id` must belong to the same school as the governance unit being created
- tightened student-profile create and update validation so department/program ids from another school are rejected
- filtered bulk import validation lookups by the target school
- filtered event department/program assignment to the event's school
- filtered attendance report program metadata to the event's school
- fixed the migration implementation to build the event-to-school lookup with explicit row iteration so `alembic upgrade head` works under the container's SQLAlchemy runtime

### Route or schema impact

- `Department` responses now include `school_id`
- `Program` responses now include `school_id`
- `GET /departments/` now returns only the caller's campus departments
- `GET /departments/{department_id}` now returns `404` for another campus department
- `GET /programs/` now returns only the caller's campus programs
- `GET /programs/{program_id}` now returns `404` for another campus program
- `POST /api/governance/units`
  - now rejects foreign-campus `department_id` and `program_id` values

### Migration impact

- added `Backend/alembic/versions/d8e2f4c1b7aa_scope_departments_and_programs_per_school.py`
- the migration:
  - adds `school_id` to `departments` and `programs`
  - backfills or duplicates old rows per school based on student, governance, and event usage
  - rebuilds academic association tables with school-scoped ids
  - replaces global `name` uniqueness with per-school uniqueness

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- run `alembic upgrade head`
- log in as Campus Admin for campus A and confirm:
  - `/departments/` shows only campus A departments
  - `/programs/` shows only campus A programs
  - `/api/governance/units` shows only campus A governance units
- try creating an `SG` from campus A using a department from campus B and confirm the backend rejects it with `Invalid department_id for this school`

## 2026-03-16 - Add governance-scoped student list route for SSG pages

### Purpose

Fixed the SSG dashboard and student-directory permission error caused by those pages still calling the Campus Admin-only `/users/` endpoint.

### Main files

- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `GET /api/governance/students`
- reused `get_accessible_students()` so the returned student list follows the existing governance scope rules
- included `department_name` and `program_name` in the student profile response used by SSG pages
- eagerly load user, department, and program relations for the accessible-student query

### Route or schema impact

- new route:
  - `GET /api/governance/students`
- new response schema:
  - `GovernanceAccessibleStudentResponse`
- extended `GovernanceStudentProfileSummary` with:
  - `department_name`
  - `program_name`

### Migration impact

- no migration required

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- log in as an `SSG` officer with `view_students` or `manage_students`
- confirm `/ssg_dashboard` and `/ssg_students` no longer fail with `Requires admin or Campus Admin role`

## 2026-03-16 - Finalize base-role cleanup for governance membership access

### Purpose

Finished the runtime cleanup toward the planned role scheme:

- base auth roles:
  - `admin`
  - `campus_admin`
  - `student`
- governance access:
  - `SSG`
  - `SG`
  - `ORG`
  - derived from governance membership and permissions only

This removed the last live dependencies on legacy `ssg` and `event-organizer` base roles, aligned campus-admin wording across active routes, and added a schema migration to drop unused legacy governance artifacts.

### Main files

- `Backend/app/routers/attendance.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/admin_import.py`
- `Backend/app/routers/audit_logs.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/governance.py`
- `Backend/app/routers/notifications.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/routers/subscription.py`
- `Backend/app/routers/users.py`
- `Backend/app/services/email_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/c3d91e4ab2f6_drop_legacy_governance_role_artifacts.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- active Campus Admin privilege checks now use `campus_admin` as the live role name while still allowing legacy `school_IT` rows through normalization
- SSG, SG, and ORG access now relies on:
  - `governance_members`
  - `position_title`
  - `governance_member_permissions`
- removed live runtime dependence on:
  - base `ssg` role
  - base `event-organizer` role
  - `governance_members.role_id`
  - `ssg_profiles`
  - `event_ssg_association`
- updated user-management and admin-facing text to consistently say `Campus Admin`
- updated welcome-email wording to direct users to `Campus Admin`

### Route or schema impact

- no public route paths changed
- `GET /api/governance/access/me`
  - now represents the only active source of governance feature access for `SSG`, `SG`, and `ORG`
- `POST /api/governance/units/{governance_unit_id}/members`
  - no longer depends on any governance `role_id`
  - officer access comes only from membership and permission codes
- `DELETE /api/governance/members/{governance_member_id}`
  - now only deactivates governance membership and clears officer permissions
  - no legacy `ssg_profile` or base-role cleanup remains in the active model

### Migration impact

- added `Backend/alembic/versions/c3d91e4ab2f6_drop_legacy_governance_role_artifacts.py`
- run `alembic upgrade head`
- the new migration:
  - ensures legacy `ssg` and `event-organizer` users keep the `student` base role when needed
  - removes `ssg` and `event-organizer` from `user_roles`
  - deletes `ssg` and `event-organizer` from `roles`
  - drops `governance_members.role_id`
  - drops `ssg_profiles`
  - drops `event_ssg_association`

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py Backend/app/tests/test_auth_session_login_guard.py`
- run `alembic upgrade head`
- verify the database no longer contains:
  - `ssg_profiles`
  - `event_ssg_association`
  - `roles.name = 'ssg'`
  - `roles.name = 'event-organizer'`
- log in as a student who is an active SSG officer and confirm:
  - the base role is still `student`
  - `/api/governance/access/me` returns the `SSG` unit membership
  - SSG routes appear only from governance permissions, not from a base `ssg` role

## 2026-03-15 - Clean up legacy campus and governance role records

### Purpose

Aligned the stored role model to the planned hierarchy by making `campus_admin` the canonical campus role, removing duplicated base-role behavior for `SG` and `ORG`, and keeping only the legacy `ssg` identity role where the current app still depends on it.

### Main files

- `Backend/app/core/security.py`
- `Backend/app/services/security_service.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/users.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/schemas/user.py`
- `Backend/app/schemas/auth.py`
- `Backend/app/seeder.py`
- `Backend/alembic/versions/b4c8f12d9e77_cleanup_legacy_role_records.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- made `campus_admin` the canonical database role for the former `school_IT` account type
- kept `school_IT` accepted as a backward-compatible alias in auth and role checks
- updated role lookup and user-management flows so incoming `school_IT` requests resolve to the stored `campus_admin` role
- removed duplicated governance base-role behavior for `SG` and `ORG`
- `SG` and `ORG` memberships now derive access from:
  - `governance_members`
  - `position_title`
  - `governance_member_permissions`
- kept the legacy `ssg` role and `ssg_profile` sync in place because current SSG auth, events, attendance, and profile screens still depend on them
- kept the legacy `event-organizer` role in place because current event-organizer routes still depend on it
- updated the default role seeder so fresh environments no longer seed:
  - `school_IT`
  - `sg`
  - `org`

### Route or schema impact

- no route path changes
- `/users`
  - now stores `campus_admin` when a caller submits the legacy `school_IT` role value
- `/users/{user_id}/roles`
  - now stores `campus_admin` when a caller submits the legacy `school_IT` role value
- `POST /api/governance/units/{governance_unit_id}/members`
  - still auto-attaches the legacy `ssg` role for `SSG`
  - no longer auto-attaches base `sg` or `org` roles for `SG` or `ORG`
- `PATCH /api/governance/members/{governance_member_id}`
  - keeps `SSG` role sync only
  - rejects `role_id` for `SG` and `ORG` membership updates because those levels now use governance membership plus permissions only
- `Backend/app/schemas/user.py`
  - added `campus_admin` as an accepted role enum value while keeping `school_IT` as a compatibility alias
- `Backend/app/schemas/auth.py`
  - added `campus_admin` as an accepted role enum value while keeping `school_IT` as a compatibility alias

### Migration impact

- added `Backend/alembic/versions/b4c8f12d9e77_cleanup_legacy_role_records.py`
- run `alembic upgrade head`
- the new migration:
  - renames or merges `school_IT` into `campus_admin`
  - nulls old `governance_members.role_id` references to `sg` or `org`
  - deletes `sg` and `org` from `user_roles`
  - deletes `sg` and `org` from `roles`

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py Backend/app/tests/test_governance_hierarchy_api.py Backend/app/tests/test_auth_session_login_guard.py`
- run `alembic upgrade head`
- verify the `roles` table now contains `campus_admin` and no longer contains `sg` or `org`
- log in as a Campus Admin account created before the migration and confirm campus-admin routes still work
- assign an SG member and confirm:
  - the membership succeeds
  - no base `sg` role is created or attached to the student
  - governance access still comes from the assigned permission codes

## 2026-03-15 - Seed missing SG and ORG identity roles for governance member assignment

### Purpose

Fixed the `Role configuration error: sg role not found` failure during `Manage SG` member assignment by ensuring the governance identity roles exist in both existing and fresh databases.

### Main files

- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/seeder.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/alembic/versions/9c4d2e7f1a8b_seed_missing_sg_and_org_roles.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `sg` and `org` to the default role seeder for fresh environments
- made governance member assignment self-heal missing governance identity roles:
  - `ssg`
  - `sg`
  - `org`
- kept the existing SSG behavior unchanged while allowing SG member assignment to proceed even if an older database was missing the `sg` role row

### Route or schema impact

- no route contract change
- `POST /api/governance/units/{governance_unit_id}/members`
  - now auto-recovers if the backing governance identity role row is missing for `SSG`, `SG`, or `ORG`

### Migration impact

- added `Backend/alembic/versions/9c4d2e7f1a8b_seed_missing_sg_and_org_roles.py`
- run `alembic upgrade head` so existing databases get the missing `sg` and `org` roles permanently

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- if you use Docker, run `docker exec backend_v2 alembic upgrade head`
- log in as an `ssg` officer with `manage_members`
- open `/ssg_manage_sg`
- assign a student to an SG and confirm the request succeeds instead of returning `Role configuration error: sg role not found`

## 2026-03-15 - Enforce one SG per department, one ORG per program, and add SSG Manage SG flow

### Purpose

Locked the next governance layer so `SSG` can manage `SG` units cleanly: only one active `SG` per department, only one active `ORG` per program, parent-managed SG memberships, and a matching SSG frontend page for `Manage SG`.

### Main files

- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- enforced one active `SG` per `department_id`
- enforced one active `ORG` per `program_id`
- restricted `SG` and `ORG` unit editing to authorized parent-unit officers instead of the child unit managing itself
- changed governance-student search so:
  - `Campus Admin` remains the only actor for `SSG` candidate search
  - `SSG` can search `SG` candidates only inside the selected SG department
  - `SG` can search future `ORG` candidates only inside the selected ORG program scope
- enforced scoped member assignment:
  - `SG` members must come from the SG department
  - `ORG` members must come from the ORG program
- required `position_title` for SG members too
- separated SG member editing permissions:
  - `manage_members` for member identity and position changes
  - `assign_permissions` for officer permission changes
- validated governance permission codes by unit type so invalid mixes like `create_sg` on an `SG` member are rejected

### Route or schema impact

- `POST /api/governance/units`
  - now rejects a second active `SG` in the same department
  - now rejects a second active `ORG` in the same program
- `PATCH /api/governance/units/{governance_unit_id}`
  - now allows authorized parent-unit officers to edit child units
- `GET /api/governance/students/search`
  - now applies SG or ORG scope filtering when a target child unit is supplied
- `POST /api/governance/units/{governance_unit_id}/members`
  - now enforces SG department scope
  - now enforces unit-type permission whitelists
- `PATCH /api/governance/members/{governance_member_id}`
  - now splits `manage_members` and `assign_permissions` checks by field update

### Migration impact

- no new migration

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- log in as an `ssg` user with `create_sg`, `manage_members`, and `assign_permissions`
- open `/ssg_manage_sg`
- create an `SG` and confirm the same department cannot be used again
- search SG candidates and confirm only students in the SG department appear
- try assigning `create_sg` to an SG member and confirm the backend rejects it
- create an `ORG` and confirm the same program cannot be used again

## 2026-03-15 - Re-scope SG and ORG hierarchy to department-wide SG and program-level ORG

### Purpose

Aligned the governance hierarchy with the campus structure where `department_id` acts as the current college scope, `SG` is department-wide, and `ORG` is program-level under that department.

### Main files

- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- changed `SG` validation so an `SG` must include `department_id` and cannot include `program_id`
- changed `ORG` validation so an `ORG` must include `program_id`
- enforced that `ORG.program_id` must belong to the parent `SG` department scope
- kept `ORG` blocked when a request tries to override the parent `SG` department
- made the hierarchy meaning explicit:
  - `department_id` = current college-like scope
  - `SG` = department-wide government
  - `ORG` = program-level organization

### Route or schema impact

- `POST /api/governance/units`
  - `SG` requests now fail if `program_id` is provided
  - `ORG` requests now fail if `program_id` is missing
  - `ORG` requests now fail if `program_id` is not linked to the parent `SG` department

### Migration impact

- no new migration

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- create an `SG` from an `SSG` member and confirm it succeeds with `department_id` only
- try creating an `SG` with `program_id` and confirm the backend rejects it
- try creating an `ORG` without `program_id` and confirm the backend rejects it
- try creating an `ORG` with a program outside the parent `SG` department and confirm the backend rejects it

## 2026-03-15 - Lock Campus Admin user management to student accounts and require explicit SSG positions

### Purpose

Closed the remaining Campus Admin role-management shortcuts so imported users stay student accounts in user-management flows, while SSG officer access is granted only from Manage SSG with an explicit position title.

### Main files

- `Backend/app/routers/users.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/tests/test_api.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- changed Campus Admin user creation through `/users/` so non-admin school-scoped actors can only assign the `student` role
- blocked Campus Admin role updates through `/users/{user_id}/roles` so Manage Users can no longer promote `ssg` or `event-organizer`
- tightened the legacy school-settings import route so school-scoped imports only create `student` accounts and no longer accept `ssg_position`
- required an explicit `position_title` when assigning or updating `SSG` officers through governance membership
- removed the old fallback that silently defaulted missing SSG positions to `Representative`
- cleaned up the legacy `ssg_profile` when a student no longer has any active `SSG` membership

### Route or schema impact

- `POST /users/`
  - Campus Admin can only create `student` users from user-management flows
- `PUT /users/{user_id}/roles`
  - Campus Admin now receives a `403` and must use Manage SSG for officer access instead
- `POST /api/governance/units/{governance_unit_id}/members`
  - `position_title` is now required for `SSG`
- `PATCH /api/governance/members/{governance_member_id}`
  - clearing `position_title` on `SSG` officers is now rejected

### Migration impact

- no new migration

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py Backend/app/tests/test_governance_hierarchy_api.py`
- log in as `school_IT` and confirm Manage Users no longer offers role changes for Campus Admin
- try calling `PUT /users/{user_id}/roles` as Campus Admin and confirm it returns `403`
- open Manage SSG and confirm adding an officer without `position_title` is blocked
- remove an SSG officer and confirm the student drops back to a regular student role without a lingering `ssg_profile`

## 2026-03-15 - Convert campus SSG setup into a fixed default Manage SSG flow

### Purpose

Changed the Campus Admin SSG setup from a create-if-missing flow into a fixed single-SSG management flow with a default campus SSG record, editable SSG details, and a frontend UI built around SSG info and officer-management modals.

### Main files

- `Backend/app/models/governance_hierarchy.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/alembic/versions/8b7e6d5c4a3f_add_governance_unit_description_and_ssg_.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `governance_units.description` so the fixed SSG card can store editable details, not just code and name
- added `GET /api/governance/ssg/setup`, which automatically creates the default campus SSG when it does not exist yet
- default SSG bootstrap now uses:
  - `unit_code = SSG`
  - `unit_name = Supreme Students Government`
  - default description for the campus-wide SSG card
- kept the single-SSG guard in place so the school still cannot end up with multiple SSG rows
- changed candidate search for the SSG member picker so already-added active officers are excluded from add-member search results

### Route or schema impact

- added response schema `GovernanceSsgSetupResponse`
- added optional `description` on governance unit create, update, summary, and detail schemas
- added `GET /api/governance/ssg/setup`

### Migration impact

- run `alembic upgrade head` to add `governance_units.description`
- the new migration also backfills a default description for existing `SSG` rows

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- log in as `school_IT` and open `/school_it_governance_hierarchy`
- confirm the page opens with a default `SSG` even if the school had no prior SSG row
- edit the SSG name/description and confirm the update persists
- add an imported student as an SSG officer, then search again and confirm that officer no longer appears in add-member search results
- remove an officer and confirm the user drops back to the regular student role unless another governance membership still applies

## 2026-03-15 - Refine campus SSG setup with single-SSG guard and officer-level permissions

### Purpose

Refined the first governance rollout so Campus Admin can manage exactly one school-wide SSG, search imported students as officer candidates, and assign permissions per officer instead of giving every SSG member the same feature set.

### Main files

- `Backend/app/models/governance_hierarchy.py`
- `Backend/app/models/__init__.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/alembic/versions/7c9e4b2a1d33_add_governance_member_permissions_and_single_ssg_guard.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `governance_member_permissions` so governance access is now granted per officer membership
- changed effective SSG feature access to use member-level permissions instead of unit-level permissions
- enforced one `SSG` per school in both the service layer and a database-level unique partial index
- added searchable imported-student lookup for governance assignment
- changed SSG membership assignment so Campus Admin selects existing imported student users and the backend automatically adds the `ssg` role
- added SSG member update and removal logic, including cleanup of the `ssg` role when the user no longer has an active SSG membership
- kept the existing unit-permission route for future rollout work, but the active SSG feature gating now comes from officer-level permissions

### Route or schema impact

- added `GET /api/governance/students/search`
- added `PATCH /api/governance/units/{governance_unit_id}`
- added `PATCH /api/governance/members/{governance_member_id}`
- added `DELETE /api/governance/members/{governance_member_id}`
- extended governance member request and response schemas to include `permission_codes`, nested `student_profile`, and nested `member_permissions`

### Migration impact

- run `alembic upgrade head` to add `governance_member_permissions`
- the new migration also adds the database guard that blocks multiple `SSG` rows per school

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- log in as `school_IT` and open `/school_it_governance_hierarchy`
- create the single campus `SSG`
- search an imported student by name or `student_id`, assign them as an officer, and give them `manage_events` or `manage_attendance`
- edit that officer and confirm the assigned student, position, and permission set update correctly
- remove the officer and confirm the user no longer keeps the `ssg` role from governance membership alone

## 2026-03-15 - Add governance hierarchy foundation for School IT, SSG, SG, and ORG

### Purpose

Added a clean governance hierarchy layer that lets School IT bootstrap school governance units, assign members and permissions, and enforce safe parent-child and student-scope rules without mixing the logic into routers.

### Main files

- `Backend/app/models/governance_hierarchy.py`
- `Backend/app/schemas/governance_hierarchy.py`
- `Backend/app/services/governance_hierarchy_service.py`
- `Backend/app/routers/governance_hierarchy.py`
- `Backend/app/main.py`
- `Backend/app/models/__init__.py`
- `Backend/alembic/env.py`
- `Backend/alembic/versions/6f8c1234ab56_add_governance_hierarchy_management.py`
- `Backend/app/tests/test_governance_hierarchy_api.py`
- `Backend/docs/BACKEND_GOVERNANCE_HIERARCHY_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added `governance_units`, `governance_members`, `governance_permissions`, and `governance_unit_permissions`
- added `GovernanceUnitType` and `PermissionCode` enums for readable, reusable hierarchy rules
- kept routers thin by moving creation, member assignment, permission assignment, scope validation, and accessible-student filtering into `governance_hierarchy_service.py`
- added `GET /api/governance/access/me` so the frontend can resolve active governance memberships and aggregated permission codes for the current user
- enforced that only `School IT` can create `SSG`
- enforced that only active `SSG` members with `create_sg` can create `SG`
- enforced that only active `SG` members with `create_org` can create `ORG`
- enforced that `ORG` units stay inside the same department scope as their parent `SG`
- adapted the proposed schema to the current backend by using `department_id` and `program_id` only, because the project does not yet have a `colleges` table
- kept `SSG` hierarchy membership aligned with the existing auth model by requiring assigned `SSG` users to already have the existing `ssg` role
- added `get_accessible_students()` so student visibility can be filtered by school, department, and program scope
- changed SSG feature behavior so the `ssg` role no longer implies active features by default; SSG attendance features now require `manage_attendance`, and SSG event-management writes require `manage_events`

### Route or schema impact

- added `POST /api/governance/units`
- added `GET /api/governance/units`
- added `GET /api/governance/units/{governance_unit_id}`
- added `GET /api/governance/access/me`
- added `POST /api/governance/units/{governance_unit_id}/members`
- added `POST /api/governance/units/{governance_unit_id}/permissions`
- added new request and response schemas in `Backend/app/schemas/governance_hierarchy.py`

### Migration impact

- run `alembic upgrade head` to create the governance hierarchy tables
- the migration also seeds the initial governance permission catalog

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_governance_hierarchy_api.py`
- log in as `school_IT` and open `/school_it_governance_hierarchy` to exercise the School IT bootstrap UI
- create an `SSG` as `School IT`, assign an `ssg` user, and grant `create_sg`
- log in as an `ssg` user before assigning any governance permissions and confirm SSG feature routes stay empty or blocked
- grant `manage_events` or `manage_attendance` to the SSG unit and confirm the matching SSG feature becomes available
- log in as that `SSG` member and confirm `SG` creation works only under the correct parent
- grant `create_org` to an `SG` and confirm `ORG` creation is blocked outside the parent department scope

## 2026-03-15 - Add optional first-login password prompt and align onboarding credential flows

### Purpose

Completed the new onboarding flow where brand-new users are only encouraged, not forced, to change their password before continuing to face onboarding, while still keeping reset-issued passwords enforced through the existing forced-change gate.

### Main files

- `Backend/app/models/user.py`
- `Backend/alembic/versions/1e5b4a7c9d01_add_should_prompt_password_change_to_users.py`
- `Backend/app/core/security.py`
- `Backend/app/services/auth_session.py`
- `Backend/app/services/password_change_policy.py`
- `Backend/app/services/email_service.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/users.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/repositories/import_repository.py`
- `Backend/app/schemas/user.py`
- `Backend/app/tests/test_api.py`
- `Backend/app/tests/test_email_service.py`
- `Backend/docs/BACKEND_CHANGELOG.md`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`
- `Backend/docs/BACKEND_FACE_GEO_MERGE_GUIDE.md`
- `Backend/docs/BACKEND_FRONTEND_AUTH_ONBOARDING_GUIDE.md`

### Backend changes

- added `users.should_prompt_password_change` as a persistent one-time onboarding prompt flag
- login and pending-face responses now return `password_change_recommended` based on that stored prompt flag instead of reusing `must_change_password`
- `/auth/change-password` now clears both `must_change_password` and `should_prompt_password_change`
- added `POST /auth/password-change-prompt/dismiss` so a new user can skip the suggestion and continue onboarding without seeing the same prompt on the next login
- allowed the dismiss route and `/auth/change-password` to stay accessible during `face_pending` onboarding sessions
- new accounts created through `/users/`, `/api/school/admin/create-school-it`, school-settings CSV import, and bulk student import now set `should_prompt_password_change=true`
- reset-password flows keep `must_change_password=true` but now explicitly keep `should_prompt_password_change=false` so forced-reset and suggested-change states do not overlap
- `/users/` now honors a submitted password when present and otherwise returns `generated_temporary_password`
- `/api/school/admin/create-school-it` now honors `school_it_password` when supplied and only returns `generated_temporary_password` when the backend generated one
- welcome-email copy now switches between temporary-password wording and normal password wording depending on how the account credentials were created

### Route or schema impact

- added login response field `password_change_recommended`
- added `POST /auth/password-change-prompt/dismiss`
- changed `/users/` response model to include optional `generated_temporary_password`
- `POST /api/school/admin/create-school-it` now returns `generated_temporary_password` only when the backend generated the password

### Migration impact

- run `alembic upgrade head` to add `users.should_prompt_password_change`
- existing rows are backfilled with `false`

### Testing

- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_api.py Backend/app/tests/test_email_service.py`
- create a new user without supplying a password and confirm the response returns `generated_temporary_password`
- create a new user with a supplied password and confirm login works with that exact password
- log in as a prompted user and confirm the response includes `password_change_recommended=true`
- skip the prompt through `POST /auth/password-change-prompt/dismiss` and confirm the next login no longer recommends a password change
- log in as a privileged `face_pending` user and confirm both skip and `/auth/change-password` still work before face onboarding
- approve a password reset and confirm the reset password still forces `/auth/change-password`

## 2026-03-14 - Reorganize backend wiring into core, services, schemas, and workers

### Purpose

Refactored the backend into clearer layers so shared DB wiring lives under `core`, canonical Celery code lives under `workers`, thin CRUD routers delegate to services, and attendance request payloads no longer live inside a router module.

### Main files

- `Backend/app/core/database.py`
- `Backend/app/core/dependencies.py`
- `Backend/app/database.py`
- `Backend/app/workers/celery_app.py`
- `Backend/app/workers/tasks.py`
- `Backend/app/worker/celery_app.py`
- `Backend/app/worker/tasks.py`
- `Backend/app/services/auth_task_dispatcher.py`
- `Backend/app/services/auth_background.py`
- `Backend/app/services/department_service.py`
- `Backend/app/services/program_service.py`
- `Backend/app/schemas/attendance_requests.py`
- `Backend/app/routers/departments.py`
- `Backend/app/routers/programs.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/admin_import.py`
- `Backend/app/tests/test_auth_task_dispatcher.py`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`
- `Backend/docs/BACKEND_ATTENDANCE_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_EVENT_AUTO_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_PROJECT_STRUCTURE_GUIDE.md`

### Backend changes

- moved the canonical SQLAlchemy engine/session setup into `app/core/database.py`
- moved the shared `get_db()` dependency into `app/core/dependencies.py`
- turned `app/database.py` into a compatibility wrapper so the refactor does not break legacy imports immediately
- moved the canonical Celery app and task bodies into `app/workers/`
- kept `app/worker/` as a compatibility wrapper and kept legacy task-name aliases registered during the transition
- extracted department and program CRUD business rules into dedicated service modules so those routers stay thin
- extracted manual and bulk attendance request schemas into `app/schemas/attendance_requests.py`
- replaced debug `print()` calls in `attendance.py` with structured logging
- renamed auth-side async dispatch orchestration to `auth_task_dispatcher.py` and left `auth_background.py` as a compatibility shim

### Route or schema impact

- no HTTP route paths changed
- no existing request or response JSON field names changed
- new internal request-schema module: `Backend/app/schemas/attendance_requests.py`
- `departments` and `programs` routes now delegate to service-layer functions instead of embedding DB business rules inline

### Migration impact

- no database migration required
- runtime/deployment change only: worker and beat should now start from `app.workers.celery_app.celery_app`

### Testing

- run `python -m compileall Backend/app`
- run `Backend\.venv\Scripts\python.exe -m pytest -q Backend/app/tests/test_auth_task_dispatcher.py Backend/app/tests/test_models.py Backend/app/tests/test_api.py`
- restart Celery worker and beat so they load the canonical `app.workers` package
- smoke-test `POST /login`, `POST /api/admin/import-students`, `POST /attendance/manual`, `GET /departments`, and `GET /programs`

## 2026-03-14 - Align forced password-change verification with login hashing

### Purpose

Fixed the forced password-change flow so the temporary password that works at login also works as the `current_password` on `/auth/change-password`, without changing the broader auth, reset, or onboarding logic.

### Main files

- `Backend/app/routers/auth.py`
- `Backend/app/core/security.py`
- `Backend/app/tests/test_api.py`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- changed `/auth/change-password` to validate `current_password` with the same `verify_password()` helper used by `/login`
- removed the hashing-path mismatch between login verification and forced password-change verification
- kept password reset approval, token issuance, and `must_change_password` behavior unchanged

### Route or schema impact

- no route paths changed
- no request or response field names changed
- `/auth/change-password` still expects `current_password` and `new_password`

### Migration impact

- no migration required
- runtime verification change only

### Testing

- run `python -m pytest -q app/tests/test_api.py`
- log in with a temporary password and submit `/auth/change-password` using that same temporary password as `current_password`
- confirm both model-hashed and passlib-hashed stored passwords can complete the forced change successfully

## 2026-03-14 - Allow onboarding accounts to use issued temporary passwords without forced first-login change

### Purpose

Removed the forced first-login password-change flag from newly created and imported accounts so new users can sign in with their issued temporary password without being blocked behind the change-password gate, while keeping reset-password flows unchanged.

### Main files

- `Backend/app/services/password_change_policy.py`
- `Backend/app/services/email_service.py`
- `Backend/app/routers/users.py`
- `Backend/app/routers/school.py`
- `Backend/app/routers/school_settings.py`
- `Backend/app/repositories/import_repository.py`
- `Backend/app/routers/auth.py`
- `Backend/app/tests/test_api.py`
- `Backend/app/tests/test_email_service.py`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`
- `Backend/docs/BACKEND_CHANGELOG.md`

### Backend changes

- added a shared password-change policy helper so onboarding flows and reset flows can intentionally behave differently
- new accounts created through `/users/`, school creation, school-settings CSV import, and bulk import now persist `must_change_password=false`
- password reset approval and manual reset flows still persist `must_change_password=true`
- welcome-email copy now matches the new onboarding behavior and no longer claims a forced first-login password change for brand-new accounts

### Route or schema impact

- no route paths changed
- no request or response field names changed
- `/login` and `/token` still return `must_change_password`; onboarding-created accounts now return `false` unless a later reset flow turns it back on

### Migration impact

- no migration required
- runtime behavior only; existing stored `must_change_password` values are unchanged

### Testing

- run `python -m pytest -q app/tests/test_api.py app/tests/test_email_service.py`
- create a new user through onboarding and confirm login is not forced to `/auth/change-password`
- approve or perform a password reset and confirm the temporary reset password still requires a password change after login

## 2026-03-13 - Fix bcrypt and passlib compatibility warning in auth runtime

### Purpose

Removed the backend password-stack compatibility warning that appeared during login and other bcrypt-backed password operations.

### Main files

- `Backend/requirements.txt`
- `Backend/docs/BACKEND_CHANGELOG.md`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`

### Backend changes

- pinned `bcrypt` to `4.0.1` so it stays compatible with `passlib==1.7.4`
- removed the noisy runtime warning caused by newer `bcrypt` releases dropping the internal `__about__` attribute that `passlib` still checks
- kept the login, password hashing, MFA, and password-reset logic unchanged

### Route or schema impact

- no route paths changed
- no request or response schemas changed
- frontend auth flow remains compatible

### Migration impact

- no migration required
- dependency/runtime change only; rebuild the backend image or reinstall Python dependencies before retesting

### Testing

- run `python -m pytest app/tests`
- rebuild the backend container or reinstall dependencies in the local virtual environment
- smoke-test `POST /login`
- confirm backend logs no longer show the `bcrypt` / `__about__` compatibility traceback during password verification

## 2026-03-13 - Finalize face-recognition naming and normalize attendance payloads

### Purpose

Finished the face-recognition naming cleanup and normalized the event-attendance error payloads without changing the public `/face/...` routes or the success response contract.

### Main files

- `Backend/app/services/event_geolocation.py`
- `Backend/app/services/face_recognition.py`
- `Backend/app/schemas/event.py`
- `Backend/app/schemas/face_recognition.py`
- `Backend/app/models/face_recognition.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/security_center.py`
- `Backend/app/tests/conftest.py`
- `Backend/app/tests/test_api.py`
- `Backend/app/tests/test_models.py`
- `Backend/app/tests/test_event_geolocation_service.py`
- `Frontend/src/api/studentEventCheckInApi.ts`
- `Backend/docs/BACKEND_FACE_GEO_MERGE_GUIDE.md`

### Backend changes

- renamed the student face router module from `app.routers.face` to `app.routers.face_recognition`
- kept the public route prefix and endpoints unchanged at `/face/...`
- added structured error payloads for attendance geolocation failures and required geolocation input failures
- added a message field to attendance travel-risk failures while preserving the existing distance metrics
- included optional `time_status` and `attendance_decision` context in the attendance geolocation response object
- renamed the legacy pytest fixture file to `conftest.py` and switched the backend test harness to a self-contained SQLite setup
- updated the legacy API tests to match the current auth rules and protected-route behavior

### Route or schema impact

- no route paths changed
- no JSON request or response field names changed
- internal router naming is now aligned with the face-recognition service, schema, and model module names
- `POST /events/{event_id}/verify-location` still uses the same request payload and returns the same core geolocation fields
- `POST /face/face-scan-with-recognition` still uses the same request payload and returns the same success fields
- attendance geolocation failure payloads now consistently include `code` and `message` alongside the existing geofence fields

### Migration impact

- no migration required

### Testing

- run `python -m pytest -q`
- smoke-test `GET /`
- smoke-test `POST /events/{event_id}/verify-location` with inside-geofence and outside-geofence coordinates
- smoke-test `POST /face/face-scan-with-recognition` for both success and geolocation/travel-risk failure payloads

## 2026-03-13 - Reduce login latency by moving auth side effects off the request path

### Purpose

Reduced perceived login latency by removing forced SQL query logging and moving login email/notification side effects out of the synchronous request path.

### Main files

- `Backend/app/routers/auth.py`
- `Backend/app/services/auth_background.py`
- `Backend/app/services/email_service.py`
- `Backend/app/services/notification_center_service.py`
- `Backend/app/worker/tasks.py`
- `Backend/app/database.py`
- `Backend/app/tests/test_auth_background.py`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`

### Backend changes

- `/login` now queues account-security notifications asynchronously instead of waiting for SMTP work before responding
- `/login` MFA delivery now validates SMTP configuration first, then dispatches MFA email asynchronously
- `/auth/mfa/verify` now queues the MFA-completed security notification asynchronously
- login-side async dispatch uses Celery first and falls back to FastAPI background tasks if task publishing fails
- SQL query logging is now enabled only when `SQL_ECHO=true`

### Route or schema impact

- no route paths changed
- no login request or response field names changed
- frontend login flow remains compatible

### Migration impact

- no migration required

### Testing

- run `python -m pytest -q`
- smoke-test `POST /login`
- smoke-test `POST /auth/mfa/verify`
- smoke-test frontend production build

## 2026-03-12 - Drop legacy unused database tables

### Purpose

Removed legacy database tables that are no longer used by the active backend models, routers, or services.

### Main files

- `Backend/alembic/versions/9b3e1f2c4d5a_drop_legacy_unused_tables.py`
- `Backend/docs/BACKEND_DATABASE_CLEANUP_GUIDE.md`

### Backend changes

- added a cleanup migration that drops unused legacy tables only when they exist
- preserved all active tables used by current auth, attendance, event, import, notification, security, subscription, and governance flows
- kept the cleanup idempotent by using `DROP TABLE IF EXISTS`

### Route or schema impact

- no HTTP routes changed
- no active request or response schemas changed

### Migration impact

- requires `9b3e1f2c4d5a_drop_legacy_unused_tables.py`
- removes `ai_logs`, `anomaly_logs`, `attendance_predictions`, `event_consumption_logs`, `event_flags`, `event_predictions`, `model_metadata`, `notifications`, `outbox_events`, `recommendation_cache`, `security_alerts`, and `student_risk_scores`

### Testing

- run `alembic upgrade head` on the target PostgreSQL database
- verify the removed tables no longer appear in `information_schema.tables`
- smoke-test login, attendance, events, notifications, security center, governance, and bulk import flows

## 2026-03-11 - Celery Beat automatic event status scheduling

### Purpose

Extended automatic event workflow status sync so it runs even without user traffic, using Celery Beat plus the existing worker and Redis setup.

### Main files

- `Backend/app/core/config.py`
- `Backend/app/services/event_workflow_status.py`
- `Backend/app/worker/celery_app.py`
- `Backend/app/worker/tasks.py`
- `Backend/app/tests/test_event_workflow_status.py`
- `Backend/docs/BACKEND_EVENT_AUTO_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`
- `docker-compose.yml`

### Backend changes

- added scheduler settings for event auto-status sync enable/interval
- added a periodic Celery task that scans active events and syncs their workflow status
- added summary reporting for scheduler runs so logs show transitions and attendance finalization counts
- added a dedicated Docker `beat` service for local and container deployments
- kept the request-driven route sync as a fallback for resiliency

### Route or task impact

- new scheduled task: `app.worker.tasks.sync_event_workflow_statuses`
- no new HTTP routes were required

### Migration impact

- no migration required

## 2026-03-11 - Automatic event workflow status sync

### Purpose

Added automatic backend syncing of stored event workflow status based on event schedule time, while preserving the existing computed attendance-window status system.

### Main files

- `Backend/app/services/event_workflow_status.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/tests/test_event_workflow_status.py`
- `Backend/docs/BACKEND_EVENT_AUTO_STATUS_GUIDE.md`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`

### Backend changes

- added a reusable service that maps computed time status into stored workflow status
- synced event `status` automatically on relevant event, attendance, and face routes
- preserved `cancelled` as a manual terminal state
- treated `completed` as sticky during automatic sync to avoid accidental reopening
- auto-finalized attendance when time-driven sync moved an event into `completed`

### Route impact

- event list/detail routes now refresh stale workflow status before returning data
- attendance and face attendance helpers now refresh stale workflow status before attendance checks
- no new API routes were required

### Migration impact

- no migration required

## 2026-03-11 - Add `late` attendance status support

### Purpose

Added `late` as a valid attendance status across the backend and database without replacing the repo's current attendance, reporting, face-scan, or event logic.

### Main files

- `Backend/app/models/attendance.py`
- `Backend/app/schemas/attendance.py`
- `Backend/app/services/attendance_status.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/services/notification_center_service.py`
- `Backend/alembic/versions/a12b34c56d78_add_late_to_attendance_status_enum.py`
- `Backend/app/tests/test_attendance_status_support.py`
- `Backend/docs/BACKEND_ATTENDANCE_STATUS_GUIDE.md`

### Backend changes

- added `late` to the SQLAlchemy and Pydantic attendance enums
- added a safe PostgreSQL enum migration using `ADD VALUE IF NOT EXISTS`
- updated reports and summaries so `late` counts as attended
- updated status-count dictionaries so `late` is included and does not cause missing-key errors
- left automatic late-threshold assignment out because this repo does not already have that feature

### Migration impact

- requires `a12b34c56d78_add_late_to_attendance_status_enum.py`

## 2026-03-11 - Event late threshold and automatic absent finalization

### Purpose

Added an event-level late-threshold field and automatic absent materialization when an event is completed.

### Main files

- `Backend/app/models/event.py`
- `Backend/app/schemas/event.py`
- `Backend/app/services/attendance_status.py`
- `Backend/app/services/event_attendance_service.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/alembic/versions/b45c67d89e01_add_event_late_threshold_minutes.py`

### Backend changes

- events now store `late_threshold_minutes`
- student sign-ins can finalize as `late` when the time-in exceeds the event threshold
- when an event becomes `completed`, the backend auto-creates `absent` records for scoped students with no attendance
- active attendances with no `time_out` are also auto-marked `absent` on event completion

### Migration impact

- requires `b45c67d89e01_add_event_late_threshold_minutes.py`

## 2026-03-11 - Face recognition and geolocation merge from `GITHUB`

### Purpose

Merged the reference face recognition and event geolocation logic from `GITHUB/Backend` into the live `RIZAL_v1` backend.

### Main files

- `Backend/app/services/face_recognition.py`
- `Backend/app/services/auth_session.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/security_center.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/events.py`
- `Backend/app/models/platform_features.py`
- `Backend/app/models/event.py`
- `Backend/app/models/attendance.py`
- `Backend/alembic/versions/f8b2c1d4e6a7_add_face_profiles_and_event_geo_fields.py`

### Backend changes

- added privileged-user face profiles
- added pending face verification sessions for `admin` and `school_IT`
- added anti-spoof backed privileged face enrollment and verification routes
- added event geofence fields and location verification route
- added combined student face plus geofence attendance scanning

### Important routes

- `POST /auth/login`
- `GET /auth/security/face-status`
- `POST /auth/security/face-liveness`
- `POST /auth/security/face-reference`
- `POST /auth/security/face-verify`
- `POST /face/register`
- `POST /face/register-upload`
- `POST /face/verify`
- `POST /face/face-scan-with-recognition`
- `POST /events/{event_id}/verify-location`

### Migration impact

- requires `f8b2c1d4e6a7_add_face_profiles_and_event_geo_fields.py`

## 2026-03-11 - Geolocation validation hardening

### Purpose

Improved geofence decision safety and reason codes for student attendance and event location verification.

### Main files

- `Backend/app/services/geolocation.py`
- `Backend/app/tests/test_geolocation.py`

### Backend changes

- added coordinate validation helpers
- added radius validation helpers
- added safer accuracy normalization
- added stable location reason codes
- added optional buffered geofence decision mode
- added recommended GPS accuracy helper

### Configuration impact

- no database migration required

## 2026-03-17 - Database pooling, login query reduction, and health telemetry

### Purpose

Hardened the FastAPI backend for login-heavy concurrency by replacing the tiny default SQLAlchemy pool, reducing repeated auth queries, and exposing pool diagnostics for production monitoring.

### Main files

- `Backend/app/core/config.py`
- `Backend/app/core/database.py`
- `Backend/app/core/security.py`
- `Backend/app/services/auth_session.py`
- `Backend/app/routers/auth.py`
- `Backend/app/routers/health.py`
- `Backend/app/main.py`
- `Backend/app/tests/test_api.py`
- `.env.example`
- `Backend/docs/BACKEND_AUTH_LOGIN_PERFORMANCE_GUIDE.md`

### Backend changes

- added configurable DB pool settings:
  - `DB_POOL_SIZE`
  - `DB_MAX_OVERFLOW`
  - `DB_POOL_TIMEOUT_SECONDS`
  - `DB_POOL_RECYCLE_SECONDS`
- set SQLAlchemy engine pooling explicitly with `pool_pre_ping`, `pool_use_lifo`, and `expire_on_commit=False`
- added `get_database_pool_snapshot()` so runtime pool pressure can be inspected safely
- added `GET /health` to report DB reachability and current pool usage
- reduced login-path queries by eager-loading roles, school settings, and face profile in the auth lookup
- converted login/auth dependency callables from `async def` to sync callables so synchronous SQLAlchemy and bcrypt work do not block FastAPI's event loop
- reduced repeated school lookups by reusing eager-loaded school/settings data when available

### How to test

1. Set `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SECONDS`, and `DB_POOL_RECYCLE_SECONDS` in your deployment environment.
2. Start the backend and call `GET /health`; confirm the reported pool settings match the environment.
3. Log in with a student account and confirm `POST /login` still returns a valid token.
4. Log in with an admin or Campus Admin account and confirm MFA or face-pending behavior still works.
5. Run a concurrent login test and watch `/health` while traffic is active; confirm pool utilization rises without immediate `QueuePool limit` failures.

### Migration impact

- no database migration required

## 2026-03-17 - Deactivated schools now block all school-scoped sessions

### Purpose

Closed the gap where login rejected inactive schools, but already-issued student sessions could still access protected routes after a school was deactivated.

### Main files

- `Backend/app/core/security.py`
- `Backend/app/services/auth_session.py`
- `Backend/app/tests/test_api.py`

### Backend changes

- extracted shared account-state validation so login and protected-route auth use the same inactive-account and inactive-school guard
- protected routes now reject school-scoped users when their school is inactive, even if their token was issued before the school was deactivated
- platform admins without a school assignment remain allowed

### How to test

1. Deactivate a school through `PATCH /api/school/admin/{school_id}/status` with `active_status=false`.
2. Try `POST /login` for a student or Campus Admin in that school and confirm the response is `403` with `This account's school is inactive.`
3. Use a previously issued bearer token for a user in that school against a protected route such as `GET /users/me/` and confirm it now also returns `403`.
4. Reactivate the school and confirm normal login works again for the same accounts.

### Migration impact

- no database migration required

## 2026-03-11 - Attendance sign-in/sign-out completion logic

### Purpose

Made attendance status depend on both sign-in and sign-out completion, aligned with the event schedule.

### Main files

- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/attendance.py`

### Backend changes

- sign-in now creates a provisional attendance record
- sign-out finalizes the attendance record
- final status becomes `present` only when the recorded attendance window aligns with the event schedule
- unfinished attendance cleanup was adjusted to preserve correct processing

### Route impact

- behavior changed in `POST /face/face-scan-with-recognition`

## 2026-03-11 - Dynamic event time status for attendance decisions

### Purpose

Added a computed event time-status layer so attendance windows can be enforced automatically from event schedule data without writing a second status to the database.

### Main files

- `Backend/app/services/event_time_status.py`
- `Backend/app/services/attendance_status.py`
- `Backend/app/routers/events.py`
- `Backend/app/routers/face_recognition.py`
- `Backend/app/routers/attendance.py`
- `Backend/app/tests/test_event_time_status.py`
- `Backend/app/tests/test_attendance_status_support.py`
- `Backend/docs/BACKEND_EVENT_TIME_STATUS_GUIDE.md`

### Backend changes

- added `get_event_status()` for computed `upcoming/open/late/closed` event windows
- added `get_attendance_decision()` for `present/late/reject` attendance decisions
- exposed `GET /events/{event_id}/time-status`
- extended `POST /events/{event_id}/verify-location` to include dynamic time-status and attendance-decision payloads
- enforced automatic `upcoming` and `closed` rejection for new student and staff attendance check-ins
- normalized event schedule and attendance timestamps more safely for `Asia/Manila`

### Migration impact

- no database migration required

## 2026-03-11 - Login guard for invalid school and admin account state

### Purpose

Stopped invalid accounts from logging in and then failing later with misleading school-context errors.

### Main files

- `Backend/app/services/auth_session.py`
- `Backend/app/routers/auth.py`
- `Backend/app/tests/test_auth_session_login_guard.py`

### Backend changes

- login now rejects inactive accounts
- login now rejects accounts with no assigned role
- login now rejects school-scoped accounts that are missing a valid school assignment
- login now rejects accounts linked to inactive schools
- MFA verification re-checks the same account-state guard before completing login

### Migration impact

- no database migration required
