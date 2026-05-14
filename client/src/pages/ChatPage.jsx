import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Bell, Circle, EllipsisVertical, MessageCircle, Mic, MicOff, Moon, Phone, PhoneCall, PhoneOff, Share2, Sun, Users, Video, VideoOff, Volume2, VolumeX, X } from "lucide-react";
import ChatWindow from "../components/chat/ChatWindow";
import { chatApi } from "../api/chat";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSocket } from "../hooks/useSocket";

const navItems = [
  { id: "chats", label: "Chats", Icon: MessageCircle },
  { id: "groups", label: "Groups", Icon: Users },
  { id: "updates", label: "Updates", Icon: Circle },
  { id: "calls", label: "Calls", Icon: Phone }
];

const normalizeEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof value._id === "string") return value._id;
    if (value._id && typeof value._id.toString === "function") return value._id.toString();
    if (typeof value.id === "string") return value.id;
    if (value.id && typeof value.id.toString === "function") return value.id.toString();
    if (typeof value.toString === "function") return value.toString();
  }
  return String(value);
};

const getMessageSenderId = (message) => normalizeEntityId(message?.sender?._id || message?.senderId || message?.sender);

const messageIsReadByUser = (message, userId) => {
  if (typeof message?.isRead === "boolean") return message.isRead;
  const seenBy = Array.isArray(message?.seenBy) ? message.seenBy : [];
  const normalizedUserId = normalizeEntityId(userId);
  return seenBy.some((entry) => normalizeEntityId(entry) === normalizedUserId);
};

const isIncomingUnreadMessage = (message, userId) => {
  const normalizedUserId = normalizeEntityId(userId);
  if (!normalizedUserId) return false;
  if (message?.isDeleted) return false;
  if (getMessageSenderId(message) === normalizedUserId) return false;
  return !messageIsReadByUser(message, normalizedUserId);
};

const formatMessageInfoTime = (value) => {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfMessageDay.getTime()) / (24 * 60 * 60 * 1000));
  const timeText = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  if (dayDiff === 0) return `Today at ${timeText}`;
  if (dayDiff === 1) return `Yesterday at ${timeText}`;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302"] }];
const CALL_IDLE_STATE = {
  phase: "idle",
  callId: null,
  conversationId: null,
  callType: "audio",
  isCaller: false,
  peer: null
};

const CALL_FULLSCREEN_PHASES = new Set(["dialing", "connecting", "active", "incoming"]);

