import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { forgotPasswordSchema, validate, type ValidationKey } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { sendPasswordReset } from '@/lib/auth/actions';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Notice, Text, TextField } from '@/ui';

import { AuthFrame } from './AuthFrame';

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<ValidationKey | undefined>();
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const submit = async () => {
    const result = validate(forgotPasswordSchema, { email });
    setFieldError(result.errors.email);
    if (!result.ok) return;
    if (await run(() => sendPasswordReset(result.data.email))) setSent(true);
  };

  return (
    <AuthFrame title={t('auth.resetTitle')}>
      {sent ? (
        <Notice tone="success" message={t('auth.resetSent')} testID="reset-sent" />
      ) : (
        <>
          <Text variant="muted">{t('auth.resetIntro')}</Text>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            error={fieldError && t(`validation.${fieldError}`)}
            testID="reset-email"
          />
          <ErrorNotice error={error} />
          <Button
            label={busy ? t('common.working') : t('auth.sendResetLink')}
            onPress={submit}
            disabled={busy}
            testID="reset-submit"
          />
        </>
      )}
      <Link href="/sign-in">
        <Text className="text-primary">{t('auth.backToSignIn')}</Text>
      </Link>
    </AuthFrame>
  );
}
