# UI Image Workflow Agents

This project now includes a custom UI-from-image workflow for opencode under `.opencode/`.

Included agents:

- `ui-image-workflow`: primary orchestrator
- `ui-live-implementer`: edits code and verifies the page live with `chrome-devtools-mcp`
- `ui-implementation-reviewer`: reviews the live UI and returns feedback only
- `ui-reference-match-planner`: compares the live page to the reference image
- `ui-component-asset-generator`: creates SVG/CSS/spec assets needed to match the design

Quick usage:

1. Restart opencode after these files are added.
2. Invoke `/ui-from-image` hoac alias ngan `/ui-image`.
3. Pass the image path, target route, and any notes such as desktop/mobile priority.

Example:

```text
/ui-from-image D:\reference\home.png route=/dashboard ưu tiên desktop trước, giữ nguyên shadcn, thêm skeleton và hover state giống ảnh
```

```text
/ui-image D:\reference\home.png route=/dashboard focus=desktop stop-when=excellent
```

Windows path note:

```text
/ui-image reference="D:/Project/C2-App-129/src/images/login.png" route=/login focus=desktop stop-when=excellent
```

Folder input with UI screenshots, component assets, logos, and Markdown specs:

```text
/ui-image reference-dir="D:/Project/C2-App-129/src/images" route=/login focus=desktop stop-when=excellent
```

In this repo, `src/images` is the default asset/spec folder and `src/images/login.png` exists. `image/login.png` does not exist.

Notes:

- The workflow is designed to use installed skills like `frontend-design`, `shadcn`, `accessibility`, and `web-design-guidelines` when needed.
- The workflow accepts `reference=<image>`, `reference-dir=<folder>`, `asset-dir=<folder>`, and `spec=<markdown-file>`. When a folder is provided, it inventories screenshots, logos/icons/component assets, and `.md` specs before implementation.
- `/ui-image` and `/ui-from-image` now default to mock data/local fixtures in `src/apps/frontend2` first, so the UI can be implemented and verified before the backend server is wired in.
- `ui-live-implementer` is the agent intended to keep the browser open and continuously verify the UI while editing.
- `ui-component-asset-generator` prefers SVG and CSS assets first so the result stays editable in-repo.
