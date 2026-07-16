# Đặc tả UX tương tác theo từng element — Teacher Dashboard

Tài liệu bóc tách các element trong `teacher_dasboad.png`. Dashboard giáo viên nên giúp nhìn nhanh lịch dạy, bài cần chấm, tiến độ lớp, phản hồi học viên và thông báo cần xử lý.

## 1. Quy chuẩn chung

| Thuộc tính | Đề xuất |
|---|---|
| Transition | 160–200 ms, `ease-out` |
| Hover card | Viền xanh nhạt, shadow tăng nhẹ, nâng `-2px` |
| Hover button | Màu đậm hơn 6–8%, nâng `-1px` |
| Pressed | `scale(0.98)` |
| Focus | Outline 2 px màu xanh, offset 2 px |
| Vùng bấm | Tối thiểu 44 × 44 px |
| Tooltip | Sau 400–500 ms, đóng bằng `Esc` |
| Reduced motion | Bỏ translate/scale không thiết yếu |

## 2. Sidebar

### 2.1. Logo Pippo

- **Hover:** mascot nhún `-1px`, cursor pointer.
- **Click:** về Dashboard và scroll lên đầu nếu đã ở trang này.
- **Focus:** outline toàn vùng logo.

### 2.2. Nhãn “Giáo viên”

- Text phân nhóm, không bấm, không hover.

### 2.3. Menu “Dashboard” active

- **Mặc định:** nền xanh nhạt, icon/chữ xanh, chỉ báo cạnh trái.
- **Hover:** nền đậm hơn nhẹ, không dịch chuyển.
- **Click:** về đầu trang.

### 2.4. Các menu còn lại

Gồm Lớp học, Học viên, Điểm danh, Điểm số, Bài kiểm tra, Báo cáo, Câu hỏi AI, Cài đặt.

- **Hover:** nền xanh rất nhạt; icon chuyển xanh; chữ dịch phải `2px`.
- **Click:** ripple nhẹ, chuyển trang và cập nhật active state.
- **Focus:** outline toàn hàng.
- **Badge gợi ý:** Bài kiểm tra hiện số bài chưa chấm; Điểm danh hiện lớp chưa hoàn tất.
- **Tooltip:** chỉ cần khi sidebar thu gọn.

### 2.5. Card “Pippo AI Assistant”

- **Mặc định:** gradient nhẹ, mascot, mô tả và CTA.
- **Hover card:** viền/shadow tăng nhẹ; mascot nghiêng rất nhỏ một lần.
- **Không animate liên tục.**

### 2.6. Nút “Trò chuyện ngay”

- **Hover:** nền xanh đậm hơn; mũi tên trượt phải `3px`.
- **Click:** mở drawer AI bên phải, giữ nguyên dashboard.
- **Drawer:** có prompt gợi ý “Soạn giáo án”, “Phân tích tiến độ”, “Tạo câu hỏi”.
- **Loading:** skeleton dòng chat và nút stop.
- **Lưu ý:** nội dung AI cần nhãn rõ và cho giáo viên xác nhận trước khi dùng.

### 2.7. Hồ sơ “Lan Nguyen — Giáo viên”

- **Hover:** nền nhạt, avatar có viền xanh, chevron xoay nhẹ.
- **Click:** menu Hồ sơ, Thiết lập thông báo, Trợ giúp, Đăng xuất.
- **Click ngoài/`Esc`:** đóng và trả focus.

## 3. Thanh trên cùng

### 3.1. Ô “Tìm kiếm nhanh…”

- **Mặc định:** icon search, placeholder và phím tắt `⌘K`/`Ctrl+K`.
- **Hover:** viền xanh nhạt.
- **Focus:** viền xanh 2 px; mở command palette.
- **Nhập:** debounce 200–300 ms; nhóm kết quả theo Lớp học, Học viên, Bài tập, Báo cáo.
- **Keyboard:** mũi tên chọn, Enter mở, Esc đóng.
- **Không có kết quả:** gợi ý từ khóa và action liên quan.
- **Loading:** spinner nhỏ trong ô, không khóa nhập.

### 3.2. Chuông thông báo

- **Mặc định:** badge đỏ “3”.
- **Hover:** nền tròn nhạt; chuông rung nhẹ một lần; tooltip “3 thông báo chưa đọc”.
- **Click:** popover 3–5 thông báo, có “Đánh dấu tất cả đã đọc”.
- **Khi đọc:** badge đếm xuống và fade khi về 0.

