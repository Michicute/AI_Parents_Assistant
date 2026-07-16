"use client";

import { FormEvent, useState } from "react";
import { FileText, FolderSync, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminSession } from "@/components/admin/AdminSession";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createDocument, DocumentResponse, DocumentType, ingestDocument, ingestDocumentsFolder } from "@/lib/api";

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: "center_policy", label: "Chính sách trung tâm" },
  { value: "parent_handbook", label: "Sổ tay phụ huynh" },
  { value: "faq", label: "FAQ" },
  { value: "course_description", label: "Mô tả khóa học" },
  { value: "announcement", label: "Thông báo" },
];

export default function AdminDocumentsPage() {
  return (
    <AppShell role="admin" title="Tài liệu trung tâm" subtitle="Quản lý tài liệu RAG dùng cho chính sách, FAQ, handbook và mô tả khóa học">
      <AdminSession>{(accessToken) => <DocumentsManager accessToken={accessToken} />}</AdminSession>
    </AppShell>
  );
}

function DocumentsManager({ accessToken }: { accessToken: string }) {
  const [form, setForm] = useState({
    title: "",
    document_type: "center_policy" as DocumentType,
    locale: "vi",
    source_uri: "",
    content: "",
  });
  const [createdDocuments, setCreatedDocuments] = useState<DocumentResponse[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const created = await createDocument(
        {
          title: form.title,
          document_type: form.document_type,
          locale: form.locale,
          source_uri: form.source_uri || undefined,
          content: form.content,
        },
        accessToken,
      );
      setCreatedDocuments((current) => [created, ...current]);
      setForm((current) => ({ ...current, title: "", source_uri: "", content: "" }));
      setStatus("Đã tạo tài liệu. Hãy ingest để tài liệu có thể được tìm kiếm bởi AI.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tạo tài liệu");
    } finally {
      setBusy(false);
    }
  }

  async function handleIngest(documentId: string) {
    setBusy(true);
    setStatus("");
    try {
      const result = await ingestDocument(documentId, accessToken);
      setStatus(`Đã ingest tài liệu: ${result.chunks_created} chunk.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể ingest tài liệu");
    } finally {
      setBusy(false);
    }
  }

  async function handleIngestFolder() {
    setBusy(true);
    setStatus("");
    try {
      const result = await ingestDocumentsFolder(accessToken);
      setStatus(`Đã ingest thư mục: ${result.documents_processed} tài liệu, ${result.chunks_created} chunk.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể ingest thư mục tài liệu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[480px_1fr]">
      <form onSubmit={handleCreate} className="portal-section grid gap-4">
        <SectionHeader icon={FileText} label="RAG documents" title="Thêm tài liệu" />
        <label className="text-sm font-semibold text-ink">
          Tiêu đề
          <input className="portal-input mt-1.5 w-full" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink">
            Loại tài liệu
            <select className="portal-input mt-1.5 w-full" value={form.document_type} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value as DocumentType }))}>
              {documentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Ngôn ngữ
            <select className="portal-input mt-1.5 w-full" value={form.locale} onChange={(event) => setForm((current) => ({ ...current, locale: event.target.value }))}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="text-sm font-semibold text-ink">
          Source URI
          <input className="portal-input mt-1.5 w-full" value={form.source_uri} onChange={(event) => setForm((current) => ({ ...current, source_uri: event.target.value }))} placeholder="optional/path-or-url" />
        </label>
        <label className="text-sm font-semibold text-ink">
          Nội dung
          <textarea className="portal-input mt-1.5 min-h-64 w-full" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} required />
        </label>
        <button className="portal-btn-primary min-h-12" disabled={busy}>
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          {busy ? "Đang lưu..." : "Tạo tài liệu"}
        </button>
        {status ? <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-medium text-ink-muted">{status}</p> : null}
      </form>

      <div className="space-y-5">
        <section className="portal-section">
          <SectionHeader icon={FolderSync} label="Bulk ingest" title="Ingest thư mục rag_documents" />
          <p className="mt-2 text-sm leading-6 text-ink-muted">Đồng bộ toàn bộ file `.md`/`.txt` trong thư mục backend `rag_documents` vào vector search.</p>
          <button type="button" onClick={() => void handleIngestFolder()} className="portal-btn-secondary mt-4 min-h-11" disabled={busy}>
            <FolderSync className="h-4 w-4" aria-hidden="true" />
            {busy ? "Đang ingest..." : "Ingest toàn bộ thư mục"}
          </button>
        </section>

        <section className="portal-section">
          <SectionHeader icon={FileText} label="Mới tạo" title="Tài liệu vừa thêm" />
          {createdDocuments.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-brand-100 bg-white p-6 text-sm text-ink-muted">Chưa có tài liệu nào được tạo trong phiên này.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {createdDocuments.map((document) => (
                <article key={document.id} className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-ink">{document.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">{document.document_type} · {document.locale}</p>
                    </div>
                    <button type="button" onClick={() => void handleIngest(document.id)} className="portal-btn-secondary min-h-10 text-sm" disabled={busy}>Ingest</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
