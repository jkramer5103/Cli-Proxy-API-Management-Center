import { useTranslation } from 'react-i18next';
import { PROVIDER_LOGOS } from '../brandLogos';
import type { ProviderBrand, ProviderGroup } from '../types';
import styles from './ProviderCategoryList.module.scss';

interface ProviderCategoryListProps {
  groups: ProviderGroup[];
  activeBrand: ProviderBrand;
  onSelect: (brand: ProviderBrand) => void;
}

export function ProviderCategoryList({ groups, activeBrand, onSelect }: ProviderCategoryListProps) {
  const { t } = useTranslation();

  return (
    <nav className={styles.aside} aria-label={t('providersPage.categories.title')}>
      <div className={styles.list}>
        {groups.map((group) => {
          const active = group.id === activeBrand;
          const total = group.resources.length;
          const logo = PROVIDER_LOGOS[group.id];
          return (
            <button
              key={group.id}
              type="button"
              className={`${styles.item} ${active ? styles.active : ''}`.trim()}
              onClick={() => onSelect(group.id)}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.itemLeft}>
                {logo ? (
                  <img
                    src={logo.darkSrc ?? logo.src}
                    alt=""
                    aria-hidden="true"
                    className={styles.logo}
                  />
                ) : null}
                <span className={styles.itemTitle}>
                  {t(`providersPage.providerNames.${group.id}`)}
                </span>
              </span>
              {total > 0 ? <span className={styles.badge}>{total}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
