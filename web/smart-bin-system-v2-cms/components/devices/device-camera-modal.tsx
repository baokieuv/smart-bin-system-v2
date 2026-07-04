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

  useEffect(() => {
    if (!isOpen || !device) return;

    let cancelled = false;

    setInitError(null);

    const startStream = async (): Promise<boolean> => {
      try {
        const response = await mediaApi.startStream(device.mac);
        // const response = await fetch(
        //   `${apiUrl}/api/v1/stream/start?deviceId=${device.id}&userId=${userId}`,
        //   {
        //     method: "POST",
        //     headers: {
        //       Authorization: `Bearer ${token}`,
        //     },
        //   }
        // );

        if (!response.success) {
          if (!cancelled) {
            setInitError("Không thể yêu cầu hệ thống bật camera.");
          }
          return false;
        }

        return true;
      } catch {
        if (!cancelled) {
          setInitError("Lỗi kết nối tới máy chủ streaming.");
        }
        return false;
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
      const success = await startStream();

      if (!success || cancelled) {
        return;
      }

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
        ) : (
          <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">
            <LiveStreamPlayer
              deviceMac={device.mac}
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            Luồng HLS có thể trễ từ 3–8 giây do quá trình mã hóa và truyền tải
            video.
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