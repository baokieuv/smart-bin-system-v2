"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { unwrapListPayload } from "@/lib/admin-utils";
import { shopAdminApi } from "@/services/api/shop-admin";
// Import panel removed: categories now added one-by-one via form
import type { CategoryDto } from "@/types/shop";

export default function CategoriesPage() {
  const [items, setItems] = useState<CategoryDto[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const load = async () => {
    const response = await shopAdminApi.getCategories();
    setItems(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setCreateLoading(true);
    try {
      await shopAdminApi.createCategory({ name, description, isActive: true });
      setName("");
      setDescription("");
      setMessage("Đã tạo danh mục");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được danh mục");
    } finally {
      setCreateLoading(false);
    }
  };

  const openCreateCategory = () => {
    setName("");
    setDescription("");
    setMessage("");
    setShowCreateModal(true);
  };

  const closeCreateCategory = () => {
    setShowCreateModal(false);
    setName("");
    setDescription("");
  };

  const remove = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await shopAdminApi.deleteCategory(id);
      setMessage("Đã xóa danh mục");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xóa được danh mục");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Danh mục" subtitle="Quản lý nhóm sản phẩm cho cửa hàng">
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Mã thân thiện</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 px-3 font-medium text-foreground">{item.name}</td>
                  <td className="py-2 px-3 text-slate-600">{item.slug || "-"}</td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-w-md max-h-20 overflow-auto whitespace-pre-wrap wrap-break-word">{item.description || "-"}</div>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      disabled={deleteLoadingId === item.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      {deleteLoadingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel
          title="Thao tác với danh mục"
          subtitle="Mở hộp thoại để tạo danh mục mới"
          action={
            <button
              type="button"
              onClick={openCreateCategory}
              className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white"
            >
              Tạo danh mục
            </button>
          }
        >
          <p className="text-sm text-slate-600">Dùng hộp thoại để thêm danh mục cho dễ nhập và dễ chỉnh sửa.</p>
        </Panel>
      </div>

      {showCreateModal ? (
        <Modal title="Tạo danh mục" subtitle="Thêm một nhóm sản phẩm mới" onClose={closeCreateCategory}>
          <form onSubmit={createCategory} className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Tên danh mục"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <textarea
              className="h-40 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Mô tả"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
                {createLoading ? "Đang tạo..." : "Tạo danh mục"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeCreateCategory}>
                Hủy
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

