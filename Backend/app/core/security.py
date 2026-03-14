from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt as _bcrypt
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import TokenData
from app.services.security_service import assert_session_valid

settings = get_settings()
SECRET_KEY = settings.secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="token",
    scopes={
        "read": "Read access",
        "write": "Write access",
    },
)

PASSWORD_CHANGE_ENDPOINT = "/auth/change-password"
EXEMPT_PATH_PREFIXES = {
    PASSWORD_CHANGE_ENDPOINT,
    "/login",
    "/token",
    "/docs",
    "/redoc",
    "/openapi.json",
}
FACE_VERIFICATION_EXEMPT_PATH_PREFIXES = {
    "/auth/security/face-status",
    "/auth/security/face-liveness",
    "/auth/security/face-reference",
    "/auth/security/face-verify",
}


def normalize_role_name(role_name: str) -> str:
    """Normalize role spellings to a single comparison format."""
    normalized = (role_name or "").strip().lower().replace(" ", "-").replace("_", "-")
    if normalized == "school-it":
        return "school-it"
    if normalized == "event-organizer":
        return "event-organizer"
    return normalized


def get_normalized_user_roles(user: User) -> set[str]:
    return {
        normalize_role_name(role.role.name)
        for role in getattr(user, "roles", [])
        if getattr(role, "role", None) and getattr(role.role, "name", None)
    }


def has_any_role(user: User, required_roles: List[str]) -> bool:
    user_roles = get_normalized_user_roles(user)
    required = {normalize_role_name(role_name) for role_name in required_roles}
    return bool(user_roles & required)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return _bcrypt.hashpw(password.encode('utf-8'), _bcrypt.gensalt(rounds=12)).decode('utf-8')


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.email == email)
        .first()
    )

    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token_to_token_data(token: str) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_exception
        return TokenData(
            email=email,
            school_id=payload.get("school_id"),
            roles=payload.get("roles"),
            must_change_password=payload.get("must_change_password"),
            jti=payload.get("jti"),
            face_pending=payload.get("face_pending"),
        )
    except JWTError as exc:
        raise credentials_exception from exc


def _raise_password_change_required() -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "password_change_required",
            "message": "Password change is required before accessing protected resources.",
            "change_password_endpoint": PASSWORD_CHANGE_ENDPOINT,
        },
    )


def _raise_face_verification_required() -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "face_verification_required",
            "message": "Face verification is required before accessing protected resources.",
            "verify_endpoint": "/auth/security/face-verify",
        },
    )


def _enforce_face_verification_gate(token_data: TokenData, request: Request) -> None:
    if not token_data.face_pending:
        return

    path = request.url.path
    if any(path.startswith(prefix) for prefix in FACE_VERIFICATION_EXEMPT_PATH_PREFIXES):
        return

    _raise_face_verification_required()


def _enforce_password_change_gate(user: User, request: Request) -> None:
    if not user.must_change_password:
        return

    path = request.url.path
    if any(path.startswith(prefix) for prefix in EXEMPT_PATH_PREFIXES):
        return

    _raise_password_change_required()


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    token_data = decode_token_to_token_data(token)

    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .filter(User.email == token_data.email)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not token_data.face_pending:
        assert_session_valid(db, token_jti=token_data.jti)
    _enforce_face_verification_gate(token_data, request)
    _enforce_password_change_gate(user, request)
    return user


async def get_current_user_with_roles(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    token_data = decode_token_to_token_data(token)

    user = (
        db.query(User)
        .options(
            joinedload(User.roles).joinedload(UserRole.role),
            joinedload(User.student_profile),
            joinedload(User.ssg_profile),
        )
        .filter(User.email == token_data.email)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not token_data.face_pending:
        assert_session_valid(db, token_jti=token_data.jti)
    _enforce_face_verification_gate(token_data, request)
    _enforce_password_change_gate(user, request)
    return user


def get_school_id_or_403(user: User) -> int:
    school_id = getattr(user, "school_id", None)
    if school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to a school",
        )
    return school_id


def ensure_same_school(current_user: User, target_school_id: Optional[int]) -> None:
    if target_school_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource has no school assignment")
    if get_school_id_or_403(current_user) != target_school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not has_any_role(current_user, ["admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_current_ssg(current_user: User = Depends(get_current_user_with_roles)) -> User:
    if not has_any_role(current_user, ["ssg"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SSG privileges required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_current_event_organizer(current_user: User = Depends(get_current_user_with_roles)) -> User:
    if not has_any_role(current_user, ["event-organizer", "event_organizer"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event organizer privileges required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_current_school_it(current_user: User = Depends(get_current_user_with_roles)) -> User:
    if not has_any_role(current_user, ["school_IT", "school-it", "school_it"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School IT privileges required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_user_with_required_roles(
    required_roles: List[str],
    current_user: User = Depends(get_current_user_with_roles),
) -> User:
    if not has_any_role(current_user, required_roles):
        role_str = ", ".join(required_roles)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required roles: {role_str}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user
