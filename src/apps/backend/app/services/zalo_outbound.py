from datetime import UTC, datetime
import logging

import httpx

from app.core.config import get_settings
from app.models.domain import StudentChannelLink
from app.services.repositories import repository

logger = logging.getLogger(__name__)


class ZaloOutboundError(Exception):
    pass


def send_zalo_notification(*, link: StudentChannelLink, content: str) -> None:
    settings = get_settings()
    if not settings.zalo_service_url:
        raise ZaloOutboundError("Zalo service URL is not configured")
    if not settings.integration_shared_secret:
        raise ZaloOutboundError("Integration shared secret is not configured")

    url = f"{settings.zalo_service_url.rstrip('/')}/internal/messages/send"
    payload = {
        "sender_id": link.sender_id,
        "message": content,
        "student_id": link.student_id,
        "channel_link_id": link.id,
    }
    headers = {"Authorization": f"Bearer {settings.integration_shared_secret}"}
    logger.info("Sending outbound Zalo notification student_id=%s channel_link_id=%s", link.student_id, link.id)
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Outbound Zalo notification failed student_id=%s channel_link_id=%s error=%s", link.student_id, link.id, exc)
        raise ZaloOutboundError(str(exc)) from exc

    repository.create_zalo_message(
        sender_id=link.sender_id,
        direction="outbound",
        content=content,
        student_id=link.student_id,
        channel_link_id=link.id,
        zalo_display_name=link.zalo_display_name,
        sent_at=datetime.now(UTC),
    )
    logger.info("Outbound Zalo notification sent student_id=%s channel_link_id=%s", link.student_id, link.id)
