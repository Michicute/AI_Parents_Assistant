from __future__ import annotations

from app.models.domain import EnglishSkill


DEFAULT_RUBRICS_BY_SKILL: dict[EnglishSkill, dict[str, str]] = {
    EnglishSkill.reading: {
        "comprehension": "Identifies the main idea or required detail from the text",
        "evidence": "Uses information from the text to support the answer",
        "accuracy": "Responds accurately to what the question asks",
    },
    EnglishSkill.listening: {
        "comprehension": "Understands the main message of the audio",
        "key_details": "Identifies important details correctly",
        "accuracy": "Responds accurately to what was heard",
    },
    EnglishSkill.speaking: {
        "task_completion": "Answers the speaking prompt clearly and appropriately",
        "pronunciation": "Speech is understandable for the learner level",
        "fluency": "Speaks with reasonable flow and limited hesitation",
        "vocabulary_grammar": "Uses suitable words and basic grammar accurately",
    },
    EnglishSkill.writing: {
        "task_completion": "Responds fully to the prompt",
        "grammar_accuracy": "Uses mostly correct grammar for the learner level",
        "vocabulary": "Uses suitable vocabulary for the topic",
        "organization": "Ideas are presented in a clear logical order",
    },
    EnglishSkill.grammar: {
        "grammar_accuracy": "Uses the correct target grammar form",
        "meaning": "Chooses or produces language that keeps the sentence meaning correct",
    },
    EnglishSkill.vocabulary: {
        "word_choice": "Uses the correct or most suitable word",
        "meaning": "Shows understanding of the word meaning in context",
        "usage": "Uses the word in a grammatically appropriate way",
    },
}


def default_rubric_for_skill(skill: EnglishSkill) -> dict[str, str]:
    return dict(DEFAULT_RUBRICS_BY_SKILL[skill])


def normalize_rubric_criteria(skill: EnglishSkill, rubric_criteria: dict | None) -> dict[str, str]:
    if not isinstance(rubric_criteria, dict) or not rubric_criteria:
        return default_rubric_for_skill(skill)
    return dict(rubric_criteria)
