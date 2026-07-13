import { useState } from 'react';

type Tab = 'mouse' | 'touch';

/* ── 鼠标图标 SVG（简笔）── */
const MouseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="6" />
    <line x1="12" y1="2" x2="12" y2="10" />
  </svg>
);

/* ── 触控手指 SVG ── */
const TouchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a2 2 0 0 1 2 2v6.5a2 2 0 0 1-4 0V3a2 2 0 0 1 2-2z" />
    <path d="M17 10a2 2 0 0 1 4 0v2a8 8 0 0 1-16 0v-2a2 2 0 0 1 4 0" />
    <path d="M8 10a2 2 0 0 1 4 0" />
    <path d="M12 10a2 2 0 0 1 4 0" />
  </svg>
);

/* ── 操作提示条目 ── */
interface HelpEntry {
  label: string;
  color: string;
  icon: React.ReactNode;
  desc: string;
}

/* ── 方向箭头图标组（内联 SVG）── */
const ArrowPan = ({ type }: { type: 'mouse' | 'touch' }) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <g stroke="#4af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {type === 'mouse' ? (
        /* 四向箭头 */
        <>
          <line x1="14" y1="4" x2="14" y2="24" />
          <polyline points="10,8 14,4 18,8" />
          <polyline points="10,20 14,24 18,20" />
          <line x1="4" y1="14" x2="24" y2="14" />
          <polyline points="8,10 4,14 8,18" />
          <polyline points="20,10 24,14 20,18" />
        </>
      ) : (
        /* 单指上下 */
        <>
          <line x1="14" y1="6" x2="14" y2="22" />
          <polyline points="10,10 14,6 18,10" />
          <polyline points="10,18 14,22 18,18" />
        </>
      )}
    </g>
  </svg>
);

const ArrowZoom = ({ type }: { type: 'mouse' | 'touch' }) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <g stroke="#0f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {type === 'mouse' ? (
        /* 上下双箭头 */
        <>
          <line x1="14" y1="4" x2="14" y2="24" />
          <polyline points="10,8 14,4 18,8" />
          <polyline points="10,20 14,24 18,20" />
        </>
      ) : (
        /* 两指捏合 */
        <>
          <line x1="8" y1="8" x2="20" y2="20" />
          <polyline points="8,13 8,8 13,8" />
          <polyline points="20,15 20,20 15,20" />
        </>
      )}
    </g>
  </svg>
);

const ArrowRotate = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <g stroke="#ff0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 8 A8 8 0 1 0 22 14" />
      <polyline points="20,4 20,8 16,8" />
    </g>
  </svg>
);

const ArrowTilt = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <g stroke="#f0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* 两指同方向 */}
      <line x1="10" y1="8" x2="10" y2="20" />
      <polyline points="7,12 10,8 13,12" />
      <line x1="18" y1="8" x2="18" y2="20" />
      <polyline points="15,12 18,8 21,12" />
    </g>
  </svg>
);

/* ── 鼠标操作提示 ── */
const mouseEntries: HelpEntry[] = [
  {
    label: '平移视角',
    color: '#4af',
    icon: <ArrowPan type="mouse" />,
    desc: '左键 + 拖拽',
  },
  {
    label: '缩放视角',
    color: '#0f0',
    icon: <ArrowZoom type="mouse" />,
    desc: '右键 + 拖拽，或鼠标滚轮',
  },
  {
    label: '旋转视角',
    color: '#ff0',
    icon: <ArrowRotate />,
    desc: '中键 + 拖拽，或\nCTRL + 左/右键 + 拖拽',
  },
];

/* ── 触控操作提示 ── */
const touchEntries: HelpEntry[] = [
  {
    label: '平移视角',
    color: '#4af',
    icon: <ArrowPan type="touch" />,
    desc: '单指拖拽',
  },
  {
    label: '缩放视角',
    color: '#0f0',
    icon: <ArrowZoom type="touch" />,
    desc: '双指捏合',
  },
  {
    label: '倾斜视角',
    color: '#f0f',
    icon: <ArrowTilt />,
    desc: '双指同向拖拽',
  },
  {
    label: '旋转视角',
    color: '#ff0',
    icon: <ArrowRotate />,
    desc: '双指反向拖拽',
  },
];

/** 导航帮助按钮 + 弹出面板 */
export default function NavigationHelp() {
  const [open, setOpen] = useState(false);
  // 触屏设备默认显示触控 tab
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const [tab, setTab] = useState<Tab>(isTouchDevice ? 'touch' : 'mouse');

  const entries = tab === 'mouse' ? mouseEntries : touchEntries;

  return (
    <div className="relative">
      {/* ── "?" 按钮 ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="导航帮助"
        className="flex h-8 w-8 items-center justify-center
                   rounded-full bg-black/60 text-white/80 backdrop-blur-sm border border-white/20
                   hover:bg-black/80 hover:text-white transition-colors cursor-pointer select-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 9a3 3 0 1 1 2.83 4c-.57.2-0.83.57-0.83 1v1" />
          <circle cx="12" cy="17" r=".5" fill="currentColor" />
        </svg>
      </button>

      {/* ── 帮助面板 ── */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-lg bg-black/80 backdrop-blur-md
                        border border-white/15 shadow-xl text-sm text-white/90 overflow-hidden select-none">
          {/* Tab 栏 */}
          <div className="flex border-b border-white/10">
            <TabButton active={tab === 'mouse'} onClick={() => setTab('mouse')}>
              <MouseIcon /> <span className="ml-1.5">鼠标</span>
            </TabButton>
            <TabButton active={tab === 'touch'} onClick={() => setTab('touch')}>
              <TouchIcon /> <span className="ml-1.5">触控</span>
            </TabButton>
          </div>

          {/* 条目列表 */}
          <div className="flex flex-col gap-3 p-3">
            {entries.map((e) => (
              <div key={e.label} className="flex items-start gap-2.5">
                <div className="flex-shrink-0 mt-0.5">{e.icon}</div>
                <div className="leading-snug">
                  <div className="font-semibold" style={{ color: e.color }}>{e.label}</div>
                  <div className="text-white/60 text-xs whitespace-pre-line">{e.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab 按钮 ── */
function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium transition-colors cursor-pointer
        ${active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'}`}
    >
      {children}
    </button>
  );
}
