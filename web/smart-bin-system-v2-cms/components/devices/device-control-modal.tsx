"use client";

import { FormEvent } from "react";
import Modal from "@/components/ui/modal";
import type { TranslationKey } from "@/lib/language";
import type { DeviceDto } from "@/types/device";
import { RpcMethodOption, getRpcMethodOption, getDefaultRpcParams } from "@/app/(admin)/devices/utils";

interface DeviceControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (event: FormEvent) => void;
  device: DeviceDto | null;
  availableRpcOptions: RpcMethodOption[];
  selectedRpcMethod: string;
  setSelectedRpcMethod: (method: string) => void;
  rpcParamsText: string;
  setRpcParamsText: (text: string) => void;
  rpcMessage: string;
  setRpcMessage: (msg: string) => void;
  rpcLoading: boolean;
  rpcResponseText: string;
  setRpcResponseText: (text: string) => void;
  t: (key: TranslationKey) => string;
}

export default function DeviceControlModal({
  isOpen,
  onClose,
  onExecute,
  device,
  availableRpcOptions,
  selectedRpcMethod,
  setSelectedRpcMethod,
  rpcParamsText,
  setRpcParamsText,
  rpcMessage,
  setRpcMessage,
  rpcLoading,
  rpcResponseText,
  setRpcResponseText,
  t,
}: DeviceControlModalProps) {
  if (!isOpen) return null;

  const handleMethodSelect = (method: string) => {
    setSelectedRpcMethod(method);
    setRpcParamsText(getDefaultRpcParams(method));
    setRpcMessage("");
    setRpcResponseText("");
  };

  const renderRpcButton = (option: RpcMethodOption) => (
    <button
      key={option.method}
      type="button"
      onClick={() => handleMethodSelect(option.method)}
      className={`rounded-xl border px-3 py-2 text-left transition ${
        selectedRpcMethod === option.method ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
      }`}
    >
      <div className="text-sm font-semibold">{option.label}</div>
      <div className="mt-1 text-xs text-slate-500">{option.method}</div>
      <p className="mt-1 text-xs text-slate-600">{option.description}</p>
    </button>
  );

  return (
    <Modal title={t("deviceCommandCenterTitle")} subtitle={t("deviceCommandCenterSubtitle")} onClose={onClose} widthClassName="w-[min(1120px,98vw)]">
      {device ? (
        <form onSubmit={onExecute} className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-foreground">{device.name}</p>
            <p>MAC: {device.mac}</p>
            <p>Device ID: {device.id}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-slate-900">{t("systemActionsLabel")}</h4>
                <p className="text-xs text-slate-500">{t("systemActionsDesc")}</p>
              </div>
              <div className="grid gap-2">{availableRpcOptions.filter((option) => option.type === "ONE_WAY").map(renderRpcButton)}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-slate-900">{t("hardwareControlsLabel")}</h4>
                <p className="text-xs text-slate-500">{t("hardwareControlsDesc")}</p>
              </div>
              <div className="grid gap-2">{availableRpcOptions.filter((option) => option.type === "TWO_WAY").map(renderRpcButton)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-foreground">
              {t("actionSummaryLabel")} {getRpcMethodOption(selectedRpcMethod, t).label}
            </p>
            <p>{getRpcMethodOption(selectedRpcMethod, t).description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={rpcLoading}>
              {rpcLoading ? t("sending") : t("executeCommandBtn")}
            </button>
            <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={onClose}>
              {t("cancel")}
            </button>
            {rpcMessage ? <p className="text-sm text-slate-600">{rpcMessage}</p> : null}
          </div>

          {rpcResponseText ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
              <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t("deviceResponseLabel")}</div>
              <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-6">{rpcResponseText}</pre>
            </div>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-slate-600">{t("selectDeviceToControl")}</p>
      )}
    </Modal>
  );
}