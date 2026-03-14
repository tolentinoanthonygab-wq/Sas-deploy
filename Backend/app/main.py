from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.routers import (
    users,
    events,
    programs,
    departments,
    auth,
    attendance,
    school_settings,
    admin_import,
    school,
    audit_logs,
    notifications,
    security_center,
    subscription,
    governance,
    face_recognition,
)
from pathlib import Path


app = FastAPI()
settings = get_settings()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(events.router)
app.include_router(programs.router)
app.include_router(departments.router)
app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(school_settings.router)
app.include_router(admin_import.router)
app.include_router(school.router)
app.include_router(audit_logs.router)
app.include_router(notifications.router)
app.include_router(security_center.router)
app.include_router(subscription.router)
app.include_router(governance.router)
app.include_router(face_recognition.router)

logo_storage_dir = Path(settings.school_logo_storage_dir)
logo_storage_dir.mkdir(parents=True, exist_ok=True)
app.mount(settings.school_logo_public_prefix, StaticFiles(directory=str(logo_storage_dir)), name="school-logos")

@app.get("/")
async def root():
    return {
        "message": "Welcome to the Student Attendance System API",
        "endpoints": {
            "users": "/users",
            "events": "/events",
            "programs": "/programs",
            "departments": "/departments",
            "school_settings": "/school-settings",
            "admin_import": "/api/admin/import-students",
            "school_branding": "/api/school/me",
            "audit_logs": "/api/audit-logs",
            "notifications": "/api/notifications",
            "security": "/auth/security",
            "face": "/face",
            "subscription": "/api/subscription/me",
            "governance": "/api/governance/settings/me",
        }
    }
