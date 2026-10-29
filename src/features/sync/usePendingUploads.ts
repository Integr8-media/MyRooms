import { useQuery } from '@powersync/react';

/** Number of local changes not uploaded yet. */
export function usePendingUploads(): number {
  const { data } = useQuery<{ count: number }>('SELECT count(*) AS count FROM ps_crud');
  return data[0]?.count ?? 0;
}
