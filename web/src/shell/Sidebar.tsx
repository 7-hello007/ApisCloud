import { NavLink } from 'react-router-dom';

import { getNavGroups } from '../runtime/registry';

export function Sidebar() {
  const groups = getNavGroups();

  return (
    <aside className="w-64 shrink-0 border-r border-surface-800/80 bg-surface-900/65 backdrop-blur-2xl flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-surface-800/80">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-400/20 flex items-center justify-center shadow-[0_0_22px_rgb(56_189_248_/_0.12)]">
          <span className="w-2 h-2 rounded-full bg-brand-400 shadow-[0_0_12px_rgb(56_189_248_/_0.9)]" />
        </div>
        <div className="ml-3 min-w-0">
          <div className="font-semibold text-surface-100 tracking-tight">ApisCloud</div>
          <div className="text-[10px] text-surface-500 tracking-[0.18em] uppercase">Fleet Control</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-5 px-3">
        {groups.length === 0 && <div className="px-3 py-3 text-sm text-surface-500">暂无插件</div>}

        {groups.map((group) => (
          <div key={group.group} className="mb-6">
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-surface-500">
              {group.group}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      [
                        'relative flex items-center px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                        isActive
                          ? 'bg-brand-500/10 text-brand-300 shadow-[inset_0_0_20px_rgb(56_189_248_/_0.035)]'
                          : 'text-surface-400 hover:bg-surface-800/55 hover:text-surface-100',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`mr-3 w-1.5 h-1.5 rounded-full transition-all ${
                            isActive ? 'bg-brand-400 shadow-[0_0_9px_rgb(56_189_248_/_0.9)]' : 'bg-surface-700'
                          }`}
                        />
                        {item.label}
                        {isActive && <span className="absolute right-2 w-1 h-4 rounded-full bg-brand-400/80" />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="h-11 border-t border-surface-800/80 flex items-center justify-between px-5 text-[10px] text-surface-500 font-mono">
        <span>CORE SYSTEM</span>
        <span>v0.1.0</span>
      </div>
    </aside>
  );
}
