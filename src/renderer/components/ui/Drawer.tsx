import { Card, type CardProps } from './Card';

/** Side panel that sits in a grid column next to a list. It is not a modal. */
export function Drawer({ className = '', ...rest }: CardProps): React.JSX.Element {
  return <Card className={`ds-drawer ${className}`.trim()} {...rest} />;
}
