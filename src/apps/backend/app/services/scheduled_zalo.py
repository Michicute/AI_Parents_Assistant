from datetime import UTC, date, datetime, time, timedelta
import logging
import time as time_module

from app.services.repositories import repository
from app.services.zalo_outbound import ZaloOutboundError, send_zalo_notification


logger = logging.getLogger(__name__)

REMINDER_ACTION_TYPES = {"teacher_reminder", "unexpected_absence_notice"}


def schedule_teacher_class_action_zalo_reminders(
    *,
    class_id: str,
    draft_id: str,
    action_type: str,
    content: str,
    scheduled_for: date | None,
) -> dict:
    if action_type not in REMINDER_ACTION_TYPES or scheduled_for is None:
        return {"scheduled": 0, "skipped": 0}

    send_at = datetime.combine(scheduled_for - timedelta(days=1), time(hour=20), tzinfo=UTC)
    if send_at <= datetime.now(UTC):
        return {"scheduled": 0, "skipped": 0}

    students = repository.get_students_for_class(class_id)
    summary = {"scheduled": 0, "skipped": 0}
    for student in students:
        parent_ids = repository.get_parent_user_ids_for_student(student.id)
        if not parent_ids:
            summary["skipped"] += 1
            continue
        if not repository.get_active_channel_links_for_student(student.id, "zalo"):
            summary["skipped"] += len(parent_ids)
            continue
        title = f"[{student.full_name}] Nhắc lại: {_teacher_message_title(action_type)}"
        reminder_content = _format_reminder_content(
            action_type=action_type,
            student_name=student.full_name,
            scheduled_for=scheduled_for,
            content=content,
        )
        for parent_id in parent_ids:
            _, is_new = repository.create_scheduled_zalo_notification_if_new(
                parent_user_id=parent_id,
                student_id=student.id,
                source_type="teacher_class_action_draft",
                source_id=draft_id,
                send_at=send_at,
                title=title,
                content=reminder_content,
                metadata={
                    "class_id": class_id,
                    "action_type": action_type,
                    "scheduled_for": scheduled_for.isoformat(),
                },
            )
            if is_new:
                summary["scheduled"] += 1
    return summary


def process_due_scheduled_zalo_notifications(*, limit: int = 50) -> dict:
    due = repository.list_due_scheduled_zalo_notifications(now=datetime.now(UTC), limit=limit)
    summary = {"checked": len(due), "sent": 0, "failed": 0, "skipped": 0}
    for item in due:
        links = repository.get_active_channel_links_for_student(item["student_id"], "zalo")
        if not links:
            repository.mark_scheduled_zalo_notification_skipped(item["id"], reason="No active Zalo link")
            summary["skipped"] += 1
            continue
        sent = False
        last_error = None
        for link in links:
            try:
                send_zalo_notification(link=link, content=item["content"])
                sent = True
            except ZaloOutboundError as exc:
                last_error = str(exc)
                logger.warning("Failed scheduled Zalo notification id=%s student_id=%s error=%s", item["id"], item["student_id"], exc)
        if sent:
            repository.mark_scheduled_zalo_notification_sent(item["id"], sent_at=datetime.now(UTC))
            summary["sent"] += 1
        else:
            repository.mark_scheduled_zalo_notification_failed(item["id"], error=last_error or "Zalo send failed")
            summary["failed"] += 1
    return summary


def run_scheduled_zalo_worker(*, interval_seconds: int = 60) -> None:
    while True:
        try:
            summary = process_due_scheduled_zalo_notifications()
            if summary["checked"]:
                logger.info("Scheduled Zalo notifications processed: %s", summary)
        except Exception:
            logger.exception("Scheduled Zalo notification worker failed")
        time_module.sleep(interval_seconds)


def _teacher_message_title(action_type: str) -> str:
    if action_type == "unexpected_absence_notice":
        return "Lịch học có thay đổi"
    return "Dặn dò từ giáo viên"


def _format_reminder_content(*, action_type: str, student_name: str, scheduled_for: date, content: str) -> str:
    scheduled_label = _format_vi_date(scheduled_for)
    if action_type == "unexpected_absence_notice":
        return "\n".join(
            [
                "[ZALO NHẮC LẠI] LỊCH HỌC CÓ THAY ĐỔI",
                f"Học viên: {student_name}",
                f"Ngày áp dụng: {scheduled_label}",
                "",
                "Lớp nghỉ đột xuất.",
                f"Lý do: {content}",
                "",
                "Phụ huynh vui lòng lưu ý để sắp xếp thời gian cho học viên.",
            ]
        )
    return "\n".join(
        [
            "[ZALO NHẮC LẠI] DẶN DÒ TỪ GIÁO VIÊN",
            f"Học viên: {student_name}",
            f"Ngày áp dụng: {scheduled_label}",
            "",
            f"Nội dung: {content}",
            "",
            "Phụ huynh vui lòng nhắc học viên chuẩn bị trước buổi học.",
        ]
    )


def _format_vi_date(value: date) -> str:
    weekday_labels = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"]
    return f"{weekday_labels[value.weekday()]}, {value.day:02d}/{value.month:02d}/{value.year}"
