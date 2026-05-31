"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { formatCurrency, toNumber, unwrapListPayload } from "@/lib/admin-utils";
import { shopAdminApi } from "@/services/api/shop-admin";
import ImportProductsPanel from "@/components/products/import-products";
import ImportInventoryPanel from "@/components/products/import-inventory";
import type { ProductDto } from "@/types/shop";

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [form, setForm] = useState({ name: "", price: "", categoryId: "", description: "" });
  const [message, setMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const load = async () => {
    const response = await shopAdminApi.getProducts({ page: 1, size: 100 });
    setProducts(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  const createProduct = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setCreateLoading(true);

    try {
      await shopAdminApi.createProduct({
        name: form.name,
        description: form.description,
        categoryId: form.categoryId || undefined,
        price: form.price || undefined,
        isPublished: true,
      });
      setForm({ name: "", price: "", categoryId: "", description: "" });
      setMessage("Product created");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create product failed");
    } finally {
      setCreateLoading(false);
    }
  };

  const openCreateModal = () => {
    setForm({ name: "", price: "", categoryId: "", description: "" });
    setMessage("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setForm({ name: "", price: "", categoryId: "", description: "" });
  };

  const remove = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await shopAdminApi.deleteProduct(id);
      setMessage("Product deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel
        title="Products"
        subtitle="Maps directly to /shop listing and product detail pages"
        action={
          <button type="button" onClick={openCreateModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white">
            Create product
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-175 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Name</th>
                <th className="py-2">Category</th>
                <th className="py-2">Price</th>
                <th className="py-2">Stock</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{product.name}</td>
                  <td className="py-2 text-slate-600">{product.categoryName || product.categoryId || "-"}</td>
                  <td className="py-2 text-slate-600">{formatCurrency(product.price)}</td>
                  <td className="py-2 text-slate-600">{toNumber(product.quantityAvailable)}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void remove(product.id)}
                      disabled={deleteLoadingId === product.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      {deleteLoadingId === product.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Import Products">
          <ImportProductsPanel onImported={load} />
        </Panel>

        <Panel title="Import Inventory">
          <ImportInventoryPanel onImported={load} />
        </Panel>
      </div>

      {showCreateModal ? (
        <Modal title="Create Product" subtitle="Add a new shop product" onClose={closeCreateModal}>
          <form onSubmit={createProduct} className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Product name"
              value={form.name}
              onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Category ID"
              value={form.categoryId}
              onChange={(event) => setForm((v) => ({ ...v, categoryId: event.target.value }))}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Price"
                value={form.price}
                onChange={(event) => setForm((v) => ({ ...v, price: event.target.value }))}
                required
              />
            </div>
            <textarea
              className="h-36 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))}
            />
            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
                {createLoading ? "Creating..." : "Create product"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeCreateModal}>
                Cancel
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

