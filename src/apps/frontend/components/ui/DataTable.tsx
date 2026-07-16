import { ReactNode } from "react";

type Column<T> = {
  key: string;
  header: string;
  render: (item: T, index: number) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  keyFn: (item: T) => string;
  emptyMessage?: string;
};

export function DataTable<T>({ columns, data, keyFn, emptyMessage = "Không có dữ liệu" }: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-muted p-8 text-center text-body text-ink-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-100">
      <table className="w-full text-left text-body">
        <thead>
          <tr className="border-b border-brand-100 bg-muted">
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 font-bold text-ink-muted ${col.className || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={keyFn(item)} className="border-b border-brand-100/50 last:border-0 hover:bg-brand-50/40 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                  {col.render(item, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
