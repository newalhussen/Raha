'use client';

import { useRouter } from 'next/navigation';
import { Button, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';

export function PayAction({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={async () => {
        const method = window.prompt('Method: telebirr, cbe, bank, cash, other', 'telebirr');
        if (!method) return;
        try {
          await api(`ops/payments/${id}/paid`, { body: { method } });
          toast.push('Payment recorded.');
          router.refresh();
        } catch (e) {
          toast.push(e instanceof ApiError ? e.message : 'Failed.', true);
        }
      }}
    >
      Mark paid
    </Button>
  );
}