const formatCallDuration = (seconds = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatCallTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

function preferRealtimeCodecs(pc) {
  if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function") return;
  const prefer = (kind, codecHints = []) => {
    const capabilities = RTCRtpSender.getCapabilities(kind);
    if (!capabilities?.codecs?.length) return [];
    const score = (mimeType = "") => {
      const normalized = mimeType.toLowerCase();
      const idx = codecHints.findIndex((hint) => normalized.includes(hint));
      return idx < 0 ? 999 : idx;
    };
    return [...capabilities.codecs].sort((a, b) => score(a.mimeType) - score(b.mimeType));
  };

  const preferredAudio = prefer("audio", ["opus"]);
  const preferredVideo = prefer("video", ["vp9", "vp8"]);
  for (const transceiver of pc.getTransceivers()) {
    if (!transceiver?.sender?.track || typeof transceiver.setCodecPreferences !== "function") continue;
    if (transceiver.sender.track.kind === "audio" && preferredAudio.length) transceiver.setCodecPreferences(preferredAudio);
    if (transceiver.sender.track.kind === "video" && preferredVideo.length) transceiver.setCodecPreferences(preferredVideo);
  }
}

export default function ChatPage() {
  const { user, logout, saveProfile, saveSettings } = useAuth();
  const { theme, isLightTheme, setTheme, toggleTheme } = useTheme();
  const [chats, setChats] = useState([]);
  const [stories, setStories] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConversation, setMessagesByConversation] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [tab, setTab] = useState("primary");
  const [mainNav, setMainNav] = useState("chats");
  const [newQuery, setNewQuery] = useState("");
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [messageInfo, setMessageInfo] = useState(null);
  const [typingState, setTypingState] = useState({});
  const [relationship, setRelationship] = useState("none");
  const [profileView, setProfileView] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [ownProfileMenuOpen, setOwnProfileMenuOpen] = useState(false);
  const [otherProfileMenuOpen, setOtherProfileMenuOpen] = useState(false);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
  const [friendsListOpen, setFriendsListOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState({ open: false, url: "", alt: "Profile picture" });
  const [callUi, setCallUi] = useState(CALL_IDLE_STATE);
  const [incomingCallBanner, setIncomingCallBanner] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callIceServers, setCallIceServers] = useState(DEFAULT_ICE_SERVERS);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [callCameraEnabled, setCallCameraEnabled] = useState(true);
  const [callSpeakerOn, setCallSpeakerOn] = useState(true);
  const [localCallStream, setLocalCallStream] = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const [isAtBottomByConversation, setIsAtBottomByConversation] = useState({});
  const processedIncomingIdsRef = useRef(new Set());
  const markSeenInFlightRef = useRef(new Set());
  const markSeenQueuedRef = useRef(new Set());
  const profileMenuRef = useRef(null);
  const profileMenuButtonRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const callDurationIntervalRef = useRef(null);
  const localCallStreamRef = useRef(null);
  const remoteCallStreamRef = useRef(null);
  const callUiRef = useRef(CALL_IDLE_STATE);
  const clearCallResourcesRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const isCallFullscreen = CALL_FULLSCREEN_PHASES.has(callUi.phase);

  const markConversationAsRead = useCallback(async (conversationId) => {
    if (!conversationId || !user?.id) return;
    const normalizedUserId = normalizeEntityId(user.id);

    setChats((prev) => prev.map((chat) => (
      chat.id === conversationId ? { ...chat, unreadCount: 0 } : chat
    )));

    setMessagesByConversation((prev) => {
      const list = prev[conversationId];
      if (!Array.isArray(list) || list.length === 0) return prev;
      let changed = false;
      const nextList = list.map((message) => {
        if (!isIncomingUnreadMessage(message, normalizedUserId)) return message;
        const seenBy = Array.isArray(message.seenBy) ? message.seenBy : [];
        if (seenBy.some((entry) => normalizeEntityId(entry) === normalizedUserId)) return message;
        changed = true;
        return {
          ...message,
          seenBy: [...seenBy, normalizedUserId]
        };
      });
      if (!changed) return prev;
      return { ...prev, [conversationId]: nextList };
    });

    if (markSeenInFlightRef.current.has(conversationId)) {
      markSeenQueuedRef.current.add(conversationId);
      return;
    }
    markSeenInFlightRef.current.add(conversationId);
    try {
      await chatApi.markSeen(conversationId);
    } catch (_error) {
      // Keep optimistic unread clear; server will reconcile on next fetch/socket update.
    } finally {
      markSeenInFlightRef.current.delete(conversationId);
      if (markSeenQueuedRef.current.has(conversationId)) {
        markSeenQueuedRef.current.delete(conversationId);
        markConversationAsRead(conversationId);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    callUiRef.current = callUi;
  }, [callUi]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const current = callUiRef.current;
      if (!current?.callId) return;
      const isForeground = document.visibilityState === "visible" && document.hasFocus();
      if (isForeground && current.phase === "incoming") {
        setIncomingCallBanner({
          callId: current.callId,
          callType: current.callType,
          fromUser: current.peer
        });
        setCallUi((prev) => ({ ...prev, phase: "incoming-banner" }));
      } else if (!isForeground && current.phase === "incoming-banner") {
        setIncomingCallBanner(null);
        setCallUi((prev) => ({ ...prev, phase: "incoming" }));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    window.addEventListener("blur", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      window.removeEventListener("blur", onVisibilityChange);
    };
  }, []);
  const openSettings = useCallback(() => {
    setShowNotifications(false);
    setOwnProfileMenuOpen(false);
    setOtherProfileMenuOpen(false);
    setSettingsMenuOpen(true);
  }, []);

  const closeProfileMenus = useCallback(() => {
    setOwnProfileMenuOpen(false);
    setOtherProfileMenuOpen(false);
  }, []);

  const closeProfileView = useCallback(() => {
    closeProfileMenus();
    setProfileInfoOpen(false);
    setEditProfileOpen(false);
    setFriendsListOpen(false);
    setSettingsMenuOpen(false);
    setProfileImagePreview({ open: false, url: "", alt: "Profile picture" });
    setProfileLoading(false);
    setProfileView(null);
  }, [closeProfileMenus]);

  const openProfileImagePreview = useCallback((url, alt = "Profile picture") => {
    if (!url) return;
    setProfileImagePreview({ open: true, url, alt });
  }, []);

  const closeProfileImagePreview = useCallback(() => {
    setProfileImagePreview({ open: false, url: "", alt: "Profile picture" });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme")
      || localStorage.getItem("nexvocal_theme_mode")
      || localStorage.getItem("nextalk_theme_mode");
    if (saved === "light" || saved === "dark") return;
    if (!user?.theme?.mode) return;
    const preferred = user.theme.mode === "light" ? "light" : "dark";
    setTheme(preferred);
  }, [setTheme, user?.theme?.mode]);

  useEffect(() => {
    if (!user?.id) return;
    const serverTheme = user?.theme?.mode === "light" ? "light" : "dark";
    if (serverTheme === theme) return;
    saveSettings({ theme: { mode: theme } }).catch(() => {});
  }, [saveSettings, theme, user?.id, user?.theme?.mode]);

  const shareProfile = useCallback(async (profile) => {
    const profileSlug = profile?.username ? encodeURIComponent(profile.username) : encodeURIComponent(profile?.id || "");
    const link = `${window.location.origin}/profile/${profileSlug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Profile link copied");
    } catch (_error) {
      const input = document.createElement("input");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast.success("Profile link copied");
    }
  }, []);

  const canViewFriends = useCallback((profile) => {
    if (typeof profile?.canSeeFriends === "boolean") return profile.canSeeFriends;
    const visibility = profile?.privacy?.friendsVisibility || "everyone";
    if (visibility === "nobody") return false;
    if (visibility === "everyone") return true;
    if (profile?.id === user.id) return true;
    return relationship === "friends";
  }, [relationship, user.id]);

  const openProfile = useCallback(async (userId, fallback = null) => {
    if (!userId) return;
    setProfileLoading(true);
    if (fallback) setProfileView((prev) => ({ ...(prev || {}), ...fallback, id: userId }));
    try {
      const [profileRes, relationshipRes] = await Promise.all([
        chatApi.getUserProfile(userId),
        userId === user.id ? Promise.resolve(null) : chatApi.getRelationship(userId).catch(() => null)
      ]);
      setProfileView(profileRes.data.profile);
      if (relationshipRes?.data?.status) setRelationship(relationshipRes.data.status);
      else if (userId === user.id) setRelationship("none");
    } catch (_error) {
      if (!fallback) toast.error("Unable to load profile");
    } finally {
      setProfileLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    // Reset all profile UI toggles whenever profile identity changes.
    closeProfileMenus();
    setProfileInfoOpen(false);
    setEditProfileOpen(false);
    setFriendsListOpen(false);
    setSettingsMenuOpen(false);
  }, [profileView?.id, user.id, closeProfileMenus]);

  useEffect(() => {
    if (!profileImagePreview.open) return undefined;
    const onEsc = (event) => {
      if (event.key === "Escape") {
        closeProfileImagePreview();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [profileImagePreview.open, closeProfileImagePreview]);

  const refreshCallLogs = useCallback(async () => {
    const { data } = await chatApi.getCallLogs(60);
    setCallLogs(data.calls || []);
  }, []);

  useEffect(() => {
    refreshCallLogs().catch(() => {});
    chatApi.getCallConfig().then(({ data }) => {
      if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
        setCallIceServers(data.iceServers);
      }
    }).catch(() => {});
  }, [refreshCallLogs]);

  useEffect(() => {
    if (mainNav !== "calls") return;
    refreshCallLogs().catch(() => {});
  }, [mainNav, refreshCallLogs]);

  const clearCallResources = useCallback(({ emitEnd = false, reason = "hangup", resetUi = true } = {}) => {
    if (emitEnd && callUi.callId) {
      socketRef.current?.emit("call:end", { callId: callUi.callId, reason });
    }
    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }
    setCallDurationSec(0);
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch {}
      peerConnectionRef.current = null;
    }
    if (localCallStreamRef.current) {
      localCallStreamRef.current.getTracks().forEach((track) => track.stop());
      localCallStreamRef.current = null;
    }
    if (remoteCallStreamRef.current) {
      remoteCallStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteCallStreamRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setIncomingCallBanner(null);
    setCallMuted(false);
    setCallCameraEnabled(true);
    setCallSpeakerOn(true);
    if (resetUi) setCallUi(CALL_IDLE_STATE);
  }, [callUi.callId]);

  useEffect(() => {
    clearCallResourcesRef.current = clearCallResources;
  }, [clearCallResources]);

  useEffect(() => () => {
    clearCallResourcesRef.current?.({ emitEnd: false, resetUi: false });
  }, []);

  const ensureCallTimer = useCallback(() => {
    if (callDurationIntervalRef.current) return;
    callDurationIntervalRef.current = setInterval(() => {
      setCallDurationSec((prev) => prev + 1);
    }, 1000);
  }, []);

  const createPeerConnection = useCallback((callId, peerId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: Array.isArray(callIceServers) && callIceServers.length ? callIceServers : DEFAULT_ICE_SERVERS
    });
    peerConnectionRef.current = peerConnection;
    preferRealtimeCodecs(peerConnection);

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketRef.current?.emit("call:signal", {
        callId,
        toUserId: peerId,
        candidate: event.candidate
      });
    };

    peerConnection.ontrack = (event) => {
      const remoteStream = remoteCallStreamRef.current || new MediaStream();
      const sourceStream = event.streams?.[0];
      if (sourceStream) {
        sourceStream.getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
        });
      } else if (event.track && !remoteStream.getTracks().some((existing) => existing.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      remoteCallStreamRef.current = remoteStream;
      setRemoteCallStream(new MediaStream(remoteStream.getTracks()));
      setCallUi((prev) => (prev.phase === "active" ? prev : { ...prev, phase: "active" }));
      ensureCallTimer();
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        setCallUi((prev) => (prev.phase === "active" ? prev : { ...prev, phase: "active" }));
        ensureCallTimer();
      }
      if (state === "failed" || state === "disconnected") {
        clearCallResources({ emitEnd: true, reason: "network", resetUi: true });
        refreshCallLogs().catch(() => {});
      }
    };

    return peerConnection;
  }, [callIceServers, clearCallResources, ensureCallTimer, refreshCallLogs]);

  const attachLocalMedia = useCallback(async (callType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: callType === "video"
        ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        }
        : false
    });
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
    return stream;
  }, []);

  const startCall = useCallback(async (peer, callType = "audio", conversationId = null) => {
    if (!peer?._id) return;
    if (callUi.phase !== "idle") {
      toast.error("You are already in a call");
      return;
    }
    try {
      await attachLocalMedia(callType);
      setCallDurationSec(0);
      pendingIceCandidatesRef.current = [];
      setCallUi({
        phase: "dialing",
        callId: null,
        callType,
        conversationId,
        isCaller: true,
        peer
      });
      socketRef.current?.emit("call:start", {
        targetUserId: peer._id,
        type: callType,
        conversationId
      });
    } catch (error) {
      clearCallResources({ emitEnd: false, resetUi: true });
      toast.error(error?.message || "Camera/Microphone permission required");
    }
  }, [attachLocalMedia, callUi.phase, clearCallResources]);

  const acceptIncomingCall = useCallback(async () => {
    if ((callUi.phase !== "incoming" && callUi.phase !== "incoming-banner") || !callUi.callId || !callUi.peer?._id) return;
    try {
      const stream = await attachLocalMedia(callUi.callType || "audio");
      setCallDurationSec(0);
      const pc = createPeerConnection(callUi.callId, callUi.peer._id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      setCallUi((prev) => ({ ...prev, phase: "connecting", isCaller: false }));
      setIncomingCallBanner(null);
      socketRef.current?.emit("call:accept", { callId: callUi.callId });
    } catch (error) {
      toast.error(error?.message || "Unable to access media devices");
      socketRef.current?.emit("call:reject", { callId: callUi.callId });
      clearCallResources({ emitEnd: false, resetUi: true });
    }
  }, [attachLocalMedia, callUi.callId, callUi.callType, callUi.peer, callUi.phase, clearCallResources, createPeerConnection]);

  const rejectIncomingCall = useCallback(() => {
    if (!callUi.callId) return;
    setIncomingCallBanner(null);
    socketRef.current?.emit("call:reject", { callId: callUi.callId });
    clearCallResources({ emitEnd: false, resetUi: true });
  }, [callUi.callId, clearCallResources]);

  const endCall = useCallback(() => {
    clearCallResources({ emitEnd: true, reason: "hangup", resetUi: true });
    refreshCallLogs().catch(() => {});
  }, [clearCallResources, refreshCallLogs]);

  const toggleMute = useCallback(() => {
    const stream = localCallStreamRef.current;
    if (!stream) return;
    const nextMuted = !callMuted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setCallMuted(nextMuted);
  }, [callMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localCallStreamRef.current;
    if (!stream) return;
    const nextEnabled = !callCameraEnabled;
    stream.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setCallCameraEnabled(nextEnabled);
  }, [callCameraEnabled]);

  const toggleSpeaker = useCallback(() => {
    setCallSpeakerOn((prev) => !prev);
  }, []);

  const isAnyProfileMenuOpen = ownProfileMenuOpen || otherProfileMenuOpen;
  useEffect(() => {
    if (!profileView?.id || !isAnyProfileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      const target = event.target;
      if (profileMenuRef.current?.contains(target) || profileMenuButtonRef.current?.contains(target)) return;
      closeProfileMenus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [profileView?.id, isAnyProfileMenuOpen, closeProfileMenus]);

  const removeMessageLocal = useCallback((conversationId, messageId) => {
    if (!conversationId || !messageId) return;
    setMessagesByConversation((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] || []).filter((m) => m._id !== messageId)
    }));
  }, []);

  const upsertConversationMessage = useCallback((conversationId, incoming) => {
    if (!conversationId || !incoming) return;
    setMessagesByConversation((prev) => {
      const list = prev[conversationId] || [];
      const byId = incoming._id ? list.findIndex((m) => m._id === incoming._id) : -1;
      if (byId >= 0) {
        const next = [...list];
        next[byId] = { ...next[byId], ...incoming };
        return { ...prev, [conversationId]: next };
      }

      if (incoming.clientTempId) {
        const tempIdx = list.findIndex((m) => m._id === incoming.clientTempId);
        if (tempIdx >= 0) {
          const next = [...list];
          next[tempIdx] = { ...next[tempIdx], ...incoming, pending: false };
          return { ...prev, [conversationId]: next };
        }
      }

      return { ...prev, [conversationId]: [...list, incoming] };
    });
  }, []);

  const handleMessageUpdated = useCallback(({ conversationId, message }) => {
    if (!conversationId || !message?._id) return;
    if (message.deletedForEveryone || message.isDeleted || message.deleteMode === "everyone") {
      removeMessageLocal(conversationId, message._id);
      return;
    }
    if (message.deleteMode === "me" && message.actorId === user.id) {
      removeMessageLocal(conversationId, message._id);
      return;
    }
    setMessagesByConversation((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] || []).map((m) => (m._id === message._id ? { ...m, ...message } : m))
    }));
  }, [removeMessageLocal, user.id]);

  const refreshConversations = useCallback(async () => {
    const { data } = await chatApi.getConversations();
    setChats(data.conversations.map((conv) => ({ ...conv, id: conv._id })));
  }, []);

  const refreshMeta = useCallback(async () => {
    const [storiesRes, blockedRes, incomingRes, friendsRes] = await Promise.all([
      chatApi.getStories(),
      chatApi.getBlockedUsers(),
      chatApi.getIncomingFriendRequests(),
      chatApi.getFriends()
    ]);
    setStories(storiesRes.data.stories);
    setBlockedUsers(blockedRes.data.blockedUsers);
    setIncomingRequests(incomingRes.data.requests || []);
    setFriends(friendsRes.data.friends || []);
  }, []);

  useEffect(() => {
    refreshConversations().catch(() => toast.error("Failed to load conversations"));
    refreshMeta().catch(() => {});
  }, [refreshConversations, refreshMeta]);

  useEffect(() => {
    const run = async () => {
      if (!newQuery.trim()) return setDiscoverUsers([]);
      const { data } = await chatApi.searchUsers(newQuery);
      setDiscoverUsers(data.users);
    };
    run().catch(() => {});
  }, [newQuery]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    try {
      const { data } = await chatApi.getMessages(conversationId);
      const messageList = data.messages || [];
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: messageList }));
      const unreadCount = messageList.filter((message) => isIncomingUnreadMessage(message, user.id)).length;
      setChats((prev) => prev.map((chat) => (
        chat.id === conversationId
          ? { ...chat, unreadCount: chat.bucket === "requests" ? 0 : unreadCount }
          : chat
      )));
    } finally {
      setLoadingMessages(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (activeConversationId) loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  const socketRef = useSocket(user, {
    onMessage: (message) => {
      const messageKey = message?._id || message?.clientTempId;
      const isDuplicateIncoming = Boolean(messageKey && processedIncomingIdsRef.current.has(messageKey));
      if (messageKey) {
        processedIncomingIdsRef.current.add(messageKey);
        if (processedIncomingIdsRef.current.size > 5000) processedIncomingIdsRef.current.clear();
      }
      upsertConversationMessage(message.conversationId, message);

      const incoming = getMessageSenderId(message) !== normalizeEntityId(user.id);
      const chatIsOpen = activeConversationId === message.conversationId;
      if (incoming && chatIsOpen) {
        markConversationAsRead(message.conversationId);
      }

      setChats((prev) => prev.map((c) => {
        if (c.id !== message.conversationId) return c;
        const lastMessageText = message.text?.trim() || (incoming ? "Got a new message" : "You have a new message");
        if (!incoming) return { ...c, lastMessage: { text: lastMessageText } };
        const shouldIncrementUnread =
          c.bucket !== "requests"
          && !chatIsOpen
          && !isDuplicateIncoming
          && isIncomingUnreadMessage(message, user.id);
        return {
          ...c,
          unreadCount: shouldIncrementUnread ? Number(c.unreadCount || 0) + 1 : Number(c.unreadCount || 0),
          lastMessage: { text: lastMessageText }
        };
      }));
    },
    onMessageUpdated: handleMessageUpdated,
    onTyping: ({ conversationId, userId, typing }) => setTypingState((prev) => ({ ...prev, [conversationId]: typing && userId !== user.id })),
    onSocialUpdate: async (payload) => {
      if (payload?.type === "friend_request") toast.success("New friend request received");
      await refreshMeta();
      if (activeConversationId) {
        const { data } = await chatApi.getRelationship(chats.find((c) => c.id === activeConversationId)?.partner?._id);
        setRelationship(data.status);
      }
      if (profileView?.id) {
        await openProfile(profileView.id, profileView);
      }
    },
    onCallIncoming: (payload) => {
      if (!payload?.callId || !payload?.fromUser?._id) return;
      const current = callUiRef.current;
      if (current.phase !== "idle") {
        socketRef.current?.emit("call:reject", { callId: payload.callId });
        return;
      }
      const isForeground = document.visibilityState === "visible" && document.hasFocus();
      if (!isForeground && typeof window !== "undefined" && "Notification" in window) {
        const showBrowserCallNotification = () => {
          const title = "Incoming call";
          const body = `${payload.fromUser.displayName || payload.fromUser.fullName || payload.fromUser.username} (${payload.callType === "video" ? "Video" : "Audio"})`;
          try {
            const notification = new Notification(title, {
              body,
              icon: payload.fromUser.avatarUrl || "/favicon.png",
              tag: `incoming-call-${payload.callId}`
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch {
            // Ignore if browser blocks runtime notification.
          }
        };
        if (Notification.permission === "granted") {
          showBrowserCallNotification();
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((permission) => {
            if (permission === "granted") showBrowserCallNotification();
          }).catch(() => {});
        }
      }
      setCallDurationSec(0);
      pendingIceCandidatesRef.current = [];
      setIncomingCallBanner(isForeground ? {
        callId: payload.callId,
        callType: payload.callType === "video" ? "video" : "audio",
        fromUser: payload.fromUser
      } : null);
      setCallUi({
        phase: isForeground ? "incoming-banner" : "incoming",
        callId: payload.callId,
        conversationId: payload.conversationId || null,
        callType: payload.callType === "video" ? "video" : "audio",
        isCaller: false,
        peer: payload.fromUser
      });
      if (!isForeground) {
        toast.success(`${payload.fromUser.displayName || payload.fromUser.fullName || payload.fromUser.username} is calling...`);
      }
    },
    onCallRinging: (payload) => {
      if (!payload?.callId) return;
      setCallUi((prev) => {
        if (!prev.isCaller || prev.phase !== "dialing") return prev;
        if (prev.peer?._id && prev.peer._id.toString() !== payload.toUserId?.toString()) return prev;
        return {
          ...prev,
          callId: payload.callId,
          conversationId: payload.conversationId || prev.conversationId || null,
          phase: "dialing"
        };
      });
    },
    onCallAccepted: async (payload) => {
      if (!payload?.callId) return;
      const current = callUiRef.current;
      if (!current.callId || current.callId !== payload.callId) return;
      setIncomingCallBanner(null);
      setCallUi((prev) => ({ ...prev, phase: "connecting" }));
      if (!current.isCaller || !current.peer?._id) return;
      try {
        const stream = localCallStreamRef.current || await attachLocalMedia(current.callType || "audio");
        let peerConnection = peerConnectionRef.current;
        if (!peerConnection) {
          peerConnection = createPeerConnection(payload.callId, current.peer._id);
          stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
        }
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: current.callType === "video"
        });
        await peerConnection.setLocalDescription(offer);
        socketRef.current?.emit("call:signal", {
          callId: payload.callId,
          toUserId: current.peer._id,
          description: offer
        });
      } catch (error) {
        toast.error("Unable to connect call");
        clearCallResources({ emitEnd: true, reason: "connect-failed", resetUi: true });
      }
    },
    onCallSignal: async (payload) => {
      if (!payload?.callId || !payload?.fromUserId) return;
      const current = callUiRef.current;
      if (!current.callId || current.callId !== payload.callId) return;
      let peerConnection = peerConnectionRef.current;
      try {
        if (!peerConnection) {
          const stream = localCallStreamRef.current || await attachLocalMedia(current.callType || "audio");
          peerConnection = createPeerConnection(payload.callId, payload.fromUserId);
          stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
        }

        if (payload.description) {
          const remoteDescription = new RTCSessionDescription(payload.description);
          if (remoteDescription.type === "offer") {
            await peerConnection.setRemoteDescription(remoteDescription);
            while (pendingIceCandidatesRef.current.length) {
              const queuedCandidate = pendingIceCandidatesRef.current.shift();
              if (queuedCandidate) await peerConnection.addIceCandidate(new RTCIceCandidate(queuedCandidate));
            }
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socketRef.current?.emit("call:signal", {
              callId: payload.callId,
              toUserId: payload.fromUserId,
              description: answer
            });
          } else if (remoteDescription.type === "answer") {
            await peerConnection.setRemoteDescription(remoteDescription);
            while (pendingIceCandidatesRef.current.length) {
              const queuedCandidate = pendingIceCandidatesRef.current.shift();
              if (queuedCandidate) await peerConnection.addIceCandidate(new RTCIceCandidate(queuedCandidate));
            }
          }
        }

        if (payload.candidate) {
          if (!peerConnection.remoteDescription) {
            pendingIceCandidatesRef.current.push(payload.candidate);
          } else {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        }
      } catch {
        toast.error("Call signaling failed");
        clearCallResources({ emitEnd: true, reason: "signal-error", resetUi: true });
      }
    },
    onCallRejected: (payload) => {
      const current = callUiRef.current;
      if (!current.callId || current.callId !== payload?.callId) return;
      toast.error("Call was rejected");
      clearCallResources({ emitEnd: false, resetUi: true });
      refreshCallLogs().catch(() => {});
    },
    onCallEnded: (payload) => {
      const current = callUiRef.current;
      if (!current.callId || current.callId !== payload?.callId) return;
      clearCallResources({ emitEnd: false, resetUi: true });
      refreshCallLogs().catch(() => {});
    },
    onCallFailed: (payload) => {
      toast.error(payload?.reason === "busy" ? "User is busy on another call" : "Unable to start call");
      clearCallResources({ emitEnd: false, resetUi: true });
      refreshCallLogs().catch(() => {});
    }
  });

  const activeChat = useMemo(() => chats.find((item) => item.id === activeConversationId), [chats, activeConversationId]);
  const visibleChats = useMemo(
    () => chats
      .filter((c) => (tab === "unread" ? Number(c.unreadCount || 0) > 0 && c.bucket !== "requests" : c.bucket === tab))
      .filter((c) => c.visible !== false),
    [chats, tab]
  );
  const tabBadgeCounts = useMemo(() => {
    const counts = {
      primary: 0,
      general: 0,
      unread: 0
    };
    let requestsIndicator = incomingRequests.length > 0;
    for (const chat of chats) {
      if (chat.visible === false) continue;
      const unread = Number(chat.unreadCount || 0);
      if (chat.bucket === "primary") counts.primary += unread;
      if (chat.bucket === "general") counts.general += unread;
      if (chat.bucket !== "requests") counts.unread += unread;
      if (chat.bucket === "requests") requestsIndicator = true;
    }
    return { ...counts, requestsIndicator };
  }, [chats, incomingRequests.length]);

  useEffect(() => {
    if (!activeChat?.partner?._id) return;
    chatApi.getRelationship(activeChat.partner._id).then(({ data }) => setRelationship(data.status)).catch(() => setRelationship("none"));
  }, [activeChat?.partner?._id, incomingRequests]);

  useEffect(() => {
    setProfileView((prev) => {
      if (!prev || prev.id !== user.id) return prev;
      return { ...prev, ...user, id: user.id };
    });
  }, [user]);

  const sendMessage = useCallback(async ({ text, files, conversationId, replyTo }) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      _id: tempId,
      clientTempId: tempId,
      conversationId,
      sender: {
        _id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl
      },
      text: text || "",
      attachments: (files || []).map((file) => ({
        fileName: file.name,
        fileType: file.type,
        url: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : ""
      })),
      status: "delivered",
      createdAt: new Date().toISOString(),
      pending: true,
      replyTo: replyTo || null
    };
    upsertConversationMessage(conversationId, optimisticMessage);

    const form = new FormData();
    form.append("conversationId", conversationId);
    form.append("clientTempId", tempId);
    if (text) form.append("text", text);
    (files || []).forEach((file) => form.append("files", file));
    if (replyTo) form.append("replyTo", replyTo);
    try {
      const { data } = await chatApi.sendMessage(form);
      if (data?.message) upsertConversationMessage(conversationId, { ...data.message, clientTempId: tempId });
    } catch (error) {
      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).filter((m) => m._id !== tempId)
      }));
      throw error;
    }
  }, [upsertConversationMessage, user]);

  const deleteMessage = useCallback(async (message, mode) => {
    if (!activeConversationId || !message?._id) return;
    const conversationId = activeConversationId;
    const snapshot = messagesByConversation[conversationId] || [];

    if (mode === "everyone" || mode === "me") {
      removeMessageLocal(conversationId, message._id);
    }

    try {
      await chatApi.deleteMessage(message._id, mode);
    } catch (error) {
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: snapshot }));
      throw error;
    }
  }, [activeConversationId, messagesByConversation, removeMessageLocal]);

  const openMessageInfo = useCallback(async (message) => {
    if (!activeConversationId || !activeChat?.id || !message?._id) return;
    const { data } = await chatApi.getMessageInfo(message._id);
    const deliveredAt = data.info?.deliveredAt || data.info?.sentAt || message.createdAt || null;
    const readAt = data.info?.readAt || message.seenAt || null;
    setMessageInfo({
      deliveredAtText: formatMessageInfoTime(deliveredAt),
      readAtText: formatMessageInfoTime(readAt)
    });
  }, [activeConversationId, activeChat?.id]);

  useEffect(() => {
    setMessageInfo(null);
  }, [activeConversationId]);

  if (profileView) {
    const isOwn = profileView.id === user.id;
    const canShowFriends = canViewFriends(profileView);
    const visibleFriends = canShowFriends ? (isOwn ? friends : (profileView.friends || [])) : [];
    const friendsCount = canShowFriends ? (isOwn ? friends.length : (profileView.friendsCount ?? (relationship === "friends" ? 1 : 0))) : "Hidden";
    const mutualFriendsCount = Number(profileView.mutualFriendsCount ?? 0);
    const hasBio = Boolean(String(profileView.bio || "").trim());
    const profileMenuOpen = isOwn ? ownProfileMenuOpen : otherProfileMenuOpen;
    return (
      <main className={`h-[100svh] overflow-hidden p-4 ${isLightTheme ? "bg-white text-slate-900" : "text-slate-100"}`} style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}>
        <section className="mx-auto flex h-full w-full max-w-[1200px] flex-col rounded-2xl border p-4" style={{ backgroundColor: "var(--nexvocal-surface)", borderColor: "var(--nexvocal-border)", color: "var(--nexvocal-text)" }}>
          <header className="mb-4 grid grid-cols-[auto_1fr_auto] items-center">
            <button onClick={closeProfileView} className={`rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 text-slate-100"}`}><ArrowLeft size={16} /></button>
            <h2 className="text-center text-lg font-semibold">@{profileView.username}</h2>
            <button
              ref={profileMenuButtonRef}
              onClick={() => {
                if (isOwn) {
                  setOtherProfileMenuOpen(false);
                  setOwnProfileMenuOpen((s) => !s);
                  return;
                }
                setOwnProfileMenuOpen(false);
                setOtherProfileMenuOpen((s) => !s);
              }}
              className={`justify-self-end rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 text-slate-100"}`}
            >
              <EllipsisVertical size={16} />
            </button>
          </header>
          <div className="mx-auto mt-2 w-full max-w-md text-center">
            <button
              type="button"
              aria-label="View profile picture"
              onClick={() => openProfileImagePreview(profileView.avatarUrl, profileView.username)}
              className="mx-auto block rounded-full"
            >
              <img src={profileView.avatarUrl} className="mx-auto h-36 w-36 rounded-full object-cover" />
            </button>
            <h3 className="mt-3 text-xl font-semibold">{profileView.displayName || profileView.fullName || profileView.username}</h3>
            <div className={`mt-3 grid gap-3 ${isOwn ? "grid-cols-2" : "grid-cols-1"}`}>
              {isOwn ? (
                <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--nexvocal-surface-elevated)", borderColor: "var(--nexvocal-border)" }}>
                  <p className="text-xs theme-muted">Requests</p>
                  <p className="text-lg font-semibold">{incomingRequests.length}</p>
                </div>
              ) : null}
              <button
                type="button"
                disabled={!canShowFriends}
                onClick={() => {
                  if (!canShowFriends) return;
                  setFriendsListOpen(true);
                }}
                className="rounded-xl border p-3 text-left disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--nexvocal-surface-elevated)", borderColor: "var(--nexvocal-border)" }}
              >
                <p className="text-xs theme-muted">Friends</p>
                <p className="text-lg font-semibold">{friendsCount}</p>
              </button>
            </div>
            {!isOwn && relationship === "friends" && mutualFriendsCount > 0 ? (
              canShowFriends ? (
                <button type="button" onClick={() => setFriendsListOpen(true)} className="mt-2 text-xs theme-muted underline-offset-2 hover:underline">
                  Mutual friends: {mutualFriendsCount}
                </button>
              ) : (
                <p className="mt-2 text-xs theme-muted">Mutual friends: {mutualFriendsCount}</p>
              )
            ) : null}
            {profileLoading ? <p className="mt-3 text-xs theme-muted">Loading profile...</p> : null}
            <div className="mt-4 flex justify-center gap-2">
              {isOwn ? (
                <>
                  <button onClick={() => setEditProfileOpen(true)} className="rounded-lg bg-brandBlue/30 px-3 py-1.5 text-sm">Edit Profile</button>
                  <button onClick={() => shareProfile(profileView)} className={`rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 text-slate-100"}`}><Share2 size={14} className="mr-1 inline" />Share Profile</button>
                </>
              ) : (
                <>
                  <button onClick={() => shareProfile(profileView)} className={`rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 text-slate-100"}`}><Share2 size={14} className="mr-1 inline" />Share Profile</button>
                  <SocialButtons relationship={relationship} onRequest={async () => { try { await chatApi.sendFriendRequest(profileView.id); await refreshMeta(); setRelationship("pending"); } catch (e) { toast.error(e.response?.data?.message || "Unable to send request"); } }} onRespond={async (action) => { await chatApi.respondFriendRequest(profileView.id, action); await refreshMeta(); setRelationship("none"); await openProfile(profileView.id, profileView); }} onCancel={async () => { await chatApi.cancelFriendRequest(profileView.id); setRelationship("none"); }} onUnfriend={async () => { await chatApi.unfriendUser(profileView.id); setRelationship("none"); await openProfile(profileView.id, profileView); }} />
                </>
              )}
            </div>
            {hasBio ? (
              <div className="mt-4 rounded-xl border p-3 text-left" style={{ backgroundColor: "var(--nexvocal-surface-elevated)", borderColor: "var(--nexvocal-border)" }}>
                <p className="text-xs uppercase tracking-wide theme-muted">Bio</p>
                <p className="mt-2 text-sm">{profileView.bio}</p>
              </div>
            ) : null}
          </div>
          {friendsListOpen ? (
            <div className="fixed inset-0 z-[70] bg-black/55 p-4" onClick={() => setFriendsListOpen(false)}>
              <div
                className={`mx-auto mt-20 w-full max-w-md rounded-2xl border p-4 ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Friends List</h3>
                  <button
                    type="button"
                    onClick={() => setFriendsListOpen(false)}
                    className={`rounded-lg border px-2 py-1 text-xs ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}
                  >
                    Close
                  </button>
                </div>
                {!canShowFriends ? <p className="mt-3 text-sm theme-muted">Friend list is hidden due to user's privacy settings.</p> : null}
                {canShowFriends && visibleFriends.length === 0 ? <p className="mt-3 text-sm theme-muted">No friends to show.</p> : null}
                {canShowFriends && visibleFriends.length > 0 ? (
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {visibleFriends.map((friend) => (
                      <button
                        key={friend._id}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${isLightTheme ? "border-slate-300 hover:bg-slate-50" : "border-slate-700 hover:bg-slate-800/70"}`}
                        onClick={() => {
                          setFriendsListOpen(false);
                          openProfile(friend._id, friend);
                        }}
                      >
                        <img src={friend.avatarUrl} alt={friend.username} className="h-7 w-7 rounded-full object-cover" />
                        <span className="truncate text-sm">{friend.displayName || friend.fullName || friend.username}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {profileMenuOpen && !isOwn ? (
            <div ref={profileMenuRef} className={`absolute right-8 top-20 z-50 w-52 rounded-xl border p-2 text-sm ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}>
              <button onClick={async () => { await chatApi.reportUser(profileView.id, "abuse"); closeProfileMenus(); toast.success("User reported"); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Report user</button>
              <button onClick={async () => { await chatApi.blockUser(profileView.id); closeProfileMenus(); toast.success("User blocked"); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Block user</button>
              <button onClick={() => { shareProfile(profileView); closeProfileMenus(); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Copy profile link</button>
              <button onClick={() => { setProfileInfoOpen(true); closeProfileMenus(); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>View profile info</button>
            </div>
          ) : null}
          {profileMenuOpen && isOwn ? (
            <div ref={profileMenuRef} className={`absolute right-8 top-20 z-50 w-52 rounded-xl border p-2 text-sm ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}>
              <button onClick={openSettings} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Settings</button>
              <button onClick={openSettings} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Privacy</button>
              <button onClick={() => { setEditProfileOpen(true); closeProfileMenus(); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Account</button>
              <button onClick={() => { closeProfileMenus(); logout(); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Logout</button>
            </div>
          ) : null}
          {editProfileOpen ? (
            <ProfileEditor
              user={profileView || user}
              saveProfile={saveProfile}
              close={() => setEditProfileOpen(false)}
              refresh={refreshMeta}
              themeMode={theme}
              onPreviewImage={openProfileImagePreview}
            />
          ) : null}
          {profileInfoOpen ? (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setProfileInfoOpen(false)}>
              <div className={`w-full max-w-sm rounded-2xl border p-4 ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`} onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold">Profile Info</h3>
                <p className={`mt-3 text-sm ${isLightTheme ? "text-slate-700" : "text-slate-300"}`}>Join date: {new Date(profileView.createdAt || Date.now()).toLocaleDateString()}</p>
                <p className={`mt-2 text-sm ${isLightTheme ? "text-slate-700" : "text-slate-300"}`}>Name changes: {profileView.nameChangeCount || 0}</p>
                <button onClick={() => setProfileInfoOpen(false)} className={`mt-4 rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}>Close</button>
              </div>
            </div>
          ) : null}
          {settingsMenuOpen ? (
            <div className="fixed inset-0 z-[80] bg-black/50 p-0 md:grid md:place-items-center">
              <div className={`h-full w-full md:h-[90vh] md:max-h-[820px] md:w-[92vw] md:max-w-4xl md:rounded-2xl md:border md:shadow-2xl ${isLightTheme ? "bg-white border-slate-200 text-slate-900" : "bg-slate-950 border-slate-700 text-slate-100"}`}>
                <SettingsPanel
                  user={user}
                  saveSettings={saveSettings}
                  logout={logout}
                  blockedUsers={blockedUsers}
                  onUnblock={async (id) => { await chatApi.unblockUser(id); await refreshMeta(); }}
                  onClose={() => setSettingsMenuOpen(false)}
                  themeMode={theme}
                />
              </div>
            </div>
          ) : null}
          {profileImagePreview.open ? (
            <div className="fixed inset-0 z-[130] bg-black/90" onClick={closeProfileImagePreview}>
              <button
                type="button"
                aria-label="Close image preview"
                onClick={closeProfileImagePreview}
                className="absolute right-5 top-5 rounded-full bg-black/35 p-2 text-white transition hover:bg-black/55"
              >
                <X size={20} />
              </button>
              <div className="grid h-full w-full place-items-center p-4" onClick={(event) => event.stopPropagation()}>
                <img
                  src={profileImagePreview.url}
                  alt={profileImagePreview.alt}
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>
          ) : null}
          <IncomingCallBanner
            callUi={callUi}
            banner={incomingCallBanner}
            onAccept={acceptIncomingCall}
            onReject={rejectIncomingCall}
            isLightTheme={isLightTheme}
          />
          <CallOverlay
            callUi={callUi}
            isLightTheme={isLightTheme}
            localStream={localCallStream}
            remoteStream={remoteCallStream}
            callDurationSec={callDurationSec}
            callMuted={callMuted}
            callCameraEnabled={callCameraEnabled}
            callSpeakerOn={callSpeakerOn}
            onAccept={acceptIncomingCall}
            onReject={rejectIncomingCall}
            onEnd={endCall}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleSpeaker={toggleSpeaker}
          />
        </section>
      </main>
    );
  }

  if (activeConversationId && activeChat) {
    return (
      <main
        className={`nexvocal-shell h-[100svh] overflow-hidden p-0 ${isLightTheme ? "bg-white text-slate-950" : "text-slate-100"}`}
        style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
      >
        <section className="mx-auto flex h-full w-full max-w-[1200px] overflow-hidden">
          <ChatWindow
            focused
            onBack={() => { setMessageInfo(null); setActiveConversationId(null); }}
            activeChat={activeChat}
            blockedByMe={activeChat?.blockedByMe}
            blockedByThem={activeChat?.blockedByThem}
            messages={messagesByConversation[activeConversationId] || []}
            currentUserId={user.id}
            onAvatarClick={() => openProfile(activeChat.partner._id, { ...activeChat.partner })}
            onViewProfile={() => openProfile(activeChat.partner._id, { ...activeChat.partner })}
            onMoveBucket={(bucket) => chatApi.updateConversationBucket(activeChat.id, bucket).then(refreshConversations)}
            onStartCall={(callType = "audio") => startCall(activeChat.partner, callType, activeChat.id)}
            onSend={sendMessage}
            onDelete={deleteMessage}
            onEdit={(id, text) => chatApi.editMessage(id, text)}
            onMarkSeen={markConversationAsRead}
            onInfo={openMessageInfo}
            onBlockUser={(userId) => chatApi.blockUser(userId).then(async () => { await refreshMeta(); await refreshConversations(); })}
            onUnblockUser={(userId) => chatApi.unblockUser(userId).then(async () => { await refreshMeta(); await refreshConversations(); })}
            onReportUser={(userId) => chatApi.reportUser(userId, "abuse")}
            onTyping={(conversationId, isTyping) => socketRef.current?.emit(isTyping ? "typing:start" : "typing:stop", { conversationId })}
            typing={typingState[activeConversationId]}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            loadingMessages={loadingMessages}
            themeMode={theme}
            onBottomStateChange={(conversationId, atBottom) => {
              if (!conversationId) return;
              setIsAtBottomByConversation((prev) => ({ ...prev, [conversationId]: atBottom }));
              if (atBottom) {
                markConversationAsRead(conversationId);
              }
            }}
            messageInfo={messageInfo}
            onCloseMessageInfo={() => setMessageInfo(null)}
          />
          {profileImagePreview.open ? (
            <div className="fixed inset-0 z-[130] bg-black/90" onClick={closeProfileImagePreview}>
              <button
                type="button"
                aria-label="Close image preview"
                onClick={closeProfileImagePreview}
                className="absolute right-5 top-5 rounded-full bg-black/35 p-2 text-white transition hover:bg-black/55"
              >
                <X size={20} />
              </button>
              <div className="grid h-full w-full place-items-center p-4" onClick={(event) => event.stopPropagation()}>
                <img
                  src={profileImagePreview.url}
                  alt={profileImagePreview.alt}
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>
          ) : null}
          <IncomingCallBanner
            callUi={callUi}
            banner={incomingCallBanner}
            onAccept={acceptIncomingCall}
            onReject={rejectIncomingCall}
            isLightTheme={isLightTheme}
          />
          <CallOverlay
            callUi={callUi}
            isLightTheme={isLightTheme}
            localStream={localCallStream}
            remoteStream={remoteCallStream}
            callDurationSec={callDurationSec}
            callMuted={callMuted}
            callCameraEnabled={callCameraEnabled}
            callSpeakerOn={callSpeakerOn}
            onAccept={acceptIncomingCall}
            onReject={rejectIncomingCall}
            onEnd={endCall}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleSpeaker={toggleSpeaker}
          />
        </section>
      </main>
    );
  }

  return (
    <main
      className={`nexvocal-shell mx-auto flex h-[100svh] w-full max-w-[1200px] flex-col overflow-hidden px-2 py-2 pb-20 ${isLightTheme ? "bg-white text-slate-950" : "text-slate-100"}`}
      style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
    >
      {!isCallFullscreen ? (
        <header
          className={`glass-panel grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 ${isLightTheme ? "border-slate-200 bg-white" : "border-cyan-400/20 bg-[#081633]/90"}`}
          style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
        >
          <div className="flex items-center gap-2">
            <img src="/nexvocal-logo.png" alt="NexVocal" className="h-8 w-8 rounded-lg object-contain sm:h-10 sm:w-10" />
            <button
              onClick={toggleTheme}
              className={`rounded-xl border p-1.5 sm:p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-cyan-400/35 bg-[#0a204f] text-cyan-200"}`}
              aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? (
                <Moon size={15} title="Switch to Dark Mode" />
              ) : (
                <Sun size={15} title="Switch to Light Mode" />
              )}
            </button>
          </div>
          <h1 className={`justify-self-center bg-clip-text text-center font-display text-base font-bold tracking-[0.16em] text-transparent sm:text-lg ${isLightTheme ? "bg-gradient-to-r from-slate-900 to-blue-900" : "bg-gradient-to-r from-blue-300 to-cyan-300"}`}>NEXVOCAL</h1>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button onClick={() => setShowNotifications((s) => !s)} className={`relative rounded-xl border p-1.5 sm:p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-cyan-400/35 bg-[#0a204f] text-cyan-200"}`}>
              <Bell size={15} />
              {incomingRequests.length > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] text-white">{incomingRequests.length}</span> : null}
            </button>
            <button onClick={() => openProfile(user.id, { ...user })}><img src={user.avatarUrl} alt="profile" className="h-8 w-8 rounded-full sm:h-9 sm:w-9" /></button>
            <button onClick={openSettings} className={`rounded-xl border p-1.5 sm:p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-cyan-400/35 bg-[#0a204f] text-cyan-200"}`}><EllipsisVertical size={16} /></button>
          </div>
        </header>
      ) : null}

      {!isCallFullscreen && showNotifications ? <section className={`glass-panel mt-2 rounded-2xl p-3 ${isLightTheme ? "border-slate-200 bg-white" : "border-cyan-400/20 bg-[#081633]/88"}`}><h4 className={`text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>Notifications</h4><div className="mt-2 space-y-2">{incomingRequests.length === 0 ? <p className={`text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>No pending friend requests.</p> : incomingRequests.map((r) => <div key={r._id} className={`flex items-center justify-between rounded-xl px-2 py-2 ${isLightTheme ? "bg-white border border-slate-200" : "bg-slate-900/70"}`}><div className="flex items-center gap-2"><img src={r.avatarUrl} className="h-7 w-7 rounded-full" /><span className={`text-xs ${isLightTheme ? "text-slate-800" : "text-slate-200"}`}>@{r.username}</span></div><div className="flex gap-1"><button onClick={async () => { await chatApi.respondFriendRequest(r._id, "accept"); await refreshMeta(); }} className="rounded bg-emerald-500/20 px-2 py-1 text-xs">Accept</button><button onClick={async () => { await chatApi.respondFriendRequest(r._id, "decline"); await refreshMeta(); }} className="rounded bg-rose-500/20 px-2 py-1 text-xs">Decline</button></div></div>)}</div></section> : null}

      {mainNav === "chats" ? (
        <>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {["primary", "general", "requests", "unread"].map((item) => {
              const count = item === "primary" || item === "general" || item === "unread"
                ? tabBadgeCounts[item]
                : 0;
              const showDot = item === "requests" && tabBadgeCounts.requestsIndicator;
              const label = item.charAt(0).toUpperCase() + item.slice(1);
              return (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`inline-flex w-auto items-center rounded-full px-3 py-1 text-xs ${tab === item ? (isLightTheme ? "border border-cyan-200 bg-white text-slate-900" : "bg-cyan-500/20 text-cyan-100") : (isLightTheme ? "border border-slate-200 bg-white text-slate-700" : "bg-slate-900/50 text-slate-300")}`}
                  aria-label={count > 0 ? `${item} (${count} unread)` : item}
                >
                  <span>{label}</span>
                  {count > 0 ? (
                    <span className={`ml-1 text-xs font-semibold ${isLightTheme ? "text-blue-700" : "text-cyan-300"}`}>
                      .{count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                  {showDot ? (
                    <span className={`ml-1 text-xs font-semibold ${isLightTheme ? "text-blue-700" : "text-cyan-300"}`}>
                      .
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <section
            className={`glass-panel mt-2 flex-1 overflow-hidden rounded-2xl p-2 ${isLightTheme ? "border-slate-200 bg-white" : "border-cyan-400/20 bg-[#081633]/88"}`}
            style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
          >
            <input value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="Search users" className={`mb-2 w-full rounded-xl border px-3 py-2 text-sm ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-cyan-400/20 bg-[#07152f] text-slate-100"}`} />
            {discoverUsers.length > 0 ? <div className="mb-2 max-h-24 overflow-auto">{discoverUsers.map((u) => <button key={u._id} onClick={() => openProfile(u._id, { ...u })} className={`mr-1 mt-1 rounded-full border px-2 py-1 text-xs ${isLightTheme ? "border-slate-300 text-slate-800" : "border-cyan-400/25 text-slate-200"}`}>@{u.username}</button>)}</div> : null}
            <div className="h-[calc(100%-132px)] overflow-y-auto space-y-2">
              {visibleChats.map((chat) => {
                const unread = Number(chat.unreadCount || 0) > 0;
                return (
                  <div key={chat.id} className={`rounded-xl border p-2 ${unread ? (isLightTheme ? "border-cyan-300 bg-white" : "border-cyan-400/45 bg-cyan-500/10") : (isLightTheme ? "border-slate-200 bg-white" : "border-slate-700/60")}`}>
                    <button
                      onClick={() => {
                        setActiveConversationId(chat.id);
                        markConversationAsRead(chat.id);
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2">
                        <img src={chat.partner.avatarUrl} className="h-10 w-10 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${unread ? (isLightTheme ? "font-semibold text-slate-900" : "font-semibold text-slate-100") : (isLightTheme ? "text-slate-800" : "text-slate-200")}`}>{chat.partner.displayName || chat.partner.fullName || chat.partner.username}</p>
                          <p className={`truncate text-xs ${unread ? (isLightTheme ? "font-semibold text-slate-800" : "font-semibold text-slate-100") : (isLightTheme ? "text-slate-500" : "text-slate-400")}`}>{chat.lastMessage?.text || "Start chat"}</p>
                        </div>
                        {unread ? <span className="rounded-full bg-brandBlue px-2 text-xs font-semibold text-white">{chat.unreadCount}</span> : null}
                      </div>
                    </button>
                    {chat.bucket === "requests" ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => chatApi.updateConversationBucket(chat.id, "primary").then(refreshConversations)} className="rounded bg-emerald-500/20 px-2 py-1 text-xs">Accept</button>
                        <button onClick={() => chatApi.blockUser(chat.partner._id).then(refreshConversations)} className="rounded bg-rose-500/20 px-2 py-1 text-xs">Block</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
      {mainNav === "calls" ? (
        <section
          className={`glass-panel mt-2 flex-1 overflow-hidden rounded-2xl p-3 ${isLightTheme ? "border-slate-200 bg-white" : "border-cyan-400/20 bg-[#081633]/88"}`}
          style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className={`text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>Recent Calls</h3>
            <button
              onClick={() => refreshCallLogs().catch(() => toast.error("Unable to refresh call logs"))}
              className={`rounded-lg border px-2 py-1 text-xs ${isLightTheme ? "border-slate-300 text-slate-800" : "border-slate-700 text-slate-300"}`}
            >
              Refresh
            </button>
          </div>
          <div className="h-[calc(100%-42px)] space-y-2 overflow-y-auto">
            {callLogs.length === 0 ? (
              <p className={`rounded-xl border p-3 text-sm ${isLightTheme ? "border-slate-200 text-slate-600" : "border-slate-700 text-slate-400"}`}>
                No calls yet.
              </p>
            ) : callLogs.map((entry) => {
              const partner = entry.partner || {};
              const name = partner.displayName || partner.fullName || partner.username || "Unknown user";
              const missed = entry.status === "missed";
              const direction = entry.direction === "incoming" ? "Incoming" : "Outgoing";
              const label = `${direction} ${entry.callType === "video" ? "video" : "audio"} call`;
              return (
                <div key={entry._id} className={`rounded-xl border px-3 py-2 ${isLightTheme ? "border-slate-200 bg-white" : "border-slate-700/60 bg-slate-900/40"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <img src={partner.avatarUrl || user.avatarUrl} className="h-10 w-10 rounded-full object-cover" />
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{name}</p>
                        <p className={`truncate text-xs ${missed ? "text-rose-500" : (isLightTheme ? "text-slate-600" : "text-slate-300")}`}>{missed ? "Missed call" : label}</p>
                        <p className={`text-[11px] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
                          {formatCallTimestamp(entry.endedAt || entry.initiatedAt)} {entry.durationSeconds > 0 ? `• ${formatCallDuration(entry.durationSeconds)}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => startCall(partner, entry.callType || "audio", entry.conversationId || null)}
                      className={`rounded-lg border p-2 ${isLightTheme ? "border-cyan-300 text-cyan-700 hover:bg-cyan-50" : "border-cyan-400/35 text-cyan-300 hover:bg-cyan-500/15"}`}
                      title="Call again"
                    >
                      <PhoneCall size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {mainNav !== "chats" && mainNav !== "calls" ? (
        <section
          className={`glass-panel mt-2 flex-1 rounded-2xl p-4 ${isLightTheme ? "border-slate-200 bg-white" : "border-cyan-400/20 bg-[#081633]/88"}`}
          style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}
        >
          <div className="grid h-full place-items-center">
            <p className={`text-sm ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
              This section is coming soon.
            </p>
          </div>
        </section>
      ) : null}

      {settingsMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-0 md:grid md:place-items-center">
          <div className={`h-full w-full md:h-[90vh] md:max-h-[820px] md:w-[92vw] md:max-w-4xl md:rounded-2xl md:border md:shadow-2xl ${isLightTheme ? "bg-white border-slate-200 text-slate-900" : "bg-slate-950 border-slate-700 text-slate-100"}`}>
            <SettingsPanel
              user={user}
              saveSettings={saveSettings}
              logout={logout}
              blockedUsers={blockedUsers}
              onUnblock={async (id) => { await chatApi.unblockUser(id); await refreshMeta(); }}
              onClose={() => setSettingsMenuOpen(false)}
              themeMode={theme}
            />
          </div>
        </div>
      ) : null}
      {profileImagePreview.open ? (
        <div className="fixed inset-0 z-[130] bg-black/90" onClick={closeProfileImagePreview}>
          <button
            type="button"
            aria-label="Close image preview"
            onClick={closeProfileImagePreview}
            className="absolute right-5 top-5 rounded-full bg-black/35 p-2 text-white transition hover:bg-black/55"
          >
            <X size={20} />
          </button>
          <div className="grid h-full w-full place-items-center p-4" onClick={(event) => event.stopPropagation()}>
            <img
              src={profileImagePreview.url}
              alt={profileImagePreview.alt}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
      <IncomingCallBanner
        callUi={callUi}
        banner={incomingCallBanner}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
        isLightTheme={isLightTheme}
      />
      <CallOverlay
        callUi={callUi}
        isLightTheme={isLightTheme}
        localStream={localCallStream}
        remoteStream={remoteCallStream}
        callDurationSec={callDurationSec}
        callMuted={callMuted}
        callCameraEnabled={callCameraEnabled}
        callSpeakerOn={callSpeakerOn}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onToggleSpeaker={toggleSpeaker}
      />
      {!isCallFullscreen ? (
        <nav className={`fixed bottom-0 left-0 right-0 z-40 border-t px-2 py-2 backdrop-blur ${isLightTheme ? "border-slate-200 bg-white/95" : "border-cyan-400/20 bg-[#07152f]/95"}`}>
          <div className="mx-auto grid max-w-[1200px] grid-cols-4 gap-2">{navItems.map(({ id, label, Icon }) => <button key={id} onClick={() => setMainNav(id)} className={`rounded-xl px-2 py-2 text-xs ${mainNav === id ? (isLightTheme ? "bg-cyan-100 text-slate-900" : "bg-cyan-500/20 text-cyan-100") : (isLightTheme ? "text-slate-700" : "text-slate-300")}`}><Icon size={16} className="mx-auto" /><span className="mt-1 block">{label}</span></button>)}</div>
        </nav>
      ) : null}
    </main>
  );
}

function ProfileEditor({ user, saveProfile, close, refresh, themeMode = "dark", onPreviewImage = () => {} }) {
  const isLightTheme = themeMode === "light";
  const BIO_MAX_LENGTH = 180;
  const [fullName, setFullName] = useState(user.fullName || "");
  const [username, setUsername] = useState(user.username || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasCustomAvatar = Boolean(user.avatarUrl && !user.avatarUrl.includes("dicebear.com/8.x/initials"));
  const shouldShowAvatarPreview = avatarFile || (hasCustomAvatar && !removeAvatar);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(user.avatarUrl || "");

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(user.avatarUrl || "");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile, user.avatarUrl]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <div className={`w-full max-w-md rounded-2xl border p-4 ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl">Edit Profile</h3>
          <button onClick={close} className={`rounded-lg border px-3 py-1 text-xs ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}>Back</button>
        </div>
        <div className="mt-3 flex flex-col items-center">
          {shouldShowAvatarPreview ? (
            <button
              type="button"
              aria-label="View profile picture"
              onClick={() => onPreviewImage(avatarPreviewUrl || user.avatarUrl, user.username)}
              className="rounded-full"
            >
              <img src={avatarPreviewUrl || user.avatarUrl} className="h-24 w-24 rounded-full object-cover" />
            </button>
          ) : (
            <label className={`mt-1 block w-full max-w-xs cursor-pointer rounded-xl border-2 border-dashed px-3 py-8 text-center text-sm ${isLightTheme ? "border-slate-300 text-slate-700" : "border-slate-600 text-slate-300"}`}>
              <span className="font-semibold">Edit Picture</span>
              <p className={`mt-1 text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>Tap to add profile picture</p>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { setAvatarFile(e.target.files?.[0] || null); setRemoveAvatar(false); }} />
            </label>
          )}
          {hasCustomAvatar && !removeAvatar ? (
            <div className="mt-2 flex gap-2">
              <button onClick={() => onPreviewImage(avatarPreviewUrl || user.avatarUrl, user.username)} className={`rounded-lg border px-3 py-1.5 text-xs ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}>View Picture</button>
              <label className="cursor-pointer rounded-lg bg-brandBlue/30 px-3 py-1.5 text-xs">Change Picture<input type="file" accept="image/*" className="hidden" onChange={(e) => { setAvatarFile(e.target.files?.[0] || null); setRemoveAvatar(false); }} /></label>
              <button onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }} className={`rounded-lg border px-3 py-1.5 text-xs ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}>Remove</button>
            </div>
          ) : null}
          {removeAvatar ? <p className={`mt-2 text-xs ${isLightTheme ? "text-amber-700" : "text-amber-300"}`}>Profile picture will be removed after you press Save.</p> : null}
        </div>
        <label className={`mt-3 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-600" : "text-slate-400"}`}>
          Full Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`} placeholder="Full Name" />
        </label>
        <label className={`mt-2 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-600" : "text-slate-400"}`}>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`} placeholder="@username" />
        </label>
        <label className={`mt-2 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-600" : "text-slate-400"}`}>
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
            maxLength={BIO_MAX_LENGTH}
            placeholder="Write a short bio"
            className={`mt-1 min-h-[86px] w-full rounded-lg border px-3 py-2 text-sm ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
          />
          <span className={`mt-1 block text-right text-[11px] ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>{bio.length}/{BIO_MAX_LENGTH}</span>
        </label>
        <button
          disabled={saving}
          onClick={async () => {
            const nextFullName = fullName.trim();
            const nextUsername = username.trim().toLowerCase();
            if (!nextFullName) return toast.error("Name cannot be empty");
            if (!nextUsername) return toast.error("Username cannot be empty");
            if (!/^[a-z0-9._]{3,30}$/.test(nextUsername)) return toast.error("Username must be 3-30 chars and use letters, numbers, dot, underscore");
            setSaving(true);
            const form = new FormData();
            form.append("fullName", nextFullName);
            form.append("displayName", nextFullName);
            form.append("username", nextUsername);
            form.append("bio", bio.trim());
            if (avatarFile) form.append("avatar", avatarFile);
            if (!avatarFile && removeAvatar) form.append("removeAvatar", "true");
            try {
              await saveProfile(form);
              await refresh();
              close();
              toast.success("Profile updated");
            } finally {
              setSaving(false);
            }
          }}
          className={`mt-3 w-full rounded-xl py-2 disabled:opacity-60 ${isLightTheme ? "bg-cyan-600 text-white" : "bg-brandBlue/40 text-slate-100"}`}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function CallOverlay({
  callUi,
  isLightTheme,
  localStream,
  remoteStream,
  callDurationSec,
  callMuted,
  callCameraEnabled,
  callSpeakerOn,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker
}) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const open = callUi.phase !== "idle" && callUi.phase !== "incoming-banner";

  useEffect(() => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = remoteStream || null;
  }, [remoteStream]);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    audioEl.srcObject = remoteStream || null;
    if (typeof audioEl.setSinkId === "function") {
      audioEl.setSinkId(callSpeakerOn ? "default" : "communications").catch(() => {});
    } else {
      audioEl.volume = callSpeakerOn ? 1 : 0.45;
    }
  }, [remoteStream, callSpeakerOn]);

  if (!open) return null;

  const peerName = callUi.peer?.displayName || callUi.peer?.fullName || callUi.peer?.username || "Unknown user";
  const peerAvatar = callUi.peer?.avatarUrl || "";
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks?.()?.length);
  const hasLocalVideo = Boolean(localStream?.getVideoTracks?.()?.length);
  const isIncoming = callUi.phase === "incoming";
  const statusText = callUi.phase === "dialing"
    ? "Ringing..."
    : callUi.phase === "connecting"
      ? "Connecting..."
      : callUi.phase === "active"
        ? formatCallDuration(callDurationSec)
        : "Incoming call";

  return (
    <div className="fixed inset-0 z-[220] overflow-hidden bg-black/85">
      <div className="absolute inset-0">
        {peerAvatar ? <img src={peerAvatar} className="h-full w-full scale-110 object-cover blur-2xl opacity-45" /> : null}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl" />
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {isIncoming ? (
        <div className="relative z-10 flex h-full flex-col items-center justify-between p-6">
          <div className="mt-20 text-center">
            <img src={peerAvatar} className="mx-auto h-24 w-24 rounded-full border border-cyan-300/40 object-cover" />
            <p className="mt-4 text-2xl font-semibold text-white">{peerName}</p>
            <p className="mt-1 text-sm text-slate-200">{callUi.callType === "video" ? "Incoming video call" : "Incoming audio call"}</p>
          </div>
          <div className="mb-8 flex items-center justify-center gap-6">
            <button onClick={onReject} className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg">
              <PhoneOff size={18} />
            </button>
            <button onClick={onAccept} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
              <PhoneCall size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex h-full flex-col">
          <div className="relative flex-1">
            {callUi.callType === "video" && hasRemoteVideo ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center">
                <div className="text-center">
                  <img src={peerAvatar} className="mx-auto h-28 w-28 rounded-full border border-cyan-300/40 object-cover" />
                  <p className="mt-4 text-2xl font-semibold text-white">{peerName}</p>
                  <p className="mt-1 text-sm text-slate-300">{callUi.callType === "video" ? "Video call" : "Audio call"}</p>
                </div>
              </div>
            )}
            <div className="absolute left-0 right-0 top-8 text-center">
              <p className="text-xl font-semibold text-white">{peerName}</p>
              <p className="mt-1 text-sm text-slate-200">{statusText}</p>
            </div>
            {callUi.callType === "video" && hasLocalVideo ? (
              <div className="absolute right-4 top-4 h-28 w-20 overflow-hidden rounded-xl border border-white/35 bg-black/40">
                <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              </div>
            ) : null}
          </div>
          <div className="relative z-20 flex items-center justify-center gap-4 px-4 pb-8">
            <button onClick={onToggleMute} className={`flex h-10 w-10 items-center justify-center rounded-full ${callMuted ? "bg-rose-500 text-white" : "bg-white/20 text-white"}`}>
              {callMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={onToggleCamera}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${callCameraEnabled ? "bg-white/20 text-white" : "bg-amber-500 text-white"}`}
              disabled={callUi.callType !== "video"}
            >
              {callCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
            <button onClick={onEnd} className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg">
              <PhoneOff size={18} />
            </button>
            <button onClick={onToggleSpeaker} className={`flex h-10 w-10 items-center justify-center rounded-full ${callSpeakerOn ? "bg-cyan-500 text-white" : "bg-white/20 text-white"}`}>
              {callSpeakerOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IncomingCallBanner({ callUi, banner, onAccept, onReject, isLightTheme }) {
  const visible = callUi.phase === "incoming-banner" && Boolean(banner?.callId && banner?.fromUser?._id);
  if (!visible) return null;
  const name = banner.fromUser.displayName || banner.fromUser.fullName || banner.fromUser.username || "Unknown user";
  return (
    <div className="fixed left-3 right-3 top-3 z-[230] md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2">
      <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2 shadow-2xl backdrop-blur-xl ${isLightTheme ? "border-slate-200 bg-white/95 text-slate-900" : "border-cyan-400/25 bg-[#051833]/92 text-slate-100"}`}>
        <img src={banner.fromUser.avatarUrl} className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className={`text-xs ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>{banner.callType === "video" ? "Incoming video call" : "Incoming audio call"}</p>
        </div>
        <button onClick={onReject} className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white">
          <PhoneOff size={14} />
        </button>
        <button onClick={onAccept} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
          <PhoneCall size={14} />
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({ user, saveSettings, logout, blockedUsers, onUnblock, onClose, themeMode = "dark" }) {
  const isLightTheme = themeMode === "light";
  const p = user.privacy || {};
  const [draft, setDraft] = useState({
    activeStatus: !!user.activeStatus,
    readReceipts: p.readReceipts !== false,
    friendRequests: p.friendRequests || "everyone",
    profilePhoto: p.profilePhoto || "everyone",
    messaging: p.messaging || "everyone",
    friendsVisibility: p.friendsVisibility || "everyone"
  });
  return (
    <div className={`flex h-full flex-col p-4 md:p-6 ${isLightTheme ? "bg-white text-slate-900" : "text-slate-100"}`} style={isLightTheme ? { backgroundColor: "#FFFFFF" } : undefined}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl">Settings</h3>
        <button onClick={onClose} className={`rounded-lg border px-3 py-1.5 text-sm ${isLightTheme ? "border-slate-300" : "border-slate-700"}`}>Close</button>
      </div>
      <div className="mt-4 space-y-2 overflow-y-auto text-sm">
        <Toggle label="Activity Status" value={draft.activeStatus} onChange={(v) => setDraft((prev) => ({ ...prev, activeStatus: v }))} themeMode={themeMode} />
        <Toggle label="Read Receipts" value={draft.readReceipts} onChange={(v) => setDraft((prev) => ({ ...prev, readReceipts: v }))} themeMode={themeMode} />
        <Select label="Who can send Friend Requests" value={draft.friendRequests} options={["everyone", "nobody"]} onChange={(v) => setDraft((prev) => ({ ...prev, friendRequests: v }))} themeMode={themeMode} />
        <Select label="Profile Picture Privacy" value={draft.profilePhoto} options={["everyone", "friends", "nobody"]} onChange={(v) => setDraft((prev) => ({ ...prev, profilePhoto: v }))} themeMode={themeMode} />
        <Select label="Who can DM me" value={draft.messaging} options={["everyone", "friends"]} onChange={(v) => setDraft((prev) => ({ ...prev, messaging: v }))} themeMode={themeMode} />
        <Select label="Who can see friends?" value={draft.friendsVisibility} options={["everyone", "friends", "nobody"]} onChange={(v) => setDraft((prev) => ({ ...prev, friendsVisibility: v }))} themeMode={themeMode} />
        <p className={`pt-1 text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>Blocked users</p>
        {blockedUsers.map((u) => <div key={u._id} className={`flex items-center justify-between rounded-lg px-2 py-1 ${isLightTheme ? "border border-slate-200 bg-white" : "bg-slate-900"}`}><span>@{u.username}</span><button onClick={() => onUnblock(u._id)} className={`text-xs ${isLightTheme ? "text-blue-700" : "text-blue-300"}`}>Unblock</button></div>)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className={`rounded-lg px-3 py-2 text-left ${isLightTheme ? "bg-emerald-500/15 text-emerald-800" : "bg-emerald-500/20 text-emerald-100"}`} onClick={async () => {
          await saveSettings({
            activeStatus: draft.activeStatus,
            privacy: {
              readReceipts: draft.readReceipts,
              friendRequests: draft.friendRequests,
              profilePhoto: draft.profilePhoto,
              messaging: draft.messaging,
              friendsVisibility: draft.friendsVisibility
            }
          });
          onClose();
        }}>Save</button>
        <button className={`rounded-lg px-3 py-2 text-left ${isLightTheme ? "bg-rose-500/15 text-rose-800" : "bg-rose-500/20 text-rose-200"}`} onClick={logout}>Logout</button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, themeMode = "dark" }) {
  const isLightTheme = themeMode === "light";
  return <button onClick={() => onChange(!value)} className={`w-full rounded-lg border px-3 py-2 text-left ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-900 text-slate-100"}`}>{label}: {value ? "ON" : "OFF"}</button>;
}
function Select({ label, value, options, onChange, themeMode = "dark" }) {
  const isLightTheme = themeMode === "light";
  const optionLabel = (option) => {
    if (option === "everyone") return "Everyone";
    if (option === "friends") return "Friends";
    if (option === "nobody") return "Only Me";
    return option;
  };
  return <label className={`block rounded-lg border px-3 py-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-900 text-slate-100"}`}>{label}<select className={`mt-1 w-full rounded border p-1 ${isLightTheme ? "border-slate-300 bg-white text-slate-900" : "border-slate-700 bg-slate-800 text-slate-100"}`} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}</select></label>;
}

function SocialButtons({ relationship, onRequest, onRespond, onCancel, onUnfriend }) {
  if (relationship === "incoming") return <><button className="rounded-lg bg-emerald-500/20 px-3 py-1.5" onClick={() => onRespond("accept")}>Accept</button><button className="rounded-lg bg-rose-500/20 px-3 py-1.5" onClick={() => onRespond("decline")}>Decline</button></>;
  if (relationship === "pending") return <button className="rounded-lg bg-amber-500/20 px-3 py-1.5" onClick={onCancel}>Cancel Request</button>;
  if (relationship === "friends") return <button className="rounded-lg bg-rose-500/20 px-3 py-1.5" onClick={onUnfriend}>Unfriend</button>;
  return <button className="rounded-lg bg-brandBlue/30 px-3 py-1.5" onClick={onRequest}>Add Friend</button>;
}

