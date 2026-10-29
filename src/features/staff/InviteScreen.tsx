import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { invitableRoles, needsBranches, type Role } from '@/domain/permissions';
import { inviteSchema, validate, type ValidationKey } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  TextField,
} from '@/ui';

import { inviteMember } from './api';
import { BranchPicker } from './BranchPicker';

export function InviteScreen() {
  const { t } = useTranslation();
  const { org, role: myRole, branches } = useWorkspace();
  const roles = invitableRoles(myRole);
  const activeBranches = branches.filter((b) => b.is_active);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(
    roles.includes('cashier') ? 'cashier' : (roles[0] ?? 'cashier'),
  );
  // Preselect the only branch when there is just one.
  const [branchIds, setBranchIds] = useState<Set<string>>(
    () => new Set(activeBranches.length === 1 ? [activeBranches[0]!.id] : []),
  );
  const [emailError, setEmailError] = useState<ValidationKey | undefined>();
  const [branchError, setBranchError] = useState(false);
  const [result, setResult] = useState<{ email: string; emailSent: boolean } | null>(null);
  const { busy, error, run } = useAsyncAction();

  const toggle = (id: string, on: boolean) =>
    setBranchIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    const parsed = validate(inviteSchema, { email });
    setEmailError(parsed.errors.email);
    const missingBranches = needsBranches(role) && branchIds.size === 0;
    setBranchError(missingBranches);
    if (!parsed.ok || missingBranches || !org) return;
    setResult(null);
    await run(async () => {
      const { emailSent } = await inviteMember({
        orgId: org.id,
        email: parsed.data.email,
        role,
        branchIds: needsBranches(role) ? [...branchIds] : [],
      });
      setResult({ email: parsed.data.email, emailSent });
      setEmail('');
    });
  };

  return (
    <Screen>
      <ScreenHeader title={t('staff.inviteTitle')} />
      <Card className="gap-4">
        <Text variant="muted">{t('staff.inviteIntro')}</Text>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          inputMode="email"
          error={emailError && t(`validation.${emailError}`)}
          testID="invite-email"
        />
        <Text className="text-sm font-medium">{t('staff.role')}</Text>
        <SegmentedControl<Role>
          value={role}
          onChange={setRole}
          options={roles.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
        />
        <Text variant="muted">{t(`roleDescriptions.${role}`)}</Text>

        {needsBranches(role) ? (
          <>
            <Text className="text-sm font-medium">{t('staff.branches')}</Text>
            <BranchPicker branches={activeBranches} selected={branchIds} onToggle={toggle} />
            {branchError ? <Notice tone="danger" message={t('errors.branches_required')} /> : null}
          </>
        ) : null}

        <ErrorNotice error={error} />
        {result ? (
          <Notice
            tone="success"
            testID="invite-result"
            message={
              result.emailSent
                ? t('staff.inviteSent', { email: result.email })
                : t('staff.inviteSaved', { email: result.email })
            }
          />
        ) : null}
        <Button
          label={busy ? t('common.working') : t('staff.sendInvite')}
          onPress={submit}
          disabled={busy}
          className="self-start"
          testID="invite-submit"
        />
        <Text variant="muted">{t('staff.inviteNeedsInternet')}</Text>
      </Card>
    </Screen>
  );
}
