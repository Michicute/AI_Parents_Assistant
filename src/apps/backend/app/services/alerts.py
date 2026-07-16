from datetime import date
from typing import Any

from app.services.parent_notifications import publish_parent_notification


ALERT_THRESHOLD_PERCENT = 50.0


def get_teacher_dashboard_alerts(*, teacher_id: str) -> list[dict]:
    from app.services.repositories import repository

    alerts: list[dict] = []
    for class_record in repository.get_classes_for_teacher(teacher_id):
        for student in repository.get_students_for_class(class_record.id):
            alerts.extend(get_student_class_alerts(student=student, class_record=class_record))
    return _sort_alerts(alerts)


def get_student_class_alerts(*, student: Any, class_record: Any) -> list[dict]:
    from app.services.repositories import repository

    alerts: list[dict] = []
    attendance_rows = [item for item in repository.get_attendance(student.id) if item.class_id == class_record.id]
    latest_attendance = attendance_rows[:2]
    if len(latest_attendance) == 2 and all(item.status == "absent" for item in latest_attendance):
        alerts.append(
            _teacher_alert(
                student=student,
                class_record=class_record,
                reason="absence_streak",
                reason_label="Vắng 2 buổi liên tiếp",
                metric_value=2,
                metric_label="2 buổi vắng liên tiếp",
                occurred_on=latest_attendance[0].class_date,
            )
        )

    scores = [score for score in repository.get_scores_for_student(student.id) if score.class_id == class_record.id]
    if scores:
        average = round(sum(score.score for score in scores) / len(scores), 1)
        if average < ALERT_THRESHOLD_PERCENT:
            alerts.append(
                _teacher_alert(
                    student=student,
                    class_record=class_record,
                    reason="average_score_low",
                    reason_label="Điểm trung bình thấp",
                    metric_value=average,
                    metric_label=f"Trung bình {average}%",
                    occurred_on=scores[0].assessed_on,
                )
            )

        scores_by_skill: dict[str, list] = {}
        for score in scores:
            scores_by_skill.setdefault(score.skill.value, []).append(score)
        for skill, skill_scores in scores_by_skill.items():
            skill_label = _skill_label_vi(skill)
            skill_average = round(sum(score.score for score in skill_scores) / len(skill_scores), 1)
            if skill_average < ALERT_THRESHOLD_PERCENT:
                alerts.append(
                    _teacher_alert(
                        student=student,
                        class_record=class_record,
                        reason="average_score_low",
                        reason_label=f"Điểm trung bình {skill_label.lower()} thấp",
                        metric_value=skill_average,
                        metric_label=f"{skill_label} - trung bình {skill_average}%",
                        occurred_on=skill_scores[0].assessed_on,
                    )
                )
            latest_skill_score = skill_scores[0]
            if latest_skill_score.score < ALERT_THRESHOLD_PERCENT:
                latest_value = round(latest_skill_score.score, 1)
                alerts.append(
                    _teacher_alert(
                        student=student,
                        class_record=class_record,
                        reason="latest_score_low",
                        reason_label=f"Điểm {skill_label.lower()} gần nhất thấp",
                        metric_value=latest_value,
                        metric_label=f"{skill_label} - gần nhất {latest_value}%",
                        occurred_on=latest_skill_score.assessed_on,
                    )
                )

    latest_assessment = next(
        (
            assessment
            for assessment in repository.get_assessment_summary_for_student(student.id)["assessments"]
            if assessment.get("class_id") == class_record.id
            and assessment.get("is_finalized")
            and assessment.get("total_score") is not None
            and assessment.get("max_score")
        ),
        None,
    )
    if latest_assessment:
        percent = round(float(latest_assessment["total_score"]) / float(latest_assessment["max_score"]) * 100, 1)
        if percent < ALERT_THRESHOLD_PERCENT:
            alerts.append(
                _teacher_alert(
                    student=student,
                    class_record=class_record,
                    reason="latest_assessment_low",
                    reason_label="Bài kiểm tra gần nhất thấp",
                    metric_value=percent,
                    metric_label=f"{latest_assessment['title']}: {percent}%",
                    occurred_on=date.fromisoformat(latest_assessment["assessment_date"]) if latest_assessment.get("assessment_date") else None,
                )
            )
    return alerts


def publish_teacher_dashboard_alerts(*, teacher_id: str, created_by_user_id: str | None) -> dict:
    from app.services.repositories import repository

    alerts = get_teacher_dashboard_alerts(teacher_id=teacher_id)
    return publish_dashboard_alerts(alerts=alerts, created_by_user_id=created_by_user_id)


def publish_student_class_alerts(*, student_id: str, class_id: str, assessment_id: str | None, created_by_user_id: str | None) -> dict:
    from app.services.repositories import repository

    student = repository.get_student(student_id)
    class_record = repository.get_class(class_id)
    if student is None or class_record is None:
        return {"alerts_checked": 0, "notifications_created": 0}
    alerts = get_student_class_alerts(student=student, class_record=class_record)
    return publish_dashboard_alerts(alerts=alerts, assessment_id=assessment_id, created_by_user_id=created_by_user_id)


