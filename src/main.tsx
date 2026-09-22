import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import './styles/index.css';
import { App } from './app/App';
import { ThemeProvider } from './features/theme/ThemeProvider';
import { bootstrapTheme } from './features/theme/theme';

// 首屏渲染前同步应用主题，避免浅色用户看到深色闪屏
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);

// 首帧渲染完成后通知 Rust：此时才允许显示窗口，避免 WebView 未就绪时露出白屏。
if ('__TAURI_INTERNALS__' in window) {
  requestAnimationFrame(() => {
    void invoke('frontend_ready').catch(() => undefined);
  });
}
