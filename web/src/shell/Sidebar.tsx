import { NavLink } from 'react-router-dom';

import { getNavGroups } from '../runtime/registry';

export function Sidebar() {
  const groups = getNavGroups();

  return (
    <aside className="w-60 shrink-0 border-r border-surface-800 bg-surface-900 flex flex-col">
      <div className="h-14 flex items-center px-5 border-b border-surface-800">
        <span className="font-semibold text-surface-100 tracking-wide">ApisCloud</span>
        <span className="ml-2 text-xs text-surface-700">蜂云</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {groups.length === 0 && <div className="px-5 py-3 text-sm text-surface-700">暂无插件</div>}

        {groups.map((group) => (
          <div key={group.group} className="mb-4">
            <div className="px-5 mb-1 text-xs uppercase tracking-wider text-surface-700">
              {group.group}
            </div>
            <ul>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      [
                        'block px-5 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-brand-600/10 text-brand-500 border-r-2 border-brand-500'
                          : 'text-surface-200 hover:bg-surface-800 hover:text-surface-50',
                      ].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="h-10 border-t border-surface-800 flex items-center px-5 text-xs text-surface-700">
        v0.1.0
      </div>
    </aside>
  );
}
