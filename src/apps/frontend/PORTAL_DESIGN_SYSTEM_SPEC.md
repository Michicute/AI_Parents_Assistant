# Portal Design System Spec

## 1. Mục tiêu

Thiết kế mới của PTS Portal phải bỏ hoàn toàn hướng visual hiện tại thiên về gradient, glow và hero marketing.

Hướng mới là:

- clean academic portal
- internal management dashboard
- thin borders
- strong information hierarchy
- green-first education brand
- flat layout, minimal decoration

Portal phải tạo cảm giác:

- đáng tin
- có tổ chức
- dễ quét nhanh
- giống hệ thống học thuật / vận hành trung tâm Anh ngữ

Không được tạo cảm giác:

- landing page marketing
- AI showcase
- consumer chat app
- dashboard quá mềm / quá bóng / quá nhiều gradient

---

## 2. Visual Principles

### 2.1 Overall tone

- Nền rất sáng, hơi ấm nhẹ.
- Card trắng, viền mảnh, bóng nhẹ.
- Tất cả khoảng cách theo lưới đều và kỷ luật.
- Typography đậm, rõ, lớn ở heading.
- Accent xanh lá dùng có chủ đích cho trạng thái, CTA và metric quan trọng.

### 2.2 Composition rules

- Sidebar trái cố định.
- Topbar ngang mỏng ở trên.
- Nội dung chính theo layout dashboard: heading -> cards -> tables / detail panels.
- Không dùng khối hero kiểu banner lớn tràn cảm xúc.
- Không dùng nhiều khối chồng cao thấp thiếu kiểm soát.

### 2.3 Shape language

- Radius vừa, không bubble.
- Card lớn: 20px.
- Input / button: 14px.
- Badge / pill: full rounded.
- Border là yếu tố chính tạo phân lớp, không dựa vào shadow nặng.

---

## 3. Design Tokens

### 3.1 Colors

#### Base neutrals

- `canvas`: `#f7f8f4`
- `canvas-alt`: `#f3f5ef`
- `surface`: `#ffffff`
- `surface-muted`: `#f6f8f3`
- `surface-soft`: `#eef4ec`
- `border`: `#d9e2d3`
- `border-strong`: `#c7d3c0`

#### Text

- `ink`: `#162113`
- `ink-soft`: `#33412d`
- `ink-muted`: `#64725f`
- `ink-faint`: `#8a9585`

#### Brand greens

- `brand-700`: `#0f5f22`
- `brand-600`: `#157a2c`
- `brand-500`: `#1f8f35`
- `brand-100`: `#e8f4e7`
- `brand-50`: `#f3faf2`

#### Support colors

- `success-bg`: `#e9f8e7`
- `success-text`: `#1b7d2f`
- `warning-bg`: `#fff2cf`
- `warning-text`: `#8d6a00`
- `danger-bg`: `#fbe5e3`
- `danger-text`: `#b3473a`

### 3.2 Typography

Preferred UI font:

- `Inter`, fallback `Plus Jakarta Sans`, `system-ui`, `sans-serif`

Type scale:

- `display-lg`: 52 / 1.04 / 800
- `heading-1`: 44 / 1.08 / 800
- `heading-2`: 32 / 1.14 / 800
- `heading-3`: 24 / 1.2 / 700
- `title`: 18 / 1.35 / 700
- `body-lg`: 18 / 1.65 / 400
- `body`: 16 / 1.65 / 400
- `caption`: 13 / 1.5 / 500
- `meta`: 11 / 1.4 / 700 uppercase

### 3.3 Spacing

Core spacing system:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48
- 64

Rules:

- Sidebar padding x: 20
- Main padding desktop: 32
- Main padding tablet: 24
- Card internal padding: 24
- Small card internal padding: 20
- Gap giữa sections: 24
- Gap giữa cards trong grid: 20

### 3.4 Radius

- `radius-card-lg`: 20px
- `radius-card-md`: 16px
- `radius-control`: 14px
- `radius-pill`: 999px

### 3.5 Shadow

- `shadow-soft`: `0 2px 10px rgba(16,24,16,0.04)`
- `shadow-panel`: `0 4px 16px rgba(16,24,16,0.05)`
- Không dùng glow hoặc blur shadow mạnh cho portal layer.

---

## 4. Layout Spec

### 4.1 Sidebar

- Width desktop: 270px.
- Nền trắng.
- Có border phải mảnh.
- Logo nằm góc trên trái.
- Có brand subtitle / role context bên dưới logo.
- Nav item là hàng ngang đơn giản, icon trái, label phải.
- Active item: nền xám rất nhạt + border trái / phải accent xanh.
- Không có card promo tối lớn trong sidebar mặc định.

### 4.2 Topbar

