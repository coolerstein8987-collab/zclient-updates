import { logoDataUrl } from '../lib/logo.js';
import { cx } from '../lib/format.js';

export function Logo({ variant = 'aurora', size = 40, className }) {
  return <img src={logoDataUrl(variant)} width={size} height={size} alt="Zync" className={cx('logo', className)} draggable={false} />;
}

export function Wordmark({ variant, size = 36 }) {
  return (
    <div className="wordmark" style={{ '--wm-size': `${size}px` }}>
      <Logo variant={variant} size={size} />
      <span>Zync</span>
    </div>
  );
}
