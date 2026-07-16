---
description: Chay workflow code giao dien tu anh voi live browser, review, doi chieu anh, va tao asset.
agent: ui-image-workflow
---

Hay code hoac tinh chinh giao dien dua tren anh tham chieu va huong dan sau:

$ARGUMENTS

Truoc khi lam:

- Neu input co duong dan anh dang positional path, xem do la `reference`.
- Neu input co duong dan thu muc dang positional path, xem do la `reference-dir` va quet anh + `.md` trong thu muc do.
- Uu tien chap nhan path Windows co quote, vi du `reference="D:/Project/C2-App-129/src/images/login.png"`.
- Chap nhan `reference-dir="D:/Project/C2-App-129/src/images"`, `asset-dir="..."`, va `spec=".../design.md"`.
- Neu co `reference-dir`, phai inventory toan bo thu muc va route-map truoc. Khong duoc bo qua cac anh full-screen con lai chi vi da co 1-2 anh dau tien.
- Kiem tra file anh ton tai truoc khi doc/phan tich. Neu khong ton tai, dung ngay va bao ro duong dan dung gan nhat neu tim thay.
- Voi repo nay, thu muc asset/spec mac dinh la `src/images`; anh login hien co o `src/images/login.png`, khong phai `image/login.png`.

Yeu cau thuc hien:

- Mac dinh tao va sua code trong `src/apps/frontend2`, khong dong vao `src/apps/frontend`.
- Xem `src/apps/frontend2` la giao dien moi doc lap voi `src/apps/frontend`.
- Ngay dau workflow, neu ro model/agent nao dang lam orchestration-review va model/agent nao dang code.
- Xac dinh man hinh can lam truoc.
- Neu co `reference-dir`/`asset-dir`, quet thu muc de lap inventory anh UI, logo/icon/component asset, background/illustration, va file `.md` spec truoc khi code.
- Neu co file `.md` trong thu muc tham chieu, doc no nhu design/copy/spec context truoc khi phan tich anh.
- Neu user cung cap file mo ta router/chuc nang, uu tien doc file do lam nguon su that chinh cho route, page, va pham vi chuc nang.
- Neu spec/router file mo ta nhieu route, phai chia implementation theo dung route structure do, khong duoc rut gon thanh mot man tong hop neu khong duoc yeu cau ro rang.
- Load va ap dung skill UI phu hop truoc khi implement: `frontend-design`, `shadcn`, `accessibility`, va `web-design-guidelines`.
- Khong quet lai toan bo `src/apps/frontend` hoac cau truc frontend cu de tim hieu router, chuc nang, hoac UI tong the.
- Khong tham khao hoac mirror giao dien cu tu `src/apps/frontend` sang `src/apps/frontend2` neu user khong yeu cau ro rang.
- Chi doc them file code cu the trong `src/apps/frontend` khi can cho rang buoc ky thuat truc tiep, khong phai de hoc UI cu.
- Tao route/page can thiet dua tren file router/chuc nang duoc cung cap va anh tham chieu, kem bang map `reference image -> route/page` trong qua trinh lam.
- Chay voi mock data/local fixtures trong `src/apps/frontend2` truoc; khong goi backend server that, khong can auth token/API URL, va khong block UI vi backend chua san sang.
- Phan tich layout roi moi tao component va lap page.
- Dung `ui-live-implementer` de sua code va verify giao dien dang chay.
- Dung `ui-implementation-reviewer` de review ket qua hien tai va tra ve fix cu the.
- Dung `ui-reference-match-planner` de doi chieu UI dang chay voi anh goc va lap gap list uu tien theo do giong.
- Dung `ui-component-asset-generator` khi thieu icon, illustration, background art, mask, hoac shape trang tri lam can tro do chinh xac thi giac.
- Chu dong dung cac skill UI da cai khi phu hop, nhat la visual polish, shadcn, state tuong tac, accessibility, va motion.
- Lap lai theo cac vong fix ngan cho den khi cac mismatch quan trong da duoc xu ly hoac da duoc neu ro. Neu con nhieu man hinh trong `reference-dir`, khong duoc dung som sau khi moi co 1 route/page da gan anh.

Ket qua mong muon:

- file da sua
- xac nhan chi sua trong `src/apps/frontend2`
- thu muc/file tham chieu da doc, gom anh man hinh, asset, va `.md` spec
- xac nhan khong tham khao hoac mirror giao dien cu; neu co doc file trong `src/apps/frontend` thi neu ro ly do ky thuat truc tiep
- mock data/local fixtures da dung va xac nhan khong can backend server
- route/page da verify live va anh tham chieu ung voi tung route
- live page/context nao da duoc tai su dung trong qua trinh lam
- cac fix chinh da hoan thanh
- diem con khac so voi anh tham chieu
- da review button states, skeleton/loading states, va animation hay chua
