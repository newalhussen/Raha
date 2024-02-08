'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@raha/ui';
import { api } from '@raha/web-kit/client';

export function HandleButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await api(`broker/inbox/${id}/handled`, { method: 'POST', body: {} });
        router.refresh();
      }}
    >
      Mark handled
    </Button>
  );
}