### 3.3. Tin nhắn

- **Mặc định:** badge đỏ “2”.
- **Hover:** nền tròn nhạt; icon chat animate ba chấm một lần.
- **Click:** popover hội thoại gần đây.
- **Dòng hover:** nền xanh nhạt; click mở drawer chat.

### 3.4. Avatar và chevron

- **Hover:** nền nhạt, viền avatar xanh.
- **Click:** mở menu tài khoản.
- **Focus:** outline toàn cụm, không chỉ avatar.

## 4. Khu vực chào mừng và bộ chọn lớp

### 4.1. “Xin chào, Lan Nguyen! 👋”

- Text tĩnh; fade-in nhẹ khi tải.
- Emoji không animation lặp.

### 4.2. Dòng ngày và lời chúc

- Text tĩnh.
- **Đề xuất:** thay lời chúc chung bằng tóm tắt hành động: “Hôm nay có 1 lớp và 26 bài cần chấm”.

### 4.3. Dropdown “Lớp đang dạy”

- **Mặc định:** label, tên lớp và chevron.
- **Hover:** viền xanh, nền xanh nhạt; chevron dịch xuống.
- **Click:** mở dropdown có tìm kiếm và danh sách lớp; lớp hiện tại có check.
- **Chọn lớp:** toàn dashboard dùng skeleton cục bộ rồi cross-fade dữ liệu.
- **Ghi nhớ:** lưu lớp được chọn gần nhất.

### 4.4. Nút icon lịch cạnh bộ chọn lớp

- **Hover:** nền xanh đậm hơn, icon calendar nhún `-1px`; tooltip “Xem lịch lớp”.
- **Click:** mở lịch của lớp đang chọn.
- **Không có lớp:** disabled với tooltip giải thích.

## 5. Các KPI card

Quy chuẩn chung: toàn card chỉ bấm nếu có trang drill-down; hover nâng `-2px`, viền theo màu icon và hiện chevron nhỏ. Nếu không có đích đến, không dùng cursor pointer.

### 5.1. “Tổng học viên — 18”

- **Hover:** icon nhóm người sáng lên; tooltip “Tăng 2 học viên so với tháng trước”.
- **Click:** mở danh sách học viên của lớp hiện tại.
- **Xu hướng:** hover vào “↑ 2” mở popover so sánh theo tháng.

### 5.2. “Điểm danh hôm nay — 16/18, 89%”

- **Hover:** icon target xoay rất nhẹ một lần; tooltip “2 học viên chưa có mặt”.
- **Click:** mở màn hình điểm danh hôm nay.
- **Chưa hoàn tất:** badge cam “Cần xác nhận”.
- **Đã hoàn tất:** icon check xanh và thời gian cập nhật.

### 5.3. “Bài kiểm tra — 3 chưa chấm”

- **Hover:** nền tím nhạt, số 3 nổi bật; tooltip “3 bài kiểm tra đang chờ chấm”.
- **Click:** mở danh sách đã lọc “Chưa chấm”.
- **Có deadline:** badge cam/đỏ và số ngày còn lại.

### 5.4. “Điểm trung bình — 82%”

- **Hover:** mini sparkline hoặc tooltip lịch sử 3 tháng; không mở chart lớn ngay.
- **Click:** mở báo cáo điểm lớp.
- **Xu hướng “↑ 4%”:** giải thích rõ “tăng 4 điểm phần trăm so với tháng trước”.

### 5.5. “Xếp hạng lớp — Top 3”

- **Hover:** icon sao phát sáng nhẹ một lần; tooltip “Xếp hạng trong trung tâm”.
- **Click:** mở bảng xếp hạng và tiêu chí tính.
- **Lưu ý:** tránh tạo áp lực cạnh tranh; cung cấp thêm tiến bộ của chính lớp.

## 6. Card “Lịch dạy sắp tới”

### 6.1. Nút “Xem lịch đầy đủ”

- **Hover:** viền xanh/nền xanh nhạt; mũi tên trượt phải `2px`.
- **Click:** mở trang lịch, giữ bộ lọc giáo viên.

### 6.2. Mỗi dòng lịch

- **Element:** ô ngày, tên lớp, giờ, phòng và badge còn bao nhiêu ngày.
- **Hover:** nền xanh rất nhạt, dịch phải `2px`, hiện chevron.
- **Click:** mở drawer buổi dạy có danh sách học viên, giáo án và điểm danh.
- **Focus:** outline toàn dòng.
- **Buổi gần nhất:** viền xanh hoặc nhãn “Sắp tới”.

