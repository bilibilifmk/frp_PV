import { type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

/** 通用模态对话框外壳 */
export default function BaseModal({ open, onClose, title, children, width = 'max-w-lg' }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full ${width} mx-3 sm:mx-4
                     max-h-[92vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  );
}
