import { api } from "@/lib/api-client";

export const mediaApi = {
    startStream: async (deviceMac: string) => {
        return api.post(`/stream/start?deviceMac=${deviceMac}`);
    },

    stopStream: async (deviceMac: string) => {
        return api.post(`/stream/stop?deviceMac=${deviceMac}`);
    },

    sendHeartbeat: async (deviceMac: string) => {
        return api.post(`/stream/heartbeat?deviceMac=${deviceMac}`);
    },

    getStreamVideo: async (deviceMac: string, fileName: string) => {
        return api.get(`/stream/live/${deviceMac}/${fileName}`);
    },

}