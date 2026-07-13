import { useEffect, useState, useCallback, useRef } from 'react';
import { useLuaStore, type ScriptType } from '../../stores/luaStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<ScriptType, string> = {
  providers: 'IP 查询',
  geocoders: '地理编码',
  lib: '公共库',
};

const TYPE_ORDER: ScriptType[] = ['providers', 'geocoders', 'lib'];

export default function LuaModal({ open, onClose }: Props) {
  const {
    scripts, current, content, originalContent,
    loading, message,
    fetchList, openFile, setContent, saveFile, deleteFile, reload, clear,
  } = useLuaStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [creating, setCreating] = useState<{ type: ScriptType; name: string } | null>(null);
  const isDirty = content !== originalContent;

  // 打开时加载列表
  useEffect(() => {
    if (open) fetchList();
    else clear();
  }, [open]);

  // Ctrl+S 保存
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, saveFile]);

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm('有未保存的更改，确定关闭？')) return;
    onClose();
  }, [isDirty, onClose]);

  const handleOpen = useCallback((type: ScriptType, name: string) => {
    if (isDirty && !window.confirm('有未保存的更改，确定切换？')) return;
    openFile(type, name);
  }, [isDirty, openFile]);

  const handleCreate = useCallback(() => {
    if (!creating || !creating.name.trim()) return;
    let name = creating.name.trim();
    if (!name.endsWith('.lua')) name += '.lua';
    // 创建空文件
    openFile(creating.type, name).then(() => {
      // 如果是新文件 (404), 内容会为空，直接写空内容创建
      setContent('-- ' + name + '\n');
    });
    setCreating(null);
    fetchList();
  }, [creating, openFile, setContent, fetchList]);

  const handleDelete = useCallback((type: ScriptType, name: string) => {
    if (!window.confirm(`确定删除 ${type}/${name}？`)) return;
    deleteFile(type, name);
  }, [deleteFile]);

  const handleSaveAndReload = useCallback(async () => {
    if (isDirty) await saveFile();
    await reload();
    fetchList();
  }, [isDirty, saveFile, reload, fetchList]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={handleClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl mx-4
                   h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-200">Lua 脚本管理</h3>
            {message && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                message.includes('失败') ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {message}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAndReload}
              disabled={loading}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                         text-white rounded-md transition-colors"
            >
              保存并重载
            </button>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 主体: 左侧文件列表 + 右侧编辑器 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧文件树 */}
          <div className="w-52 border-r border-gray-800 overflow-y-auto shrink-0">
            {TYPE_ORDER.map((type) => (
              <div key={type}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50">
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                    {TYPE_LABELS[type]}
                  </span>
                  <button
                    onClick={() => setCreating({ type, name: '' })}
                    className="text-gray-600 hover:text-emerald-400 text-sm leading-none"
                    title="新建"
                  >
                    +
                  </button>
                </div>

                {/* 新建输入框 */}
                {creating?.type === type && (
                  <div className="px-2 py-1 flex gap-1">
                    <input
                      autoFocus
                      value={creating.name}
                      onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') setCreating(null);
                      }}
                      placeholder="filename.lua"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5
                                 text-[11px] text-gray-200 outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleCreate}
                      className="text-emerald-400 text-xs hover:text-emerald-300"
                    >
                      ✓
                    </button>
                  </div>
                )}

                {(scripts[type] || []).map((name) => {
                  const isActive = current?.type === type && current?.name === name;
                  const isExample = name.startsWith('_');
                  return (
                    <div
                      key={`${type}/${name}`}
                      className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer
                                  text-[12px] font-mono transition-colors
                                  ${isActive
                                    ? 'bg-blue-600/20 text-blue-400'
                                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'}
                                  ${isExample ? 'opacity-50' : ''}`}
                      onClick={() => handleOpen(type, name)}
                    >
                      <span className="truncate">{name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(type, name); }}
                        className="hidden group-hover:block text-red-500/60 hover:text-red-400 text-[10px] ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 右侧编辑器 */}
          <div className="flex-1 flex flex-col min-w-0">
            {current ? (
              <>
                {/* 文件信息栏 */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50 shrink-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{current.type}/</span>
                    <span className="text-gray-200 font-mono">{current.name}</span>
                    {isDirty && <span className="text-amber-400 text-[10px]">● 未保存</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveFile}
                      disabled={!isDirty || loading}
                      className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500
                                 disabled:opacity-30 text-white rounded transition-colors"
                    >
                      保存 (⌘S)
                    </button>
                  </div>
                </div>

                {/* 代码编辑区 */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-gray-950 text-gray-200 font-mono text-[13px]
                             leading-6 p-4 resize-none outline-none border-none
                             selection:bg-blue-500/30"
                  style={{ tabSize: 2 }}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                ← 选择一个脚本文件
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
