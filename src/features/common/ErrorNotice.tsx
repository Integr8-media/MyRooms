import { useTranslation } from 'react-i18next';

import type { ErrorKey } from '@/lib/errors';
import { Notice } from '@/ui';

export function ErrorNotice({ error }: { error: ErrorKey | null | undefined }) {
  const { t } = useTranslation();
  if (!error) return null;
  return <Notice tone="danger" message={t(`errors.${error}`)} testID="error-notice" />;
}
