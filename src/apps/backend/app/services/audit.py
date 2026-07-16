from datetime import UTC, datetime
from app.models.domain import Principal


def audit_log(principal: Principal, action: str, resource_type: str, resource_id: str) -> dict:
    return {
        "actor_id": principal.user_id,
        "actor_role": principal.role,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "created_at": datetime.now(UTC).isoformat(),
    }
