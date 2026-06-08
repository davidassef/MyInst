import { useEffect, useRef } from 'react';

export interface ContextMenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ open, x, y, actions, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      onClose();
    }

    function handleScroll() {
      onClose();
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/96 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{ left: x, top: y }}
      role="menu"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            if (action.disabled) return;
            action.onSelect();
            onClose();
          }}
          className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
