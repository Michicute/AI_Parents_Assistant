from __future__ import annotations

import re
from typing import Any, Mapping

from app.models.domain import EnglishSkill


def normalized_answer_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def multiple_choice_label(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) == 1 and text.isalpha():
        return text.lower()
    match = re.match(r"^([A-Za-z])\s*[\).:-]\s*", text)
    return match.group(1).lower() if match else None


def multiple_choice_text_without_label(value: str | None) -> str:
    return re.sub(r"^[A-Za-z]\s*[\).:-]\s*", "", (value or "").strip()).strip()


def choice_for_label(question: Mapping[str, Any], label: str | None) -> str | None:
    if not label:
        return None
    choices = question.get("choices")
    if not isinstance(choices, list):
        return None
    for choice in choices:
        if multiple_choice_label(str(choice)) == label:
            return str(choice)
    index = ord(label.lower()) - ord("a")
    if 0 <= index < len(choices):
        return str(choices[index])
    return None


def multiple_choice_match_values(value: str | None) -> set[str]:
    text = normalized_answer_text(value)
    without_label = normalized_answer_text(multiple_choice_text_without_label(value))
    return {item for item in {text, without_label} if item}


def question_skill_value(question: Mapping[str, Any]) -> str:
    skill_tag = question.get("skill_tag")
    return skill_tag.value if isinstance(skill_tag, EnglishSkill) else str(skill_tag)


def auto_score_answer(question: Mapping[str, Any], answer_text: str) -> float | None:
    expected_answer = question.get("expected_answer")
    if not isinstance(expected_answer, str) or not expected_answer.strip():
        return None

    max_score = float(question["max_score"])
    if question["question_type"] == "multiple_choice":
        expected_normalized = normalized_answer_text(expected_answer)
        answer_normalized = normalized_answer_text(answer_text)
        expected_label = multiple_choice_label(expected_answer)
        answer_label = multiple_choice_label(answer_text)
        labels_match = expected_label is not None and expected_label == answer_label
        answer_text_matches_expected = bool(multiple_choice_match_values(expected_answer) & multiple_choice_match_values(answer_text))
        expected_choice = choice_for_label(question, expected_label)
        expected_choice_matches = False
        if expected_choice:
            expected_choice_matches = bool(multiple_choice_match_values(expected_choice) & multiple_choice_match_values(answer_text))
        answer_choice = choice_for_label(question, answer_label)
        answer_choice_matches = False
        if answer_choice:
            answer_choice_matches = bool(multiple_choice_match_values(expected_answer) & multiple_choice_match_values(answer_choice))
        return max_score if expected_normalized == answer_normalized or answer_text_matches_expected or labels_match or expected_choice_matches or answer_choice_matches else 0.0

    if question["question_type"] == "essay" and question_skill_value(question) != EnglishSkill.writing.value:
        return max_score if normalized_answer_text(answer_text) == normalized_answer_text(expected_answer) else 0.0

    return None
