from app.services.zalo_format import format_for_zalo


def test_format_for_zalo_bold_span():
    result = format_for_zalo("Xin chào **phụ huynh**")

    assert result.answer == "Xin chào phụ huynh"
    assert {"start": 9, "len": 9, "st": "b"} in result.styles


def test_format_for_zalo_bullets_and_inline_code():
    result = format_for_zalo("- Luyện `reading` 10 phút\n- Gửi bài cho giáo viên")

    assert result.answer == "• Luyện reading 10 phút\n• Gửi bài cho giáo viên"
    assert {"start": 2, "len": 21, "st": "ul"} in result.styles
    assert {"start": 26, "len": 21, "st": "ul"} in result.styles


def test_format_for_zalo_heading_becomes_bold_text():
    result = format_for_zalo("## Tóm tắt\nCon đang tiến bộ")

    assert result.answer == "Tóm tắt\nCon đang tiến bộ"
    assert {"start": 0, "len": 7, "st": "b"} in result.styles


def test_format_for_zalo_plain_text_is_stable():
    result = format_for_zalo("Con nên luyện nghe ngắn mỗi ngày.")

    assert result.answer == "Con nên luyện nghe ngắn mỗi ngày."
    assert result.styles == []
