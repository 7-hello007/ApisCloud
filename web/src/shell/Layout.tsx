import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
