import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { signInSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { signIn } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Notice, Text, TextField } from '@/ui';

import { AuthFrame } from './AuthFrame';

export function SignInScreen() {
  const { t } = useTranslation();
  const { linkError, clearLinkError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ email: string; password: string }>>(
    {},
  );
  const { busy, error, run } = useAsyncAction();

  const submit = async () => {
    const result = validate(signInSchema, { email, password });
    setFieldErrors(result.errors);
    if (!result.ok) return;
    clearLinkError();
    // On success the auth listener switches the app to the signed-in screens.
    await run(() => signIn(result.data.email, result.data.password));
  };

  return (
    <AuthFrame title={t('auth.signInTitle')}>
      {linkError ? <Notice tone="warning" message={t('auth.linkExpired')} /> : null}
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={fieldErrors.email && t(`validation.${fieldErrors.email}`)}
        testID="sign-in-email"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
        error={fieldErrors.password && t(`validation.${fieldErrors.password}`)}
        testID="sign-in-password"
      />
      <ErrorNotice error={error} />
      <Button
        label={busy ? t('common.working') : t('auth.signIn')}
        onPress={submit}
        disabled={busy}
        testID="sign-in-submit"
      />
      <View className="flex-row flex-wrap justify-between gap-3">
        <Link href="/forgot-password">
          <Text className="text-primary">{t('auth.forgotPassword')}</Text>
        </Link>
        <Link href="/sign-up">
          <Text className="text-primary">{t('auth.noAccount')}</Text>
        </Link>
      </View>
    </AuthFrame>
  );
}
