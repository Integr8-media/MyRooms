import type { BranchRow } from '@/lib/powersync/schema';
import { SwitchRow } from '@/ui';

/** On/off switch per branch. */
export function BranchPicker({
  branches,
  selected,
  onToggle,
  isDisabled,
}: {
  branches: BranchRow[];
  selected: ReadonlySet<string>;
  onToggle: (branchId: string, on: boolean) => void;
  isDisabled?: (branchId: string) => boolean;
}) {
  return (
    <>
      {branches.map((branch) => (
        <SwitchRow
          key={branch.id}
          label={branch.name ?? ''}
          value={selected.has(branch.id)}
          onValueChange={(on) => onToggle(branch.id, on)}
          disabled={isDisabled?.(branch.id)}
          testID={`pick-branch-${branch.id}`}
        />
      ))}
    </>
  );
}
