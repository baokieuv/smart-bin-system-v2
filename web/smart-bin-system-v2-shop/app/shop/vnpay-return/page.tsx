'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { shopApi } from '@/services/api/shop';
import { Button } from '@/components/ui/button';

function VnPayReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const forward = async () => {
      setStatus('loading');

      const paramsObj: Record<string, string> = {};
      if (!searchParams) {
        setMessage('No parameters found');
        setStatus('error');
        return;
      }

      for (const key of Array.from(searchParams.keys())) {
        const value = searchParams.get(key);
        if (value !== null) paramsObj[key] = value;
      }

      try {
        const res = await shopApi.processVnpayReturn(paramsObj);
        if (res && res.success) {
          setStatus('success');
          setMessage(res.message || 'Thanh toán được xử lý thành công.');

          const txnRef = paramsObj['vnp_TxnRef'] || (res.data && res.data.orderId);
          if (txnRef) {
            setTimeout(() => {
              router.push(`/shop/orders/${txnRef}`);
            }, 1200);
            return;
          }
        } else {
          setStatus('error');
          setMessage(res?.message || 'Xử lý trả về thất bại');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : String(err));
      }
    };

    void forward();
  }, [searchParams, router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-full max-w-xl space-y-4 rounded-lg bg-white/90 p-6 shadow">
        <h2 className="text-lg font-semibold">VNPay - Trả về</h2>
        <p className="text-sm text-slate-600">FE đã nhận các tham số thanh toán và đang chuyển tiếp tới backend để xử lý.</p>

        <div className="mt-4">
          {status === 'loading' && <div className="text-emerald-700">Đang xử lý...</div>}
          {status === 'success' && <div className="text-emerald-700">{message}</div>}
          {status === 'error' && <div className="text-rose-600">{message}</div>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void router.push('/shop')}>Về shop</Button>
          <Button onClick={() => void router.push('/shop/cart')}>Xem giỏ</Button>
        </div>
      </div>
    </div>
  );
}

export default function VnPayReturnPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center">Đang tải...</div>}>
      <VnPayReturnContent />
    </Suspense>
  );
}