### 6.3. Ô ngày

- **Hover cùng dòng:** nền xanh đậm hơn, số ngày đổi xanh đậm.
- **Hôm nay:** nền xanh đặc, chữ trắng.

### 6.4. Tên lớp

- **Hover:** đổi xanh; tooltip nếu bị ellipsis.
- **Click:** theo toàn dòng; không tạo link lồng nếu cùng đích.

### 6.5. Giờ và phòng

- **Hover giờ:** tooltip thời lượng.
- **Hover phòng:** tooltip địa chỉ/sơ đồ nếu có.
- **Nếu lịch thay đổi:** giá trị mới màu cam và badge “Đã đổi”.

### 6.6. Badge “Còn 2/3/6 ngày”

- **Hover:** tooltip ngày giờ đầy đủ.
- **Màu:** trung tính/xanh; chuyển cam khi còn dưới 24 giờ.
- **Không click riêng.**

## 7. Card “Tiến độ lớp học”

### 7.1. Nút “Xem chi tiết”

- **Hover:** nền xanh nhạt, mũi tên trượt phải.
- **Click:** mở báo cáo tiến độ theo unit và học viên.

### 7.2. Mỗi dòng Unit

- **Element:** tên unit, progress bar và phần trăm.
- **Hover:** nền xám/xanh rất nhạt; progress bar sáng hơn; hiện chevron.
- **Click:** mở chi tiết nội dung đã dạy, chưa dạy và kết quả học viên.
- **Keyboard:** focus toàn dòng; screen reader đọc tên và phần trăm.

### 7.3. Progress bar

- **Hover:** thanh dày thêm 2 px; tooltip “Đã hoàn thành X/Y nội dung”.
- **Animation tải:** chạy từ giá trị cũ tới mới trong 400 ms, không chạy từ 0 mỗi lần hover.
- **Không dùng màu đơn độc:** luôn có % dạng chữ.

### 7.4. Hộp “Gợi ý”

- **Mặc định:** nền xanh nhạt, icon bóng đèn và nội dung.
- **Hover:** viền xanh rõ hơn, icon sáng nhẹ một lần.
- **Click:** nếu có gợi ý chi tiết, mở popover; nếu chỉ là text thì không dùng cursor pointer.
- **Có thể thêm CTA:** “Xem học viên cần hỗ trợ”.

## 8. Card “Bài tập cần chấm”

### 8.1. Mỗi dòng bài tập

- **Element:** tên lớp/bài, hạn nộp và số lượng trong vòng tròn đỏ.
- **Hover:** nền đỏ/xanh rất nhạt tùy mức độ; nâng `-1px`; hiện CTA “Chấm bài”.
- **Click:** mở hàng đợi chấm đúng bài tập.
- **Focus:** outline toàn dòng.

### 8.2. Số lượng “12”, “8”, “6”

- **Hover:** tooltip “12 bài nộp đang chờ chấm”.
- **Màu:** đỏ chỉ khi quá hạn hoặc cần xử lý; nếu bình thường dùng cam/xanh lam.
- **Animation:** không pulse liên tục.

### 8.3. Hạn nộp

- **Hover:** tooltip thời gian còn lại.
- **Quá hạn:** label đỏ “Quá hạn X ngày”.
- **Sắp đến hạn:** label cam.

### 8.4. Nút “Xem tất cả bài tập”

- **Hover:** nền xanh đậm hơn nhẹ; mũi tên trượt phải.
- **Click:** mở danh sách bài tập, mặc định lọc “Cần chấm”.

## 9. Card “Nhận xét gần nhất từ học viên”

### 9.1. Nút “Xem tất cả”

- **Hover:** gạch chân hoặc nền xanh nhạt; mũi tên trượt.
- **Click:** mở toàn bộ phản hồi, giữ lớp đang chọn.

### 9.2. Avatar và tên học viên

- **Hover:** avatar có viền xanh, tên đổi xanh.
- **Click:** mở hồ sơ học viên hoặc phản hồi chi tiết.

### 9.3. Đánh giá sao

- **Hover từng sao:** tooltip “5/5”; không cho chỉnh sửa vì đây là đánh giá của học viên.
- **Screen reader:** đọc “Đánh giá 5 trên 5 sao”.

