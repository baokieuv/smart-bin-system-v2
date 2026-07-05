"use client";

import { useEffect, useRef, useState } from "react";

import Modal from "@/components/ui/modal";
import LiveStreamPlayer from "./live-stream-player";

import type { TranslationKey } from "@/lib/language";
import type { DeviceDto } from "@/types/device";
import { mediaApi } from "@/services/api/media";


interface DeviceCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: DeviceDto | null;
  t: (key: TranslationKey) => string;
}

export default function DeviceCameraModal({
  isOpen,
  onClose,
  device,
  t,
}: DeviceCameraModalProps) {
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [initError, setInitError] = useState<string | null>(null);
  const [signalingUrl, setSignalingUrl] = useState<string | null>(null);

  const extractSignalingUrl = (data: unknown): string | null => {
    if (typeof data === "string") {
      return data;
    }

    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;

      for (const key of ["signalingUrl", "webrtcSignalingUrl", "url", "endpoint"]) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) {
          return value;
        }
      }
    }

    return null;
  };

  useEffect(() => {
    if (!isOpen || !device) return;

    let cancelled = false;

    setInitError(null);
    setSignalingUrl(null);

    const startStream = async (): Promise<string | null> => {
      try {
        const response = await mediaApi.startStream(device.mac);

        if (!response.success) {
          if (!cancelled) {
            setInitError("Không thể yêu cầu hệ thống bật camera.");
          }
          return null;
        }

        const url = extractSignalingUrl(response.data);

        if (!url) {
          if (!cancelled) {
            setInitError("Server không trả về signaling URL cho WebRTC.");
          }
          return null;
        }

        return url;
      } catch {
        if (!cancelled) {
          setInitError("Lỗi kết nối tới máy chủ streaming.");
        }
        return null;
      }
    };

    const sendHeartbeat = async () => {
      try {
        await mediaApi.sendHeartbeat(device.mac);
      } catch {
        console.log("Heartbeat failed");
      }
    };

    const initialize = async () => {
      const url = await startStream();

      if (!url || cancelled) {
        return;
      }

      setSignalingUrl(url);

      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 5000);
    };

    initialize();

    return () => {
      cancelled = true;

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      void mediaApi.stopStream(device.mac);

    };
  }, [device, isOpen]);

  if (!isOpen || !device) {
    return null;
  }

  return (
    <Modal
      title={`Live Camera: ${device.name}`}
      subtitle={`MAC: ${device.mac}`}
      onClose={onClose}
      widthClassName="w-[min(900px,95vw)]"
    >
      <div className="space-y-4">
        {initError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-600">
            {initError}
          </div>
        ) : signalingUrl ? (
          <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">
            <LiveStreamPlayer
              signalingUrl={signalingUrl}
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-slate-200 bg-black text-sm text-slate-300">
            Đang khởi tạo WebRTC...
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            Luồng WebRTC có độ trễ thấp hơn HLS và được khởi tạo qua signaling
            URL do server trả về.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Đóng Camera
          </button>
        </div>
      </div>
    </Modal>
  );
}