from jose import JWTError, jwt
from fastapi import Depends, Header, HTTPException, status
from app.core.config import get_settings
from app.models.domain import Principal, Role
from app.services.repositories import repository


def _credentials_error(detail: str = "Invalid authentication token") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _verify_local_jwt(token: str) -> dict:
    settings = get_settings()
    jwt_secret = settings.app_secret_key
    if not jwt_secret:
        raise _credentials_error("APP_SECRET_KEY is required for JWT verification")
    try:
        return jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
    except JWTError as exc:
        raise _credentials_error() from exc


def _verify_session_epoch(claims: dict) -> None:
    token_session_epoch = claims.get("session_epoch")
    if token_session_epoch != get_settings().app_session_epoch:
        raise _credentials_error("Session expired")


def _principal_from_claims(claims: dict) -> Principal:
    auth_subject = claims.get("sub")
    email = claims.get("email")
    if not auth_subject:
        raise _credentials_error()

    user = repository.get_user_by_auth_subject(auth_subject)
    if user is None and email:
        user = repository.get_user_by_email(email)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not registered")

    linked_student_ids: list[str] = []
    assigned_class_ids: list[str] = []
    if user.role == Role.parent:
        linked_student_ids = [student.id for student in repository.get_linked_students_for_parent(user.id)]
    if user.role == Role.student:
        linked_student_ids = [student.id for student in repository.get_students_for_student_user(user.id)]
    if user.role == Role.teacher:
        assigned_class_ids = repository.get_assigned_class_ids_for_teacher(user.id)

    return Principal(
        user_id=user.id,
        email=user.email,
        role=user.role,
        linked_student_ids=linked_student_ids,
        assigned_class_ids=assigned_class_ids,
    )


def get_current_user(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.startswith("Bearer "):
        raise _credentials_error("Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise _credentials_error("Authentication required")
    claims = _verify_local_jwt(token)
    _verify_session_epoch(claims)
    return _principal_from_claims(claims)


def get_current_principal(authorization: str | None = Header(default=None)) -> Principal:
    return get_current_user(authorization)


def require_admin(principal: Principal = Depends(get_current_user)) -> Principal:
    if principal.role != Role.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return principal


def require_teacher(principal: Principal = Depends(get_current_user)) -> Principal:
    if principal.role != Role.teacher:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher role required")
    return principal


def require_parent(principal: Principal = Depends(get_current_user)) -> Principal:
    if principal.role != Role.parent:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Parent role required")
    return principal


def require_student(principal: Principal = Depends(get_current_user)) -> Principal:
    if principal.role != Role.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")
    return principal


def assert_parent_can_access_student(parent_id: str, student_id: str) -> None:
    if not repository.parent_can_access_student(parent_id, student_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent cannot access this student",
        )


def assert_teacher_can_access_class(teacher_id: str, class_id: str) -> None:
    if not repository.teacher_can_access_class(teacher_id, class_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher cannot access this class",
        )


def assert_admin_access(user_id: str) -> None:
    user = repository.get_user(user_id)
    if user is None or user.role != Role.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


def can_access_student(principal: Principal, student_id: str, class_ids: list[str] | None = None) -> bool:
    if principal.role == Role.admin:
        return True
    if principal.role == Role.parent:
        if principal.linked_student_ids:
            return student_id in principal.linked_student_ids
        return repository.parent_can_access_student(principal.user_id, student_id)
    if principal.role == Role.student:
        return student_id in principal.linked_student_ids
    if principal.role == Role.teacher:
        return any(repository.teacher_can_access_class(principal.user_id, class_id) for class_id in class_ids or [])
    return False


def assert_student_access(
    principal: Principal,
    student_id: str,
    class_ids: list[str] | None = None,
) -> None:
    if not can_access_student(principal, student_id, class_ids):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this student",
        )
