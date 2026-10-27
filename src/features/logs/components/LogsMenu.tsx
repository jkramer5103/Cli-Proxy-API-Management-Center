import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { IconCheck, IconMoreHorizontal } from '@/components/ui/icons';
import styles from './LogsMenu.module.scss';

export type LogsMenuItem =
  | {
      kind: 'action';
      id: string;
      label: ReactNode;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      kind: 'toggle';
      id: string;
      label: ReactNode;
      checked: boolean;
      disabled?: boolean;
      onChange: (checked: boolean) => void;
    };

interface LogsMenuProps {
  label: string;
  items: LogsMenuItem[];
  buttonClassName?: string;
}

/** Overflow menu for rarely used log actions. Escape / outside click close it. */
export function LogsMenu({ label, items, buttonClassName }: LogsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    menuRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ??
        []
    );
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    nodes[(index + step + nodes.length) % nodes.length].focus();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-secondary btn-sm ${buttonClassName ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMoreHorizontal size={16} />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) =>
            item.kind === 'toggle' ? (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.checked}
                className={styles.item}
                disabled={item.disabled}
                onClick={() => item.onChange(!item.checked)}
              >
                <span className={styles.check} aria-hidden="true">
                  {item.checked && <IconCheck size={14} />}
                </span>
                {item.label}
              </button>
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.danger ? styles.danger : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                <span className={styles.check} aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
