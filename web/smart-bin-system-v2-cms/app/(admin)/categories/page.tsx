"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { shopAdminApi } from "@/services/api/shop-admin";
// Import panel removed: categories now added one-by-one via form
import type { CategoryDto } from "@/types/shop";

export default function CategoriesPage() {
  const [items, setItems] = useState<CategoryDto[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

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
    try {
      await shopAdminApi.createCategory({ name, description, isActive: true });
      setName("");
      setDescription("");
      setMessage("Category created");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await shopAdminApi.deleteCategory(id);
      setMessage("Category deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Categories" subtitle="Manage product grouping for public shop">
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Name</th>
                <th className="py-2">Slug</th>
                <th className="py-2">Description</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground">{item.name}</td>
                  <td className="py-2 text-slate-600">{item.slug || "-"}</td>
                  <td className="py-2 text-slate-600">{item.description || "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="New Category">
          <form onSubmit={createCategory} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Category name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <textarea
              className="h-28 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
              Create category
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}

