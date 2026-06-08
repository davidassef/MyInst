import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

let liberarMenuNativoNoProximoContexto = false;

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

export function habilitarMenuNativoUmaVez() {
  liberarMenuNativoNoProximoContexto = true;
}

export function deveLiberarMenuNativo() {
  if (!liberarMenuNativoNoProximoContexto) return false;
  liberarMenuNativoNoProximoContexto = false;
  return true;
}

export function ContextMenu({ open, x, y, actions, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });

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

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;

    const viewportPadding = 12;
    const rect = menuRef.current.getBoundingClientRect();
    const limiteX = window.innerWidth - rect.width - viewportPadding;
    const limiteY = window.innerHeight - rect.height - viewportPadding;

    setPosition({
      x: Math.max(viewportPadding, Math.min(x, limiteX)),
      y: Math.max(viewportPadding, Math.min(y, limiteY)),
    });
  }, [open, x, y, actions]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/96 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{ left: position.x, top: position.y }}
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
    </div>,
    document.body,
  );
}
