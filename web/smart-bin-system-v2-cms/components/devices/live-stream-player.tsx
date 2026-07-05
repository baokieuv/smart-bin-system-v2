"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

interface LiveStreamPlayerProps {
  signalingUrl: string;
}

const SIGNALING_REQUEST_TIMEOUT_MS = 10000;
const SIGNALING_RETRY_DELAY_MS = 1500;

type SignalingResponse = {
  type?: RTCSdpType;
  sdp?: string;
  answer?: string;
  data?: unknown;
  message?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractSdpAnswer = (payload: unknown): RTCSessionDescriptionInit | null => {
  if (typeof payload === "string") {
    return { type: "answer", sdp: payload };
  }

  if (!isRecord(payload)) {
    return null;
  }

  const nestedPayload = payload.data;
  if (typeof nestedPayload === "string") {
    return { type: "answer", sdp: nestedPayload };
  }

  if (isRecord(nestedPayload)) {
    const nestedSdp = nestedPayload.sdp;
    const nestedAnswer = nestedPayload.answer;
    const nestedType = nestedPayload.type;

    if (typeof nestedSdp === "string") {
      return {
        type: typeof nestedType === "string" ? (nestedType as RTCSdpType) : "answer",
        sdp: nestedSdp,
      };
    }

    if (typeof nestedAnswer === "string") {
      return { type: "answer", sdp: nestedAnswer };
    }
  }

  const sdp = payload.sdp;
  const answer = payload.answer;
  const type = payload.type;

  if (typeof sdp === "string") {
    return {
      type: typeof type === "string" ? (type as RTCSdpType) : "answer",
      sdp,
    };
  }

  if (typeof answer === "string") {
    return { type: "answer", sdp: answer };
  }

  return null;
};

export default function LiveStreamPlayer({
  signalingUrl,
}: LiveStreamPlayerProps) {
  const { t } = useLanguage();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;

    if (!video) return;

    const getAccessToken = () =>
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const cleanupVideoSource = () => {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
    };

    const cleanupPeerConnection = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };

    const delay = (durationMs: number) =>
      new Promise<void>((resolve) => {
        reconnectTimeoutRef.current = setTimeout(resolve, durationMs);
      });

    const parseSignalingPayload = async (response: Response): Promise<RTCSessionDescriptionInit> => {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as SignalingResponse | unknown;
        const answer = extractSdpAnswer(payload);

        if (answer) {
          return answer;
        }

        throw new Error("Signaling response did not include SDP answer.");
      }

      const text = await response.text();
      const trimmed = text.trim();

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const answer = extractSdpAnswer(parsed);

        if (answer) {
          return answer;
        }
      } catch {
        // fall through to plain SDP handling
      }

      if (trimmed.startsWith("v=")) {
        return { type: "answer", sdp: text };
      }

      throw new Error("Unsupported signaling response format.");
    };

    const connectWebRtc = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      setError(null);
      setIsBuffering(true);

      cleanupVideoSource();
      cleanupPeerConnection();

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });

      peerConnectionRef.current = peerConnection;
      localStreamRef.current = new MediaStream();
      video.srcObject = localStreamRef.current;

      peerConnection.ontrack = (event) => {
        if (cancelled || !localStreamRef.current) {
          return;
        }

        event.streams[0]?.getTracks().forEach((track) => {
          if (!localStreamRef.current) {
            return;
          }

          const existingTrack = localStreamRef.current.getTracks().find((item) => item.id === track.id);
          if (!existingTrack) {
            localStreamRef.current.addTrack(track);
          }
        });

        setIsBuffering(false);
        void video.play().catch(() => {
          console.log("Autoplay was blocked");
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (cancelled) {
          return;
        }

        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
          cleanupPeerConnection();
          void delay(SIGNALING_RETRY_DELAY_MS).then(connectWebRtc);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (cancelled) {
          return;
        }

        if (peerConnection.iceConnectionState === "failed" || peerConnection.iceConnectionState === "disconnected") {
          cleanupPeerConnection();
          void delay(SIGNALING_RETRY_DELAY_MS).then(connectWebRtc);
        }
      };

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      // peerConnection.addTransceiver("audio", { direction: "recvonly" });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (!peerConnection.localDescription) {
        throw new Error("Failed to create local WebRTC offer.");
      }

      const accessToken = getAccessToken();
      const response = await fetch(signalingUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/sdp",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: peerConnection.localDescription.sdp,
        signal: AbortSignal.timeout(SIGNALING_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 404 && !cancelled) {
          console.log("Camera chưa lên luồng, đang thử lại...");
          // Đợi 1.5s (dùng hằng số SIGNALING_RETRY_DELAY_MS đã có sẵn)
          await delay(SIGNALING_RETRY_DELAY_MS);
          // Gọi lại chính hàm này để thực hiện quy trình SDP Offer mới
          return connectWebRtc(); 
        }
        
        throw new Error(`Signaling request failed: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Signaling request failed: ${response.status}`);
      }

      const answer = await parseSignalingPayload(response);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      if (!cancelled) {
        setIsBuffering(false);
        void video.play().catch(() => {
          console.log("Autoplay was blocked");
        });
      }
    };

    const initialize = () => {
      if (!signalingUrl) {
        setError("Thiếu signaling URL để khởi tạo WebRTC.");
        setIsBuffering(false);
        return;
      }

      setError(null);
      setIsBuffering(true);

      void connectWebRtc().catch((streamError) => {
        console.error("WebRTC stream failed:", streamError);
        if (!cancelled) {
          setError("Không thể kết nối WebRTC stream.");
          setIsBuffering(false);
        }
      });
    };

    initialize();

    return () => {
      cancelled = true;

      cleanupPeerConnection();
      cleanupVideoSource();
    };
  }, [signalingUrl]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      {isBuffering && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 text-white">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />

          <p className="font-semibold">
            {t("connectingToDevice") ?? "Đang kết nối WebRTC..."}
          </p>

          <p className="mt-2 text-sm text-slate-300">
            {t("waitingForStream") ?? "Đang chờ thiết bị khởi tạo luồng WebRTC"}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 text-rose-500">
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        controls
        muted
        playsInline
      />

      {!isBuffering && !error && (
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md bg-black/60 px-3 py-1 backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          <span className="text-xs font-bold tracking-wider text-white">
            LIVE
          </span>
        </div>
      )}
    </div>
  );
}