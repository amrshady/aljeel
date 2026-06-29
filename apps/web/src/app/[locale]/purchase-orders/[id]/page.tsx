'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { getPurchaseOrder } from '@/lib/purchase-orders-api';
import { Link } from '@/i18n/routing';

function PurchaseOrderDetailContent() {
  const t = useTranslations('purchaseOrders');
  const params = useParams<{ id: string }>();

  const { data: po, isLoading, isError } = useQuery({
    queryKey: ['purchase-orders', params.id],
    queryFn: () => getPurchaseOrder(params.id),
  });

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground">{t('loading')}</p>
      </AppShell>
    );
  }

  if (isError || !po) {
    return (
      <AppShell>
        <p className="text-destructive">{t('notFound')}</p>
        <Link href="/purchase-orders" className="mt-4 inline-block text-primary underline">
          {t('back')}
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link href="/purchase-orders" className="text-sm text-primary underline">
        {t('back')}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{po.poNumber}</h1>
      <p className="text-sm text-muted-foreground">
        {po.status} · {po.currency}
        {po.erpPoId ? ` · ERP ${po.erpPoId}` : ''}
      </p>

      <div className="mt-8 rounded-xl border bg-card">
        <h2 className="border-b p-4 font-semibold">{t('linesTitle')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start text-muted-foreground">
              <th className="p-3 font-medium">{t('description')}</th>
              <th className="p-3 font-medium">{t('qty')}</th>
              <th className="p-3 font-medium">{t('unitPrice')}</th>
              <th className="p-3 font-medium">{t('vat')}</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="p-3">{line.description}</td>
                <td className="p-3">{line.qty}</td>
                <td className="p-3">{line.unitPrice}</td>
                <td className="p-3">{line.vatRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <h2 className="border-b p-4 font-semibold">{t('receiptsTitle')}</h2>
        {po.receipts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('noReceipts')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="p-3 font-medium">{t('receivedQty')}</th>
                <th className="p-3 font-medium">{t('receivedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {po.receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b last:border-0">
                  <td className="p-3">{receipt.receivedQty}</td>
                  <td className="p-3">{new Date(receipt.receivedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

export default function PurchaseOrderDetailPage() {
  return (
    <RequireAuth>
      <PurchaseOrderDetailContent />
    </RequireAuth>
  );
}
