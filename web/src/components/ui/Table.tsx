import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  title: ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  empty,
  loading = false,
  className,
}: TableProps<T>) {
  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-800/90 text-surface-500">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`px-4 py-3 font-medium text-[11px] uppercase tracking-wider ${alignClass(col.align)}`}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-surface-500">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-surface-600 border-t-brand-500 rounded-full animate-spin" />
                  数据同步中…
                </span>
              </td>
            </tr>
          )}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-surface-500">
                {empty ?? '暂无数据'}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                className="border-b border-surface-800/50 last:border-0 hover:bg-brand-500/[0.035] transition-colors duration-150"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-surface-200 ${alignClass(col.align)}`}
                  >
                    {col.render
                      ? col.render(row, idx)
                      : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
