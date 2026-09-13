import type { PluginFrontend } from '../../runtime/registry';

import { Overview } from './pages/Overview';
import { Vehicles } from './pages/Vehicles';
import { Alerts } from './pages/Alerts';
import { Commands } from './pages/Commands';

const frontend: PluginFrontend = {
  name: 'dashboard',
  navItems: [
    { group: '概览', label: '总览', path: '/', order: 1 },
    { group: '概览', label: '车辆', path: '/vehicles', order: 2 },
    { group: '监控', label: '告警', path: '/alerts', order: 1 },
    { group: '监控', label: '指令', path: '/commands', order: 2 },
  ],
  routes: [
    { path: '/', element: <Overview /> },
    { path: '/vehicles', element: <Vehicles /> },
    { path: '/alerts', element: <Alerts /> },
    { path: '/commands', element: <Commands /> },
  ],
};

export default frontend;
