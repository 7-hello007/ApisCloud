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
          <tr className="border-b border-surface-800 text-surface-400">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`px-3 py-2 font-medium ${alignClass(col.align)}`}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-surface-500"
              >
                加载中…
              </td>
            </tr>
          )}

          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-surface-500"
              >
                {empty ?? '暂无数据'}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                className="border-b border-surface-800/60 hover:bg-surface-800/40 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-surface-200 ${alignClass(col.align)}`}
                  >
                    {col.render ? col.render(row, idx) : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
