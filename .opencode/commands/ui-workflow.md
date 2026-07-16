---
description: Chay workflow tu dong audit -> plan -> fix -> re-audit cho den khi UI dat danh gia cao.
agent: ui-workflow-orchestrator
---

Hay chay workflow cai tien giao dien tu dong cho yeu cau sau:

$ARGUMENTS

Option co the dung:
- `max-loops=<number>`
- `stop-when=<good|high|excellent>`
- `focus=<mobile|desktop|both>`
- `scope=<page|flow|component>`
- `preserve=<text>`
- `allow-redesign=<true|false>`
- `route=<path>`
- `reference=<path>`
- `reference-dir=<path>`
- `asset-dir=<path>`
- `spec=<path>`

Yeu cau thuc hien:
- Neu co `reference=<path>` hoac user muon code giao dien tu anh, dung workflow live browser voi implementer, reviewer, va reference matcher.
- Neu co `reference-dir=<path>` hoac user dua positional folder path, phai inventory thu muc, doc `.md` specs, va map anh full-screen -> route/page truoc khi implement.
- Neu spec mo ta nhieu route/man hinh, khong duoc don thanh mot route tong hop tru khi user noi ro chi can mot man.
- Neu khong co reference image, co the bat dau bang audit giao dien.
- Lap ke hoach cai tien dua tren ket qua audit neu workflow tong quat phu hop.
- Implement cac thay doi uu tien cao.
- Re-audit sau moi lan sua.
- Lap lai cho den khi UI duoc danh gia cao, khong con van de nghiem trong, hoac dat dieu kien dung an toan.
- Mac dinh khong vuot qua 3 vong fix neu khong co `max-loops`.
- Bao cao ro tung vong va tong ket ket qua cuoi cung, kem route/page da verify va anh tham chieu tuong ung.
