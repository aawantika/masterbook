import { ButtonHTMLAttributes } from 'react';
import { Link, LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'md' | 'sm';

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', className].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

// The one component every real action button in the app should render
// through (Save, Cancel, Delete, Approve, Log out, ...) -- see the .btn
// rules in index.css for why this exists. Defaults to "secondary" (the
// most common look for a plain action button) and "md" size; type="button"
// by default since almost nothing here is a real form submit.
export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

type ButtonLinkProps = LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

// Same look, for navigation that should read as a button (e.g. topbar
// "+ Add recipe") rather than a plain inline text link.
export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
