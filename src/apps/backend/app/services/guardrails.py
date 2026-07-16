"""Deterministic safety checks for the AI chat trust boundaries.

Authorization remains the responsibility of backend services. These guardrails
prevent unsafe user requests, untrusted retrieved instructions, and unsafe model
answers from crossing into the next stage of the chat pipeline.
"""

from dataclasses import dataclass, field
import re
import unicodedata


@dataclass(frozen=True)
class GuardrailDecision:
    allowed: bool
    value: str | list[str]
    safety_notes: list[str] = field(default_factory=list)


MAX_INPUT_CHARS = 8_000
MAX_CONTEXT_ITEM_CHARS = 8_000
MAX_CONTEXT_CHARS = 24_000


_SUBMIT_READY_PATTERNS = (
    r"\b(?:do|write|complete|solve|answer)\s+(?:my|this|the)\s+(?:homework|assignment|quiz|exam|test)\b",
    r"\b(?:give|show|send)\s+me\s+(?:the\s+)?(?:answer|answer key|solution)s?\b",
    r"\b(?:provide|generate|create|draft|write)\s+(?:me\s+)?(?:a\s+)?(?:complete|final|finished|submit ready\s+)?(?:answer|essay|paragraph|report|speech|script)\b",
    r"\b(?:answer|essay|paragraph|report|speech|script)\s+(?:that|which)\s+i\s+can\s+(?:submit|hand in|turn in)\b",
    r"\b(?:answer|solve|complete)\s+(?:these|the following)\s+(?:questions|exercises)\s+for\s+me\b",
    r"\b(?:làm|giải|viết|hoàn thành)\s+(?:hộ|giùm|cho)\s+(?:tôi|con|em)?\s*(?:bài tập|bài kiểm tra|bài thi|đáp án)\b",
    r"\b(?:làm|giải|viết|hoàn thành)\s+(?:giúp\s+)?(?:bài tập|bài kiểm tra|bài thi|bài văn|đoạn văn)\b.{0,40}\b(?:hộ|giùm|giúp|cho)\s+(?:tôi|con|em)\b",
    r"\b(?:làm|giải|viết|hoàn thành)\s+(?:hộ|giùm|giúp|cho)\s+(?:tôi|con|em)\b.{0,40}\b(?:bài tập|bài kiểm tra|bài thi|bài văn|đoạn văn)\b",
    r"\b(?:bài văn|đoạn văn|bài nói|câu trả lời)\b.{0,40}\b(?:để|cho)\s+(?:con|em|tôi)?\s*(?:nộp|chép)\b",
    r"\b(?:cho|đưa|gửi)\s+(?:tôi|mình|em)\s+(?:đáp án|bài giải)\b",
)

_PROMPT_INJECTION_PATTERNS = (
    r"ignore (?:all |any )?(?:previous|prior|above|earlier) (?:instructions|rules|messages|prompts)",
    r"disregard (?:the )?(?:system|developer|previous) (?:message|prompt|instructions)",
    r"(?:forget|override|bypass) (?:all |the |your )?(?:previous |prior |system |developer )?(?:instructions|rules|safeguards|prompt)",
    r"(?:reveal|print|show|repeat) (?:the |your )?(?:system prompt|hidden prompt|developer message)",
    r"(?:act|pretend) (?:as if you are|as) (?:the )?(?:system|developer|administrator)",
    r"bỏ qua (?:mọi |tất cả )?(?:chỉ dẫn|hướng dẫn|yêu cầu) (?:trước|ở trên)",
    r"bỏ qua (?:mọi |tất cả )?(?:chỉ dẫn|hướng dẫn|quy tắc)(?:\s*(?:,|;|và|rồi|để)|\s*$)",
    r"(?:quên|ghi đè|vượt qua) (?:mọi |tất cả |các )?(?:chỉ dẫn|hướng dẫn|quy tắc|cơ chế an toàn)",
    r"tiết lộ (?:system prompt|prompt hệ thống|chỉ dẫn ẩn)",
    r"(?:in|hiển thị|cho (?:tôi )?xem|đọc lại) (?:toàn bộ )?(?:system prompt|prompt hệ thống|chỉ dẫn ẩn)",
)

_RETRIEVAL_INSTRUCTION_PATTERNS = _PROMPT_INJECTION_PATTERNS + (
    r"\b(?:system|assistant|developer)\s*:\s*",
    r"you are now (?:a|an|the)\b",
    r"follow these instructions",
)

_OUTPUT_LEAK_PATTERNS = (
    r"\b(?:system prompt|developer message)\s*(?:is|:)\s*",
    r"\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[\w.-]{8,}",
    r"\bsk-(?:proj-|svcacct-)?[a-z0-9_-]{16,}\b",
    r"\b(?:bearer\s+)[a-z0-9._~-]{16,}\b",
    r"\beyj[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b",
    r"-----begin (?:rsa |ec |openssh )?private key-----",
)

