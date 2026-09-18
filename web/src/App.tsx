import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { getRoutes } from './runtime/registry';
import { loadPluginFrontends, type LoadResult } from './runtime/plugin-loader';
import { Layout } from './shell/Layout';

function EmptyState({ result }: { result: LoadResult | null }) {
  return (
    <div className="h-full flex items-center justify-center bg-surface-950">
      <div className="text-center max-w-md p-8 rounded-2xl border border-surface-800/80 bg-surface-900/60 shadow-2xl backdrop-blur-xl">
        <div className="text-3xl mb-4 opacity-70">🚧</div>
        <div className="text-lg font-semibold text-surface-100 mb-2">暂无前端插件</div>
        <div className="text-sm text-surface-300 mb-4">插件加载结果：</div>
        {result ? (
          <div className="text-xs text-left bg-surface-950/70 border border-surface-800/80 rounded-lg p-4 font-mono text-surface-400">
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
    return <div className="h-full flex items-center justify-center bg-surface-950 text-surface-400">加载中…</div>;
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
