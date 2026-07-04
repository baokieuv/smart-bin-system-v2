"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useLanguage } from "@/lib/language";

interface LiveStreamPlayerProps {
  deviceMac: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9999/api/v1";
const MIN_BUFFERED_SEGMENTS = 3;
const STREAM_READY_RETRY_MS = 1500;
const STREAM_READY_PROBE_TIMEOUT_MS = 1500;

type FragmentLike = {
  relurl?: string;
  url?: string;
};

const getFragmentFileName = (fragment?: FragmentLike | null) => {
  if (!fragment) return null;

  const rawUrl = fragment.relurl || fragment.url;
  if (!rawUrl) return null;

  const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `${API_BASE_URL}/${rawUrl.replace(/^\/+/, "")}`;

  try {
    const parsedUrl = new URL(normalizedUrl);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();

    return fileName ? decodeURIComponent(fileName) : null;
  } catch {
    const cleanPath = rawUrl.split("?")[0].split("#")[0];
    const fileName = cleanPath.split("/").filter(Boolean).pop();

    return fileName ? decodeURIComponent(fileName) : null;
  }
};

export default function LiveStreamPlayer({
  deviceMac,
}: LiveStreamPlayerProps) {
  const { t } = useLanguage();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const bufferedFragmentsRef = useRef<Set<string>>(new Set());
  const consumedFragmentsRef = useRef<Set<string>>(new Set());
  const currentFragmentRef = useRef<string | null>(null);
  const playbackStartedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let isPollingManifest = false;
    let cleanupNativePlayback: (() => void) | null = null;

    if (!video) return;

    const createStreamUrl = () =>
      `${API_BASE_URL}/stream/live/${deviceMac}/output.m3u8?ts=${Date.now()}`;

    const getAccessToken = () =>
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const resetPlaybackState = () => {
      bufferedFragmentsRef.current = new Set();
      consumedFragmentsRef.current = new Set();
      currentFragmentRef.current = null;
      playbackStartedRef.current = false;
    };

    const deleteFragmentLocally = (fragment?: FragmentLike | null) => {
      const fileName = getFragmentFileName(fragment);

      if (!fileName || consumedFragmentsRef.current.has(fileName)) {
        return;
      }

      consumedFragmentsRef.current.add(fileName);
      bufferedFragmentsRef.current.delete(fileName);
    };

    const maybeStartPlayback = async () => {
      if (!video || playbackStartedRef.current) {
        return;
      }

      if (bufferedFragmentsRef.current.size < MIN_BUFFERED_SEGMENTS) {
        return;
      }

      playbackStartedRef.current = true;
      setIsBuffering(false);

      try {
        await video.play();
      } catch {
        console.log("Autoplay was blocked");
      }
    };

    const cleanupVideoSource = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const wait = (durationMs: number) =>
      new Promise<void>((resolve) => {
        retryTimeout = setTimeout(resolve, durationMs);
      });

    const probeManifest = async (): Promise<boolean> => {
      try {
        const accessToken = getAccessToken();

        const response = await fetch(createStreamUrl(), {
          method: "GET",
          cache: "no-store",
          headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : undefined,
          signal: AbortSignal.timeout(STREAM_READY_PROBE_TIMEOUT_MS),
        });

        return response.ok;
      } catch {
        return false;
      }
    };

    const startWhenReady = async () => {
      if (cancelled || isPollingManifest) {
        return;
      }

      isPollingManifest = true;
      setError(null);
      setIsBuffering(true);

      destroyHls();
      cleanupVideoSource();
      resetPlaybackState();

      while (!cancelled) {
        const isReady = await probeManifest();

        if (cancelled) {
          break;
        }

        if (isReady) {
          isPollingManifest = false;
          void startPlayback();
          return;
        }

        console.log("Waiting for stream manifest...");
        await wait(STREAM_READY_RETRY_MS);
      }

      isPollingManifest = false;
    };

    const attachHlsPlayer = () => {
      if (cancelled || !video) {
        return;
      }

      const hls = new Hls({
        autoStartLoad: false,
        backBufferLength: 0,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 6,
        lowLatencyMode: true,
        maxBufferLength: 60,
        maxMaxBufferLength: 90,
        maxBufferHole: 0.5,

        xhrSetup: (xhr, url) => {
          const accessToken = getAccessToken();

          if (accessToken && url.includes(`/stream/live/${deviceMac}`)) {
            xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          }
        },
      });

      hlsRef.current = hls;

      const streamUrl = createStreamUrl();

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.startLoad();
      });

      hls.on(Hls.Events.FRAG_BUFFERED, (_, data) => {
        const fragmentKey = getFragmentFileName(data.frag as FragmentLike);

        if (fragmentKey) {
          bufferedFragmentsRef.current.add(fragmentKey);
        }

        void maybeStartPlayback();
      });

      hls.on(Hls.Events.FRAG_CHANGED, (_, data) => {
        const fragmentKey = getFragmentFileName(data.frag as FragmentLike);

        if (fragmentKey) {
          if (currentFragmentRef.current && currentFragmentRef.current !== fragmentKey) {
            deleteFragmentLocally({ relurl: currentFragmentRef.current });
          }

          currentFragmentRef.current = fragmentKey;
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || cancelled) return;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Stream not ready or interrupted, retrying...");
            destroyHls();
            void startWhenReady();
            break;

          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;

          default:
            destroyHls();
            void startWhenReady();
            break;
        }
      });
    };

    const startNativePlayback = () => {
      if (cancelled || !video) {
        return;
      }

      const streamUrl = createStreamUrl();
      video.src = streamUrl;

      const handleLoaded = () => {
        video.play().catch(() => {});
        setIsBuffering(false);
      };

      const handleError = () => {
        cleanupNativePlayback?.();
        cleanupNativePlayback = null;
        destroyHls();
        cleanupVideoSource();
        void startWhenReady();
      };

      video.addEventListener("loadedmetadata", handleLoaded);
      video.addEventListener("error", handleError);

      cleanupNativePlayback = () => {
        video.removeEventListener("loadedmetadata", handleLoaded);
        video.removeEventListener("error", handleError);
      };
    };

    const startPlayback = () => {
      if (cancelled) {
        return;
      }

      if (Hls.isSupported()) {
        attachHlsPlayer();
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        startNativePlayback();
        return;
      }

      setError("Trình duyệt không hỗ trợ HLS.");
    };

    // Cleanup HLS cũ nếu đổi device
    destroyHls();

    setError(null);
    setIsBuffering(true);

    void startWhenReady();

    return () => {
      cancelled = true;

      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }

      cleanupNativePlayback?.();
      cleanupNativePlayback = null;
      destroyHls();
    };
  }, [deviceMac]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      {isBuffering && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 text-white">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />

          <p className="font-semibold">
            {t("connectingToDevice") ?? "Đang kết nối đến thiết bị..."}
          </p>

          <p className="mt-2 text-sm text-slate-300">
            {t("waitingForStream") ??
              "Đang chờ Raspberry Pi nén và tải video lên"}
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