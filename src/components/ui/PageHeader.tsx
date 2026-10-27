import type { ReactNode } from 'react';
import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Short status line under the title, e.g. counts. */
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className={styles.root}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
