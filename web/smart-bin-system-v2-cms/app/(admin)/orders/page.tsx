"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { formatCurrency, formatDateTime, unwrapListPayload } from "@/lib/admin-utils";
import { shopAdminApi } from "@/services/api/shop-admin";
import type { OrderDto } from "@/types/shop";

const statuses = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "CANCELLED"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [message, setMessage] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const load = async () => {
    const response = await shopAdminApi.getOrders({ page: 1, size: 100 });
    setOrders(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      setUpdatingOrderId(id);
      await shopAdminApi.updateOrderStatus(id, status);
      setMessage(`Order ${id} updated to ${status}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <Panel title="Orders" subtitle="Customer orders from checkout in user app">
      <div className="overflow-x-auto">
        <table className="w-full min-w-225 text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Order</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Created</th>
              <th className="py-2">Payment</th>
              <th className="py-2">Total</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-slate-200/70">
                <td className="py-2 font-medium text-foreground">{order.orderCode || order.id}</td>
                <td className="py-2 text-slate-600">{order.userName || order.userId || "-"}</td>
                <td className="py-2 text-slate-600">{formatDateTime(order.createdAt)}</td>
                <td className="py-2 text-slate-600">{order.paymentMethod || "-"} / {order.paymentStatus || "-"}</td>
                <td className="py-2 text-slate-600">{formatCurrency(order.total)}</td>
                <td className="py-2">
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                    value={order.status || "PENDING"}
                    disabled={updatingOrderId === order.id}
                    onChange={(event) => void updateStatus(order.id, event.target.value)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </Panel>
  );
}

