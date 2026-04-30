import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function useSocket(user, handlers = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"],
      autoConnect: true
    });

    socketRef.current = socket;

    if (handlers.onConnected) socket.on("connect", handlers.onConnected);
    if (handlers.onPresence) socket.on("presence:update", handlers.onPresence);
    if (handlers.onMessage) socket.on("message:new", handlers.onMessage);
    if (handlers.onMessageUpdated) socket.on("message:updated", handlers.onMessageUpdated);
    if (handlers.onTyping) socket.on("typing:update", handlers.onTyping);
    if (handlers.onSocialUpdate) socket.on("social:update", handlers.onSocialUpdate);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, handlers.onConnected, handlers.onPresence, handlers.onMessage, handlers.onMessageUpdated]);

  return socketRef;
}
