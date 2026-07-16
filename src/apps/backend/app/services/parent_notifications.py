from datetime import UTC, datetime
import logging

from app.models.domain import ParentNotificationRecord
from app.services.repositories import repository
from app.services.scheduled_zalo import schedule_teacher_class_action_zalo_reminders
from app.services.zalo_outbound import ZaloOutboundError, send_zalo_notification

logger = logging.getLogger(__name__)


def publish_parent_notification(
    *,
    student_id: str,
    notification_type: str,
    title: str,
    content: str,
    source_type: str,
    source_id: str,
    created_by_user_id: str | None,
    metadata: dict | None = None,
) -> list[ParentNotificationRecord]:
    parent_ids = repository.get_parent_user_ids_for_student(student_id)
    if not parent_ids:
        return []

    active_zalo_links = repository.get_active_channel_links_for_student(student_id, "zalo")
    if not active_zalo_links:
        logger.info("No active Zalo link for student_id=%s; notification will remain in-app only", student_id)
    created: list[ParentNotificationRecord] = []
    for parent_id in parent_ids:
        initial_zalo_status = "pending" if active_zalo_links else "not_linked"
        notification, is_new = repository.create_parent_notification_if_new(
            parent_user_id=parent_id,
            student_id=student_id,
            notification_type=notification_type,
            title=title,
            content=content,
            source_type=source_type,
            source_id=source_id,
            created_by_user_id=created_by_user_id,
            metadata=metadata,
            zalo_status=initial_zalo_status,
        )
        if not is_new:
            created.append(notification)
            continue
        if not active_zalo_links:
            created.append(notification)
            continue

        last_error = None
        sent = False
        for link in active_zalo_links:
            try:
                send_zalo_notification(link=link, content=content)
                sent = True
            except ZaloOutboundError as exc:
                last_error = str(exc)
                logger.warning("Failed to deliver parent notification to Zalo notification_id=%s student_id=%s error=%s", notification.id, student_id, exc)
        updated = repository.update_parent_notification_zalo_status(
            notification.id,
            zalo_status="sent" if sent else "failed",
            zalo_error=None if sent else last_error,
            sent_zalo_at=datetime.now(UTC) if sent else None,
        )
        created.append(updated or notification)
    return created


def publish_teacher_class_message(
    *,
    class_id: str,
    draft_id: str,
    content: str,
    created_by_user_id: str,
) -> dict:
    draft = repository.get_teacher_class_action_draft(draft_id)
    scheduled_for = draft.get("scheduled_for") if draft else None
    action_type = draft.get("action_type") if draft else "teacher_reminder"
    scheduled_label = _format_vi_date(scheduled_for) if scheduled_for else "Chưa có ngày áp dụng"
    students = repository.get_students_for_class(class_id)
    summary = {
        "students_targeted": len(students),
        "notifications_created": 0,
        "zalo_sent": 0,
        "zalo_not_linked": 0,
        "zalo_failed": 0,
    }
    for student in students:
        title = f"[{student.full_name}] {_teacher_message_title(action_type)}"
        formatted_content = _format_teacher_message_content(
            action_type=action_type,
            title=title,
            scheduled_label=scheduled_label,
            content=content,
        )
        notifications = publish_parent_notification(
            student_id=student.id,
            notification_type="teacher_message",
            title=title,
            content=formatted_content,
            source_type="teacher_class_action_draft",
            source_id=draft_id,
            created_by_user_id=created_by_user_id,
            metadata={"class_id": class_id},
        )
        summary["notifications_created"] += len(notifications)
        for notification in notifications:
            if notification.zalo_status == "sent":
                summary["zalo_sent"] += 1
            elif notification.zalo_status == "not_linked":
                summary["zalo_not_linked"] += 1
            elif notification.zalo_status == "failed":
                summary["zalo_failed"] += 1
    schedule_teacher_class_action_zalo_reminders(
        class_id=class_id,
        draft_id=draft_id,
        action_type=action_type,
        content=content,
        scheduled_for=scheduled_for,
    )
    return summary


def _teacher_message_title(action_type: str) -> str:
    if action_type == "unexpected_absence_notice":
        return "Cảnh báo nghỉ học đột xuất"
    if action_type == "assessment_result_notice":
        return "Thông báo kết quả chấm điểm"
    return "Dặn dò quan trọng từ giáo viên"


def _format_teacher_message_content(
    *, action_type: str, title: str, scheduled_label: str, content: str
) -> str:
    if action_type == "unexpected_absence_notice":
        return "\n".join(
            [
                "[THÔNG BÁO] LỊCH HỌC CÓ THAY ĐỔI",
                title,
                f"Ngày áp dụng: {scheduled_label}",
                "",
                "Lớp nghỉ đột xuất. Phụ huynh vui lòng lưu ý để sắp xếp thời gian cho học viên.",
                f"Lý do: {content}",
                "",
                "Vui lòng theo dõi thêm thông báo từ trung tâm hoặc giáo viên nếu có cập nhật mới.",
            ]
        )

    if action_type == "assessment_result_notice":
        return "\n".join(
            [
                "[THÔNG BÁO] KẾT QUẢ CHẤM ĐIỂM",
                title,
                f"Ngày áp dụng: {scheduled_label}",
                "",
                f"Nội dung: {content}",
                "",
                "Phụ huynh vui lòng xem nhận xét và hỗ trợ học viên luyện tập theo gợi ý của giáo viên.",
            ]
        )

    return "\n".join(
        [
            "[THÔNG BÁO] TỪ GIÁO VIÊN",
            title,
            f"Ngày áp dụng: {scheduled_label}",
            "",
            f"Nội dung: {content}",
            "",
            "Phụ huynh vui lòng nhắc học viên thực hiện để buổi học tiếp theo đạt hiệu quả tốt hơn.",
        ]
    )


def _format_vi_date(value) -> str:
    if value is None:
        return "Chưa có ngày áp dụng"
    weekday_labels = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"]
    return f"{weekday_labels[value.weekday()]}, {value.day:02d}/{value.month:02d}/{value.year}"