### 9.4. Nội dung nhận xét

- **Hover:** nếu bị cắt, hiện toàn văn trong popover.
- **Click:** mở chi tiết; có thể thêm “Phản hồi học viên” nếu quy trình hỗ trợ.

### 9.5. Carousel controls

- **Nút trái/phải hover:** nền xanh nhạt, icon dịch theo hướng `2px`.
- **Click:** chuyển nhận xét với slide 160 ms.
- **Disabled:** nút mờ tại đầu/cuối nếu không loop.
- **Chấm trang:** hover phóng nhẹ, click chuyển tới trang; chấm active có nhãn cho screen reader.
- **Không tự chạy carousel.**

## 10. Card “Thông báo”

### 10.1. Nút “Xem tất cả”

- **Hover:** nền xanh nhạt hoặc underline.
- **Click:** mở trang thông báo giáo viên.

### 10.2. Mỗi dòng thông báo

- **Hover:** nền xanh rất nhạt, dịch phải `2px`, hiện chevron.
- **Click:** mở drawer chi tiết.
- **Chưa đọc:** nền nhẹ, chữ đậm và chấm “Mới”.
- **Sau khi đọc:** badge cập nhật, dòng trở về nền thường.

### 10.3. “Cập nhật tính năng mới”

- **Hover:** icon calendar/app sáng lên; tooltip thời gian đầy đủ.
- **Click:** mở release note; link bên trong mở tab mới nếu là tài liệu ngoài hệ thống.

### 10.4. “Lớp học bù — A2 Movers”

- **Hover:** hiện CTA “Xem lịch”.
- **Click:** mở chi tiết buổi học bù và nút xác nhận đã xem.
- **Nếu ảnh hưởng lịch:** ưu tiên trên thông báo sản phẩm.

## 11. Card “Pippo AI gợi ý”

### 11.1. Toàn card

- **Mặc định:** gradient tím-hồng, tiêu đề, chủ đề Unit 7, mascot và CTA.
- **Hover:** gradient dịch rất nhẹ; shadow tím; mascot nâng `-2px` một lần.
- **Không animate nền liên tục.**

### 11.2. Nút “Nhận gợi ý ngay”

- **Hover:** nền trắng đậm/viền rõ hơn; mũi tên trượt phải `3px`.
- **Click:** mở drawer gợi ý giáo án cho Unit 7.
- **Loading:** skeleton outline giáo án.
- **Kết quả:** có nút Sao chép, Chỉnh sửa, Lưu vào giáo án; không tự áp dụng.
- **AI disclosure:** ghi rõ đây là nội dung gợi ý và giáo viên cần kiểm tra.

## 12. Trạng thái hệ thống

### 12.1. Loading

- Skeleton theo từng card, không spinner toàn màn hình.
- Khi đổi lớp, giữ header và sidebar; chỉ tải lại vùng dữ liệu liên quan.

### 12.2. Empty

- **Lịch:** “Chưa có lịch dạy sắp tới”.
- **Bài cần chấm:** “Bạn đã chấm hết bài 🎉”.
- **Thông báo:** “Không có thông báo mới”.
- **Nhận xét:** “Chưa có nhận xét từ học viên”.
- Chỉ thêm CTA khi có hành động hợp lý.

### 12.3. Error/offline

- Lỗi hiển thị trong card bị ảnh hưởng, kèm “Thử lại”.
- Giữ dữ liệu gần nhất và ghi thời điểm cập nhật.
- Offline banner ở đầu nội dung, không che thanh tìm kiếm.

### 12.4. Toast

- Dùng cho lưu, sao chép, đánh dấu đã đọc và cập nhật thành công.
- Góc trên phải desktop; không che notification popover.
- Hover tạm dừng tự đóng; có action Hoàn tác khi phù hợp.

## 13. Mobile/tablet

- Sidebar chuyển thành bottom navigation: Dashboard, Lớp, Chấm bài, Thêm.
- KPI card thành carousel ngang có snap; vẫn cho thấy một phần card kế tiếp.
- Các card xếp theo thứ tự: lịch gần nhất → bài cần chấm → tiến độ → thông báo → nhận xét → AI.
- Dropdown lớp đặt sticky dưới top bar.
- Chi tiết lịch, bài tập và AI mở bottom sheet/drawer.
- Không dựa vào hover; element bấm được phải có chevron, button style hoặc pressed state.

