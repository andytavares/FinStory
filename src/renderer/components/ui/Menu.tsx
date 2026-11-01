import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { Chip } from './Chip';

/** A trigger that opens a floating panel; closes on outside click and Escape. `children` is a function so a panel can close it. */
export function Menu({
  trigger,
  label,
  kind = 'chip',
  align = 'left',
  onClose,
  children,
}: {
  trigger: React.ReactNode;
  /** The trigger's accessible name; omit to use the trigger text. */
  label?: string;
  kind?: 'chip' | 'button';
  align?: 'left' | 'right';
  onClose?: () => void;
  children: (close: () => void) => React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = (): void => {
    setOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  });

  const toggle = (): void => (open ? close() : setOpen(true));
  const menuProps = { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-label': label } as const;
  return (
    <div ref={root} className="ds-menu-wrap">
      {kind === 'chip' ? (
        <Chip onClick={toggle} {...menuProps}>
          {trigger}
          <ChevronDown aria-hidden className="h-3 w-3" />
        </Chip>
      ) : (
        <Button variant="ghost" size="sm" onClick={toggle} {...menuProps}>
          {trigger}
        </Button>
      )}
      {open && (
        <div role="menu" className={`ds-card ds-menu ds-menu-${align}`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return <Button variant="ghost" size="sm" role="menuitem" className={`!justify-start ${className}`.trim()} {...rest} />;
}