def publish_dashboard_alerts(*, alerts: list[dict], created_by_user_id: str | None, assessment_id: str | None = None) -> dict:
    from app.services.repositories import repository

    summary = {"alerts_checked": len(alerts), "notifications_created": 0}
    new_alerts_by_student: dict[str, list[tuple[dict, Any]]] = {}
    for alert in alerts:
        event, is_new = repository.create_student_alert_event_if_new(
            student_id=alert["student_id"],
            class_id=alert["class_id"],
            assessment_id=assessment_id,
            reason=alert["reason"],
            reason_label=alert["reason_label"],
            metric_value=alert.get("metric_value"),
            metric_label=alert["metric_label"],
            occurred_on=alert.get("occurred_on"),
            metadata={"source": "teacher_dashboard_overview", **_json_safe_alert(alert)},
        )
        if not is_new:
            continue
        new_alerts_by_student.setdefault(alert["student_id"], []).append((alert, event))

    for student_alerts in new_alerts_by_student.values():
        first_alert = student_alerts[0][0]
        event_ids = [event.id for _, event in student_alerts]
        notifications = publish_parent_notification(
            student_id=first_alert["student_id"],
            notification_type="student_dashboard_alert",
            title=_dashboard_alert_batch_title([alert for alert, _ in student_alerts]),
            content=_dashboard_alert_batch_content([alert for alert, _ in student_alerts]),
            source_type="student_alert_event_batch",
            source_id="|".join(event_ids),
            created_by_user_id=created_by_user_id,
            metadata={
                "class_ids": sorted({alert["class_id"] for alert, _ in student_alerts}),
                "reasons": [alert["reason"] for alert, _ in student_alerts],
                "source": "teacher_dashboard_overview",
                "alert_event_ids": event_ids,
            },
        )
        for _, event in student_alerts:
            repository.mark_student_alert_event_notified(event.id)
        summary["notifications_created"] += len(notifications)
    return summary


def _teacher_alert(
    *,
    student: Any,
    class_record: Any,
    reason: str,
    reason_label: str,
    metric_value: float | None,
    metric_label: str,
    occurred_on: date | None,
) -> dict:
    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "class_id": class_record.id,
        "class_name": class_record.name,
        "reason": reason,
        "reason_label": reason_label,
        "metric_value": metric_value,
        "metric_label": metric_label,
        "occurred_on": occurred_on,
    }


def _sort_alerts(alerts: list[dict]) -> list[dict]:
    priority = {"absence_streak": 0, "latest_assessment_low": 1, "latest_score_low": 2, "average_score_low": 3}
    return sorted(alerts, key=lambda item: (priority.get(item["reason"], 99), item["student_name"], item["class_name"]))


def _dashboard_alert_title(alert: dict) -> str:
    return f"[{alert['student_name']}] Cần chú ý: {alert['reason_label']}"


def _dashboard_alert_content(alert: dict) -> str:
    occurred_on = alert.get("occurred_on")
    occurred_label = _format_vi_date(occurred_on) if occurred_on else "Chưa có ngày ghi nhận"
    return (
        f"{_dashboard_alert_title(alert)}\n\n"
        f"Lớp: {alert['class_name']}\n"
        f"Ngày ghi nhận: {occurred_label}\n"
        f"{alert['reason_label']}: {alert['metric_label']}.\n\n"
        "Phụ huynh có thể xem chi tiết trong ứng dụng hoặc trao đổi thêm với giáo viên để hỗ trợ con."
    )


def _dashboard_alert_batch_title(alerts: list[dict]) -> str:
    first_alert = alerts[0]
    if len(alerts) == 1:
        return _dashboard_alert_title(first_alert)
    return f"[{first_alert['student_name']}] Cần chú ý: {len(alerts)} cảnh báo học tập"


def _dashboard_alert_batch_content(alerts: list[dict]) -> str:
    if len(alerts) == 1:
        return _dashboard_alert_content(alerts[0])

    first_alert = alerts[0]
    lines = [
        _dashboard_alert_batch_title(alerts),
        "",
        "Trung tâm ghi nhận các cảnh báo sau:",
    ]
    for index, alert in enumerate(alerts, start=1):
        occurred_on = alert.get("occurred_on")
        occurred_label = _format_vi_date(occurred_on) if occurred_on else "Chưa có ngày ghi nhận"
        lines.extend(
            [
                f"{index}. {alert['reason_label']}: {alert['metric_label']}.",
                f"   Lớp: {alert['class_name']}",
                f"   Ngày ghi nhận: {occurred_label}",
            ]
        )
    lines.extend(
        [
            "",
            f"Phụ huynh có thể xem chi tiết của {first_alert['student_name']} trong ứng dụng hoặc trao đổi thêm với giáo viên để hỗ trợ con.",
        ]
    )
    return "\n".join(lines)


def _json_safe_alert(alert: dict) -> dict:
    payload = dict(alert)
    occurred_on = payload.get("occurred_on")
    if isinstance(occurred_on, date):
        payload["occurred_on"] = occurred_on.isoformat()
    return payload


def _skill_label_vi(skill: str) -> str:
    return {
        "reading": "Reading",
        "listening": "Listening",
        "speaking": "Speaking",
        "writing": "Writing",
        "grammar": "Ngữ pháp",
        "vocabulary": "Từ vựng",
    }.get(skill, skill.title())


def _format_vi_date(value: date) -> str:
    weekday_labels = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"]
    return f"{weekday_labels[value.weekday()]}, {value.day:02d}/{value.month:02d}/{value.year}"
