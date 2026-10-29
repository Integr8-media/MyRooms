import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PASSWORD_MIN_LENGTH,
  setPasswordSchema,
  validate,
  type FieldErrors,
} from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { updatePassword } from '@/lib/auth/actions';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Notice, TextField } from '@/ui';

type Fields = { password: string; confirm: string };

/** New password + confirmation. Used after a reset/invite link and in Account settings. */
export function SetPasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Fields>({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const submit = async () => {
    const result = validate(setPasswordSchema, values);
    setFieldErrors(result.errors);
    if (!result.ok) return;
    setSaved(false);
    if (await run(() => updatePassword(result.data.password))) {
      setValues({ password: '', confirm: '' });
      setSaved(true);
      onDone?.();
    }
  };

  const message = (key: FieldErrors<Fields>['password']) =>
    key && t(`validation.${key}`, { count: PASSWORD_MIN_LENGTH });

  return (
    <>
      <TextField
        label={t('auth.newPassword')}
        value={values.password}
        onChangeText={(password) => setValues((v) => ({ ...v, password }))}
        secureTextEntry
        autoComplete="new-password"
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        error={message(fieldErrors.password)}
        testID="new-password"
      />
      <TextField
        label={t('auth.confirmPassword')}
        value={values.confirm}
        onChangeText={(confirm) => setValues((v) => ({ ...v, confirm }))}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
        error={message(fieldErrors.confirm)}
        testID="confirm-password"
      />
      <ErrorNotice error={error} />
      {saved ? <Notice tone="success" message={t('auth.passwordSaved')} /> : null}
      <Button
        label={busy ? t('common.working') : t('auth.savePassword')}
        onPress={submit}
        disabled={busy}
        className="self-start"
        testID="save-password"
      />
    </>
  );
}