_OUTPUT_SUBMIT_READY_PATTERNS = (
    r"\bhere (?:is|are) (?:your|the) (?:completed |finished )?(?:homework|assignment|quiz|exam|test|answers?)\b",
    r"\b(?:copy|submit) (?:this|the following) (?:answer|response|essay)\b",
    r"\b(?:đáp án|bài giải) (?:để nộp |hoàn chỉnh )?(?:là|:)\s*",
    r"\b(?:chép|nộp) (?:nguyên văn |câu trả lời )?(?:này|sau)\b",
)


def check_input(message: str, locale: str | None = None) -> GuardrailDecision:
    """Validate raw user text before intent routing or retrieval."""
    if len(message) > MAX_INPUT_CHARS:
        return GuardrailDecision(False, _refusal(locale, "input_too_long"), ["input_too_long_blocked"])
    if _matches(_PROMPT_INJECTION_PATTERNS, message):
        return GuardrailDecision(False, _refusal(locale, "security"), ["input_prompt_injection_blocked"])
    if _matches(_SUBMIT_READY_PATTERNS, message):
        return GuardrailDecision(False, _refusal(locale, "academic_integrity"), ["input_homework_answer_blocked"])
    return GuardrailDecision(True, message)


def check_retrieval(context: list[str]) -> GuardrailDecision:
    """Treat repository and RAG text as untrusted before prompt construction."""
    safe: list[str] = []
    notes: list[str] = []
    total_chars = 0
    for item in context:
        if not isinstance(item, str):
            notes.append("retrieval_invalid_item_removed")
            continue
        compact = item.strip()
        if not compact:
            continue
        if _matches(_RETRIEVAL_INSTRUCTION_PATTERNS, compact):
            notes.append("retrieval_untrusted_instruction_removed")
            continue
        remaining = MAX_CONTEXT_CHARS - total_chars
        if remaining <= 0:
            notes.append("retrieval_context_limit_reached")
            break
        limit = min(MAX_CONTEXT_ITEM_CHARS, remaining)
        safe_item = compact[:limit]
        if len(safe_item) < len(compact):
            notes.append("retrieval_item_truncated")
        safe.append(safe_item)
        total_chars += len(safe_item)
    if context and not safe:
        return GuardrailDecision(False, [], [*notes, "retrieval_guardrail_failed_closed"])
    return GuardrailDecision(True, safe, notes)


def check_output(answer: str, locale: str | None = None) -> GuardrailDecision:
    """Validate model text before it is persisted or returned to a client."""
    if not answer.strip():
        return GuardrailDecision(False, _refusal(locale, "unavailable"), ["output_empty_blocked"])
    if _matches(_OUTPUT_LEAK_PATTERNS, answer):
        return GuardrailDecision(False, _refusal(locale, "security"), ["output_sensitive_content_blocked"])
    if _matches(_OUTPUT_SUBMIT_READY_PATTERNS, answer):
        return GuardrailDecision(False, _refusal(locale, "academic_integrity"), ["output_homework_answer_blocked"])
    return GuardrailDecision(True, answer.strip())


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]", "", normalized)
    normalized = re.sub(r"[^\wÀ-ỹ]+", " ", normalized, flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return _collapse_spaced_letters(normalized)


def _matches(patterns: tuple[str, ...], value: str) -> bool:
    raw = unicodedata.normalize("NFKC", value).casefold()
    normalized = _normalize(value)
    return any(re.search(pattern, raw) or re.search(pattern, normalized) for pattern in patterns)


def _collapse_spaced_letters(value: str) -> str:
    tokens = value.split()
    collapsed: list[str] = []
    index = 0
    while index < len(tokens):
        end = index
        while end < len(tokens) and len(tokens[end]) == 1 and tokens[end].isalpha():
            end += 1
        if end - index >= 4:
            collapsed.append("".join(tokens[index:end]))
            index = end
            continue
        collapsed.extend(tokens[index : max(end, index + 1)])
        index = max(end, index + 1)
    return " ".join(collapsed)


def _refusal(locale: str | None, reason: str) -> str:
    english = str(locale or "").casefold().startswith("en")
    if reason == "academic_integrity":
        if english:
            return "I can’t provide submit-ready answers. I can explain the skill, suggest practice, or give parents coaching questions."
        return "Tôi không thể cung cấp đáp án có thể nộp. Tôi có thể giải thích kỹ năng, gợi ý luyện tập hoặc câu hỏi để phụ huynh hướng dẫn con."
    if reason == "security":
        if english:
            return "I can’t follow requests to bypass safeguards or reveal hidden system instructions."
        return "Tôi không thể làm theo yêu cầu vượt qua cơ chế an toàn hoặc tiết lộ chỉ dẫn hệ thống."
    if reason == "input_too_long":
        if english:
            return "This message is too long to process safely. Please shorten it and focus on one parent-support question."
        return "Tin nhắn quá dài để xử lý an toàn. Vui lòng rút gọn và tập trung vào một câu hỏi hỗ trợ phụ huynh."
    if english:
        return "I can’t provide a safe answer from the available information. Please contact the center if you need help."
    return "Tôi chưa thể đưa ra câu trả lời an toàn từ thông tin hiện có. Vui lòng liên hệ trung tâm nếu cần hỗ trợ."
