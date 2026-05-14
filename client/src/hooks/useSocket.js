import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "https://nexvocal.com";

export function useSocket(user, handlers = {}) {
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  const connectionStatusRef = useRef("offline");
  const disconnectTimerRef = useRef(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!user) return undefined;

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"],
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      if (connectionStatusRef.current !== "online") {
        connectionStatusRef.current = "online";
        handlersRef.current.onConnectionState?.("online");
      }
      handlersRef.current.onConnected?.();
    });

    socket.on("disconnect", () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        if (connectionStatusRef.current !== "offline") {
          connectionStatusRef.current = "offline";
          handlersRef.current.onConnectionState?.("offline");
        }
      }, 2500);
    });

    socket.on("message:new", (payload) => handlersRef.current.onMessage?.(payload));
    socket.on("message:updated", (payload) => handlersRef.current.onMessageUpdated?.(payload));
    socket.on("typing:update", (payload) => handlersRef.current.onTyping?.(payload));
    socket.on("social:update", (payload) => handlersRef.current.onSocialUpdate?.(payload));
    socket.on("call:incoming", (payload) => handlersRef.current.onCallIncoming?.(payload));
    socket.on("call:ringing", (payload) => handlersRef.current.onCallRinging?.(payload));
    socket.on("call:accepted", (payload) => handlersRef.current.onCallAccepted?.(payload));
    socket.on("call:rejected", (payload) => handlersRef.current.onCallRejected?.(payload));
    socket.on("call:signal", (payload) => handlersRef.current.onCallSignal?.(payload));
    socket.on("call:ended", (payload) => handlersRef.current.onCallEnded?.(payload));
    socket.on("call:failed", (payload) => handlersRef.current.onCallFailed?.(payload));

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  return socketRef;
}
