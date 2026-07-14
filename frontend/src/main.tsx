import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

async function bootstrap() {
  // Cesium 会把 Canvas 字形缓存到纹理；先加载字体，避免地图标签使用回退字体。
  try {
    await document.fonts?.load('500 14px "Smiley Sans Web"');
  } catch {
    // 字体加载异常时仍允许使用系统回退字体启动页面。
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
