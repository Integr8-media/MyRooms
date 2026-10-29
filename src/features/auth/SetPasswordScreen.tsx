import { useTranslation } from 'react-i18next';

import { signOut } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Button, Text } from '@/ui';

import { AuthFrame } from './AuthFrame';
import { SetPasswordForm } from './SetPasswordForm';

/** Shown after a password-reset or invitation link, before anything else. */
export function SetPasswordScreen() {
  const { t } = useTranslation();
  const { session, passwordSet } = useAuth();

  return (
    <AuthFrame title={t('auth.setPasswordTitle')}>
      <Text variant="muted">
        {t('auth.setPasswordIntro', { email: session?.user.email ?? '' })}
      </Text>
      <SetPasswordForm onDone={passwordSet} />
      <Button label={t('auth.signOut')} variant="secondary" onPress={() => void signOut()} />
    </AuthFrame>
  );
}
