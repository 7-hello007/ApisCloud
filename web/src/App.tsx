import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { getRoutes } from './runtime/registry';
import { loadPluginFrontends, type LoadResult } from './runtime/plugin-loader';
import { Layout } from './shell/Layout';

function EmptyState({ result }: { result: LoadResult | null }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">🚧</div>
        <div className="text-lg font-medium text-surface-100 mb-2">暂无前端插件</div>
        <div className="text-sm text-surface-300 mb-4">插件加载结果：</div>
        {result ? (
          <div className="text-xs text-left bg-surface-900 border border-surface-800 rounded p-3 font-mono">
            <div>已加载: {result.loaded.join(', ') || '（空）'}</div>
            <div>已跳过: {result.skipped.join(', ') || '（空）'}</div>
            <div>
              加载失败:{' '}
              {result.failed.length === 0
                ? '（无）'
                : result.failed.map((f) => `${f.name}: ${f.error}`).join('; ')}
            </div>
          </div>
        ) : (
          <div className="text-xs text-surface-700">加载中…</div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [routes, setRoutes] = useState(() => getRoutes());

  useEffect(() => {
    const profile = 'core';
    void loadPluginFrontends(profile).then((r) => {
      setResult(r);
      setRoutes(getRoutes());
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div className="h-full flex items-center justify-center text-surface-300">加载中…</div>;
  }

  return (
    <BrowserRouter>
      <Layout>
        {routes.length === 0 ? (
          <EmptyState result={result} />
        ) : (
          <Routes>
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes>
        )}
      </Layout>
    </BrowserRouter>
  );
}
