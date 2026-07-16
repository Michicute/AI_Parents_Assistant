from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ZaloFormattedAnswer:
    answer: str
    styles: list[dict[str, int | str]]


_STYLE_MARKERS = (
    ("**", "b"),
    ("__", "b"),
    ("*", "i"),
    ("_", "i"),
)


_LIST_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*$")
_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def format_for_zalo(answer: str) -> ZaloFormattedAnswer:
    """Convert a small Markdown-like answer into text plus Zalo style ranges."""
    without_fences = _CODE_FENCE_RE.sub(lambda match: match.group(0).replace("`", "").strip(), answer or "")
    lines = without_fences.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    output_parts: list[str] = []
    styles: list[dict[str, int | str]] = []
    previous_blank = False

    for raw_line in lines:
        line = raw_line.rstrip()
        if not line.strip():
            if output_parts and not previous_blank:
                output_parts.append("\n")
                previous_blank = True
            continue

        if output_parts and not output_parts[-1].endswith("\n"):
            output_parts.append("\n")
        if output_parts and previous_blank and not output_parts[-1].endswith("\n\n"):
            output_parts.append("\n")

        previous_blank = False
        line_start = sum(len(part) for part in output_parts)
        heading = _HEADING_RE.match(line)
        is_heading = heading is not None
        if heading:
            line = heading.group(2)

        is_list_item = _LIST_RE.match(line) is not None
        if is_list_item:
            line = _LIST_RE.sub("", line, count=1)
            output_parts.append("• ")
            line_start += 2

        parsed_text, parsed_styles = _parse_inline_styles(line, line_start)
        output_parts.append(parsed_text)

        if is_heading and parsed_text:
            styles.append({"start": line_start, "len": len(parsed_text), "st": "b"})
        if is_list_item and parsed_text:
            styles.append({"start": line_start, "len": len(parsed_text), "st": "ul"})
        styles.extend(parsed_styles)

    text = "".join(output_parts).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return ZaloFormattedAnswer(answer=text, styles=_dedupe_styles(styles, len(text)))


def _parse_inline_styles(text: str, base_offset: int) -> tuple[str, list[dict[str, int | str]]]:
    text = _INLINE_CODE_RE.sub(r"\1", text)
    output: list[str] = []
    styles: list[dict[str, int | str]] = []
    stack: list[tuple[str, str, int]] = []
    i = 0

    while i < len(text):
        marker_style = _marker_at(text, i)
        if marker_style:
            marker, style = marker_style
            open_index = next((idx for idx in range(len(stack) - 1, -1, -1) if stack[idx][0] == marker), None)
            if open_index is None:
                stack.append((marker, style, len(output)))
            else:
                _, close_style, start = stack.pop(open_index)
                span_len = len(output) - start
                if span_len > 0:
                    styles.append({"start": base_offset + start, "len": span_len, "st": close_style})
            i += len(marker)
            continue
        output.append(text[i])
        i += 1

    rendered = "".join(output)
    return rendered, styles


def _marker_at(text: str, index: int) -> tuple[str, str] | None:
    for marker, style in _STYLE_MARKERS:
        if text.startswith(marker, index):
            if marker in {"*", "_"}:
                if text.startswith(marker * 2, index):
                    continue
                if _is_word_internal_marker(text, index):
                    continue
            return marker, style
    return None


def _is_word_internal_marker(text: str, index: int) -> bool:
    before = text[index - 1] if index > 0 else " "
    after = text[index + 1] if index + 1 < len(text) else " "
    return before.isalnum() and after.isalnum()


def _dedupe_styles(styles: list[dict[str, int | str]], text_len: int) -> list[dict[str, int | str]]:
    seen: set[tuple[int, int, str]] = set()
    deduped: list[dict[str, int | str]] = []
    for style in styles:
        start = int(style["start"])
        length = int(style["len"])
        st = str(style["st"])
        if start < 0 or length <= 0 or start >= text_len:
            continue
        length = min(length, text_len - start)
        key = (start, length, st)
        if key in seen:
            continue
        seen.add(key)
        deduped.append({"start": start, "len": length, "st": st})
    return deduped
