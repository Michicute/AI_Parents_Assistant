---
description: Alias ngan cho workflow code giao dien tu anh tham chieu.
agent: ui-image-workflow
---

Hay chay workflow code giao dien tu anh tham chieu cho input sau:

$ARGUMENTS

Truoc khi lam:
- Neu input co duong dan anh dang positional path, xem do la `reference`.
- Neu input co duong dan thu muc dang positional path, xem do la `reference-dir` va quet anh + `.md` trong thu muc do.
- Uu tien chap nhan path Windows co quote, vi du `reference="D:/Project/C2-App-129/src/images/login.png"`.
- Chap nhan `reference-dir="D:/Project/C2-App-129/src/images"`, `asset-dir="..."`, va `spec=".../design.md"`.
- Neu co `reference-dir`, phai inventory toan bo thu muc va xac dinh anh full-screen nao ung voi route/page nao truoc khi code. Khong duoc chi chon 1-2 anh dau tien theo suy doan.
- Kiem tra file anh ton tai truoc khi doc/phan tich. Neu khong ton tai, dung ngay va bao ro duong dan dung gan nhat neu tim thay.
- Voi repo nay, thu muc asset/spec mac dinh la `src/images`; anh login hien co o `src/images/login.png`, khong phai `image/login.png`.

Mac dinh:
- lam viec trong `src/apps/frontend2`
- khong sua `src/apps/frontend`
- trong `/ui-image`, duoc phep thay doi lon toan bo giao dien trong `src/apps/frontend2` de giong anh nhat: shell/sidebar/header, layout, spacing, color tokens, font, icon, chart/table/card density, mock content, animation/state, va asset UI
- duoc phep them thu vien phuc vu UI neu hop ly, vi du icon library, chart library, helper class/style, animation nhe, hoac font qua `next/font`; sau khi them phai verify `typecheck`/`build`
- bat buoc format code nguon sau cac dot sua UI lon; khong de JSX mot dong dai kho review; khong format `.next`, `node_modules`, build output
- khong chay `next build` trong khi `next dev` cua cung app dang chay vi se cung ghi `.next` va co the lam UI live/dynamic route bi 500. Thu tu an toan: dev screenshot/contact sheet -> stop dev neu can -> build/typecheck -> restart dev -> verify live lai
- khong duoc ket luan "giong anh/excellent" neu moi chi verify route/build. Phai chup live screenshot cung viewport voi reference neu co the, tao/kiem tra contact sheet `reference | live`, roi moi bao mismatch con lai
- neu user noi UI van xau/chua giong, phai uu tien vong visual-match tiep theo bang screenshot/contact sheet, khong tranh luan dua tren DOM/build
- ngay dau workflow, neu ro model/agent nao dang lam orchestration-review va model/agent nao dang code
- quet thu muc `reference-dir`/`asset-dir` truoc, gom anh UI, logo/icon/component asset, va file `.md`
- load/ap dung skill UI phu hop: `frontend-design`, `shadcn`, `accessibility`, `web-design-guidelines`
- neu user cung cap file mo ta router/chuc nang, uu tien doc file do lam nguon su that chinh cho route, page, va pham vi chuc nang
- xem `src/apps/frontend2` la giao dien moi doc lap voi `src/apps/frontend`
- khong quet lai toan bo `src/apps/frontend` hoac cau truc frontend cu de tim hieu router, chuc nang, hoac UI tong the
- khong tham khao hoac mirror giao dien cu tu `src/apps/frontend` sang `src/apps/frontend2` neu user khong yeu cau ro rang
- chi doc them file code cu the khi can cho rang buoc ky thuat truc tiep cua man dang lam, khong phai de hoc UI cu
- xac dinh man hinh can lam va route/page can tao dua tren file router/chuc nang duoc cung cap va anh tham chieu
- neu `reference-dir` co nhieu full-screen reference, phai map `anh -> route/page` truoc, roi moi implement. Khong duoc gop tat ca vao mot route tong hop neu spec/anh the hien nhieu man hinh rieng.
- chay UI voi mock data/local fixtures truoc, khong can server backend
- phan tich layout truoc khi tao component
- implement bang live browser
- review giao dien dang chay
- doi chieu voi tung anh tham chieu tuong ung theo route/page
- tao asset neu can
- neu thieu icon/illustration/chart/avatar/logo/thumbnail lam UI khac anh, phai tao/copy asset an toan vao `src/apps/frontend2/public` hoac dung SVG/CSS/component asset; tranh placeholder ky tu tho nhu `●`, `▣`, `⌕` khi co the thay bang icon/asset dung hon
- khi doi chieu anh, uu tien: shell/sidebar/header ti le dung -> spacing/card/table density -> typography/weight -> mau/border/shadow -> icon/asset/chart fidelity -> state/animation

Bao cao ket qua cuoi cung gom:
- file da sua
- xac nhan chi sua trong `src/apps/frontend2`
- thu muc/file tham chieu da doc, gom anh man hinh, asset, va `.md` spec
- xac nhan khong tham khao hoac mirror giao dien cu, neu dung thi neu ro ly do va file da doc
- mock data/local fixtures da dung va xac nhan khong can backend server
- route/page da verify live, kem anh tham chieu tuong ung cua tung route
- live page/context nao da duoc tai su dung trong qua trinh lam
- cac mismatch con lai
- da kiem tra state, skeleton, va animation hay chua
- da format code hay chua
- thu vien UI/font/icon/chart da them, ly do them, va verify build/typecheck
- live screenshot/contact sheet tam thoi da dung de doi chieu anh neu co
