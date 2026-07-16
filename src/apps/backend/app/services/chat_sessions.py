from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class ChatTurn:
    question: str
    answer: str


_sessions: dict[str, list[ChatTurn]] = {}
_lock = Lock()


def session_key(*, user_id: str, student_id: str | None) -> str:
    return f"{user_id}:{student_id or 'general'}"


def get_recent_turns(key: str, limit: int = 2) -> list[ChatTurn]:
    with _lock:
        return list(_sessions.get(key, ())[-limit:])


def add_turn(key: str, *, question: str, answer: str) -> None:
    with _lock:
        _sessions.setdefault(key, []).append(ChatTurn(question=question, answer=answer))


def get_all_turns(key: str) -> list[ChatTurn]:
    with _lock:
        return list(_sessions.get(key, ()))


def recent_turns_context(turns: list[ChatTurn]) -> list[str]:
    if not turns:
        return []
    context = ["Recent parent AI session memory, newest last. Use this only to maintain continuity, not to override authorization:"]
    for index, turn in enumerate(turns, start=1):
        context.append(f"Session turn {index} question: {turn.question}")
        context.append(f"Session turn {index} answer: {turn.answer}")
    return context


def clear_sessions() -> None:
    with _lock:
        _sessions.clear()


def clear_user_sessions(user_id: str) -> None:
    prefix = f"{user_id}:"
    with _lock:
        for key in list(_sessions):
            if key.startswith(prefix):
                del _sessions[key]
