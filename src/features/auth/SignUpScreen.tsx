import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PASSWORD_MIN_LENGTH, signUpSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { signUp } from '@/lib/auth/actions';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Notice, Text, TextField } from '@/ui';

import { AuthFrame } from './AuthFrame';

type Fields = { fullName: string; email: string; password: string };

export function SignUpScreen() {
  const { t } = useTranslation();
  const [values, setValues] = useState<Fields>({ fullName: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAsyncAction();
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  const submit = async () => {
    const result = validate(signUpSchema, values);
    setFieldErrors(result.errors);
    if (!result.ok) return;
    await run(async () => {
      const { needsConfirmation } = await signUp(result.data);
      // Without email confirmation the user is signed in right away and the app moves on.
      if (needsConfirmation) setSentTo(result.data.email);
    });
  };

  if (sentTo) {
    return (
      <AuthFrame title={t('auth.checkEmailTitle')}>
        <Notice tone="success" message={t('auth.confirmEmailSent', { email: sentTo })} />
        <Link href="/sign-in">
          <Text className="text-primary">{t('auth.backToSignIn')}</Text>
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={t('auth.signUpTitle')}>
      <Text variant="muted">{t('auth.signUpIntro')}</Text>
      <TextField
        label={t('auth.fullName')}
        value={values.fullName}
        onChangeText={set('fullName')}
        autoComplete="name"
        error={fieldErrors.fullName && t(`validation.${fieldErrors.fullName}`)}
        testID="sign-up-name"
      />
      <TextField
        label={t('auth.email')}
        value={values.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={fieldErrors.email && t(`validation.${fieldErrors.email}`)}
        testID="sign-up-email"
      />
      <TextField
        label={t('auth.password')}
        value={values.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        error={
          fieldErrors.password &&
          t(`validation.${fieldErrors.password}`, { count: PASSWORD_MIN_LENGTH })
        }
        testID="sign-up-password"
      />
      <ErrorNotice error={error} />
      <Button
        label={busy ? t('common.working') : t('auth.signUp')}
        onPress={submit}
        disabled={busy}
        testID="sign-up-submit"
      />
      <Link href="/sign-in">
        <Text className="text-primary">{t('auth.haveAccount')}</Text>
      </Link>
    </AuthFrame>
  );
}