- Cao 68px.
- Nền trắng.
- Border bottom mảnh.
- Trái: ô search portal.
- Phải: bell, settings/profile, sign out tùy role.
- Search là thành phần khung portal, không cần có tính năng ngay ở Phase 1.

### 4.3 Main content

- Content phải bám cùng một lề chuẩn.
- Không có hero tràn full width kiểu landing.
- Mỗi page có:
  - page title
  - short subtitle
  - top metadata / active term / date nếu cần
  - body sections theo dashboard grid

---

## 5. Component Spec

### 5.1 Sidebar nav item

Structure:

- icon container 40x40
- label
- optional description nhỏ

States:

- default: white / transparent
- hover: very soft green tint
- active: left accent line hoặc outlined emphasis

### 5.2 Card

Variants:

- standard white card
- feature green card
- muted info card
- metric card

Shared rules:

- border mảnh
- shadow nhẹ
- radius 20px
- header and body spacing rõ

### 5.3 Metric card

Pattern theo ảnh mẫu:

- icon block trái
- eyebrow label uppercase
- value lớn
- short descriptor / delta line

### 5.4 Buttons

#### Primary
- xanh lá solid
- text trắng
- không quá bo tròn

#### Secondary
- trắng
- border xanh / border neutral
- text đậm

#### Ghost
- không nền
- hover fill nhẹ

### 5.5 Inputs

- trắng
- viền mảnh
- chiều cao 52px
- icon trái nếu cần
- focus ring nhẹ màu xanh

### 5.6 Table

- header row có nền xám rất nhạt
- border row mảnh
- cell padding rộng
- action cell gọn

### 5.7 Badge / Status pill

- dùng background nhạt + text đậm
- success, warning, danger, neutral

### 5.8 Progress bars

- track xám nhạt
- fill xanh
- warning fill vàng

---

## 6. Page-level Adaptation

### 6.1 Login

Theo reference image 2:

- bố cục 2 cột
- trái là form card sạch
- phải là visual panel / image / brand statement
- role switch ngang ở đầu form
- email / password / remember me / forgot password / primary CTA

### 6.2 Parent dashboard

Phải chuyển thành dashboard thật:

- welcome heading
- summary row
- academic overview card
- assistant insight card
- performance / trend panel
- feedback / resources / contact panels

### 6.3 Parent student detail

- student academic profile
- skill trend / assessment summary
- attendance / assignments / teacher feedback
- support resources

### 6.4 Parent assistant

- support workspace card
- không giống messenger app full screen
- right rail cho prompt suggestions / student context / AI safety

### 6.5 Teacher/Admin/Student

- dùng cùng shell
- chỉ thay information hierarchy theo role
- không mỗi role một visual style riêng

---

## 7. Interaction & States

### Loading

- skeleton mảnh, nhịp rõ
- không pulse quá mạnh

### Empty

- một card trắng với title + explanation + CTA

### Error

- card nhạt đỏ, text rõ
- chỉ 1 action recovery nếu có

### Hover

- subtle border tint hoặc background tint
- không translate / float quá nhiều ở portal pages

### Focus

- ring xanh nhẹ
- không dày / không chói

---

## 8. Content Style

Microcopy rules:

- rõ, ngắn, trực tiếp
- ưu tiên ngôn ngữ hành động
- không dùng giọng điệu quá quảng cáo
- không nhấn mạnh AI quá mức
- dùng ngôn ngữ phù hợp phụ huynh / giáo viên / quản trị

Ví dụ:

- Tốt: `Học viên được liên kết`
- Tốt: `Theo dõi tiến độ học tập`
- Không nên: `Bảng điều phối học tập thông minh đột phá`

---

## 9. What must be removed

Các yếu tố phải loại bỏ khỏi implementation mới:

- large gradient hero blocks
- glowing AI cards
- random oversized decorative blur circles
- mixed spacing rhythm
- inconsistent sidebar widths
- promo card tone inside operational shell
- dropdown native browser styling

---

## 10. Phase 1 Scope

Phase 1 chỉ reset nền tảng và shell, không đổi logic:

- `tailwind.config.ts`
- `app/globals.css`
- `components/AppShell.tsx`
- `components/BrandMark.tsx`

Must preserve:

- auth check
- role redirect
- logout
- mobile menu
- nav routes
- existing page children rendering
- existing backend/API assumptions

---

## 11. Phase 1 Acceptance Criteria

- Sidebar giống portal ảnh mẫu hơn hiện tại.
- Topbar sạch, mỏng, có ô search visual.
- Background app đổi sang canvas sáng phẳng.
- Card nền và utility class mới nhất quán.
- Không còn gradient-heavy shell.
- Không vỡ typecheck.

---

## 12. Implementation Notes

- Ưu tiên reset token trước khi sửa page riêng lẻ.
- Không vá thêm vào visual language cũ.
- Sau Phase 1, mới tiếp tục sang login và parent dashboard.
