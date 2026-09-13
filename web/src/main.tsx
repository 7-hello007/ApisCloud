import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ThemeProvider } from './shell/ThemeProvider';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root 元素不存在');
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
