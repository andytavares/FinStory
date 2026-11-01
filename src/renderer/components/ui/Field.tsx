export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="ds-field">
      {label}
      {children}
    </label>
  );
}

export function TextInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={`ds-input ${className}`.trim()} {...rest} />;
}

export function Select({
  className = '',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={`ds-input ${className}`.trim()} {...rest} />;
}
