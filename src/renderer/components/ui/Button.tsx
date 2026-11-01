export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'sm';
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export function Button({
  variant = 'default',
  size = 'md',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = ['btn', VARIANT_CLASS[variant], size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
