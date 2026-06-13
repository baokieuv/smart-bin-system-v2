"use client";

import { FormEvent, useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { unwrapListPayload } from "@/lib/admin-utils";
import { deviceProfilesAdminApi } from "@/services/api/device-profiles-admin";
import type { DeviceProfileDto } from "@/types/device-profile";

export default function DeviceProfilesPage() {
  const [items, setItems] = useState<DeviceProfileDto[]>([]);
  const [form, setForm] = useState({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const load = async () => {
    const response = await deviceProfilesAdminApi.getDeviceProfiles({ page: 1, size: 100 });
    setItems(unwrapListPayload(response.data));
  };

  const resetForm = () => {
    setForm({ code: "", name: "", sharedSpecsJson: "{}", description: "" });
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setMessage("");
    setShowEditorModal(true);
  };

  const openEditModal = (item: DeviceProfileDto) => {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      sharedSpecsJson: JSON.stringify(item.sharedSpecs ?? {}, null, 2),
      description: item.description || "",
    });
    setMessage("");
    setShowEditorModal(true);
  };

  const closeEditorModal = () => {
    setShowEditorModal(false);
    resetForm();
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setSaveLoading(true);

    let parsedSpecs: Record<string, unknown>;
    try {
      parsedSpecs = JSON.parse(form.sharedSpecsJson || "{}");
    } catch {
      setMessage("Dữ liệu JSON của thông số chung không hợp lệ");
      return;
    }

    try {
      if (editingId) {
        await deviceProfilesAdminApi.updateDeviceProfile(editingId, {
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Đã cập nhật mẫu thiết bị");
      } else {
        await deviceProfilesAdminApi.createDeviceProfile({
          code: form.code.trim(),
          name: form.name.trim(),
          sharedSpecs: parsedSpecs,
          description: form.description.trim() || undefined,
        });
        setMessage("Đã tạo mẫu thiết bị");
      }

      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lưu được mẫu thiết bị");
    } finally {
      setSaveLoading(false);
    }
  };

  const removeProfile = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await deviceProfilesAdminApi.deleteDeviceProfile(id);
      setMessage("Đã xóa mẫu thiết bị");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xóa được mẫu thiết bị");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, []);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Mẫu thiết bị" subtitle="Quản lý thông tin chuẩn của thiết bị">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Thông số chung</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 px-3 font-medium text-foreground">{item.code}</td>
                  <td className="py-2 px-3 text-slate-600">{item.name}</td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-h-20 max-w-md overflow-auto whitespace-pre-wrap wrap-break-word">
                      {JSON.stringify(item.sharedSpecs ?? {})}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-600">
                    <div className="max-h-20 max-w-md overflow-auto whitespace-pre-wrap wrap-break-word">{item.description || "-"}</div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditModal(item)} className="rounded-lg bg-slate-100 px-2 py-1 text-sm">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeProfile(item.id)}
                        disabled={deleteLoadingId === item.id}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                      >
                        {deleteLoadingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel
          title="Thao tác với mẫu thiết bị"
          subtitle="Mở hộp thoại để tạo hoặc cập nhật mẫu"
          action={
            <button type="button" onClick={openCreateModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white">
              Tạo mẫu thiết bị
            </button>
          }
        >
          <p className="text-sm text-slate-600">Dùng hộp thoại để chỉnh sửa thông số chung và mô tả dễ hơn.</p>
        </Panel>

        <Panel title="Ghi chú mẫu thiết bị" subtitle="Quản trị viên cấp cao quản lý danh mục, đơn vị chỉ thấy các nhóm được giao">
          <p className="text-sm text-slate-600">
            Mẫu thiết bị do quản trị viên cấp cao quản lý, còn đơn vị sử dụng chỉ làm việc với các nhóm thiết bị đã được giao.
          </p>
        </Panel>
      </div>

      {showEditorModal ? (
        <Modal
          title={editingId ? "Cập nhật mẫu thiết bị" : "Tạo mẫu thiết bị"}
          subtitle="Chỉnh mã, thông số chung và mô tả trong một hộp thoại"
          onClose={closeEditorModal}
        >
          <form onSubmit={saveProfile} className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Mã mẫu (ví dụ: SMART_BIN_PROFILE_60L)"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <label className="block text-sm text-slate-600">Thông số chung (JSON)</label>
            <textarea
              className="h-36 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              placeholder='{"width":20, "height":30, "color":"blue"}'
              value={form.sharedSpecsJson}
              onChange={(event) => setForm((prev) => ({ ...prev, sharedSpecsJson: event.target.value }))}
              required
            />
            <textarea
              className="h-28 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={saveLoading}>
                {saveLoading ? "Đang lưu..." : editingId ? "Cập nhật mẫu thiết bị" : "Tạo mẫu thiết bị"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeEditorModal}>
                Hủy
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {!showEditorModal && message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}