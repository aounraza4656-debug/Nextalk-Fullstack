import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCheck, EllipsisVertical, Image as ImageIcon, Loader2, Mic, Pause, Phone, Play, RefreshCw, Send, Smile, Trash2, Video, X } from "lucide-react";

const cachedMediaUrls = new Set();
const CONTEXT_MENU_WIDTH = 176;
const CONTEXT_MENU_HEIGHT = 228;
const CONTEXT_MENU_GAP = 8;

export default function ChatWindow({ focused = false, onBack, activeChat, blockedByMe, blockedByThem, messages, currentUserId, onAvatarClick, onViewProfile, onMoveBucket, onStartCall, onSend, onDelete, onEdit, onMarkSeen, onInfo, onBlockUser, onReportUser, onUnblockUser, onTyping, typing, replyingTo, setReplyingTo, loadingMessages, onBottomStateChange, themeMode = "dark", messageInfo = null, onCloseMessageInfo = null }) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [recordedDurationMs, setRecordedDurationMs] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraMode, setCameraMode] = useState("photo");
  const [cameraRecordingMs, setCameraRecordingMs] = useState(0);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState("environment");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerModule, setEmojiPickerModule] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const feedRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const inputRef = useRef(null);
  const chatWindowRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraRecorderRef = useRef(null);
  const cameraChunksRef = useRef([]);
  const cameraRecordingIntervalRef = useRef(null);
  const cameraDiscardRecordingRef = useRef(false);
  const galleryFallbackRef = useRef(null);
  const audioChunksRef = useRef([]);
  const holdTimerRef = useRef(null);
  const replySwipeStartX = useRef(0);
  const recordingStartX = useRef(0);
  const recordingCancelledRef = useRef(false);
  const recordingIntervalRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const waveformRafRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const initializedConversationRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const emojiButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const caretRef = useRef({ start: 0, end: 0 });
  const headerMenuRef = useRef(null);
  const headerMenuButtonRef = useRef(null);
  const messagesEndRef = useRef(null);
  const forceScrollOnNextMessageRef = useRef(false);

  const scrollToMessagesEnd = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const formatDuration = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    window.addEventListener("click", closeContextMenu);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
      window.removeEventListener("click", closeContextMenu);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (cameraRecordingIntervalRef.current) clearInterval(cameraRecordingIntervalRef.current);
      if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
      audioContextRef.current?.close?.();
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      const menuNode = headerMenuRef.current;
      const buttonNode = headerMenuButtonRef.current;
      const targetNode = event.target;
      if (menuNode?.contains(targetNode) || buttonNode?.contains(targetNode)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    const currentConversationId = activeChat?.id || null;
    const view = feedRef.current;
    if (!currentConversationId) return;

    if (initializedConversationRef.current !== currentConversationId) {
      initializedConversationRef.current = currentConversationId;
      prevMessageCountRef.current = messages.length;
      setNewMessageCount(0);
      setIsAtBottom(true);
      scrollToMessagesEnd("auto");
      forceScrollOnNextMessageRef.current = false;
      return;
    }

    const previousCount = prevMessageCountRef.current;
    if (messages.length <= previousCount) {
      prevMessageCountRef.current = messages.length;
      return;
    }

    const appended = messages.slice(previousCount);
    prevMessageCountRef.current = messages.length;
    const incomingCount = appended.filter((msg) => msg?.sender?._id !== currentUserId).length;
    const hasOutgoingAppend = appended.some((msg) => msg?.sender?._id === currentUserId);

    const nearBottom = view
      ? view.scrollHeight - view.scrollTop <= view.clientHeight + 100
      : isAtBottom;
    const shouldForceScroll = forceScrollOnNextMessageRef.current || hasOutgoingAppend;

    if (shouldForceScroll || nearBottom) {
      scrollToMessagesEnd("smooth");
      setIsAtBottom(true);
      setNewMessageCount(0);
      forceScrollOnNextMessageRef.current = false;
      return;
    }

    if (incomingCount > 0) {
      setIsAtBottom(false);
      setNewMessageCount((count) => count + incomingCount);
    }
  }, [messages, activeChat?.id, currentUserId, isAtBottom]);

  const handleFeedScroll = () => {
    const view = feedRef.current;
    if (!view) return;
    const nearBottom = view.scrollHeight - view.scrollTop <= view.clientHeight + 100;
    setIsAtBottom(nearBottom);
    onBottomStateChange?.(activeChat?.id, nearBottom);
    if (nearBottom) setNewMessageCount(0);
    if (contextMenu) setContextMenu(null);
  };

  useEffect(() => { if (activeChat?.id) onMarkSeen(activeChat.id); }, [activeChat?.id, onMarkSeen]);
  useEffect(() => { if (activeChat?.id) onBottomStateChange?.(activeChat.id, isAtBottom); }, [activeChat?.id, isAtBottom, onBottomStateChange]);
  useEffect(() => { if (!activeChat?.id || !onTyping) return; const id = setTimeout(() => onTyping(activeChat.id, Boolean(input.trim())), 120); return () => clearTimeout(id); }, [input, activeChat?.id, onTyping]);

  const headerStatus = useMemo(() => {
    if (activeChat?.partner?.activeStatus === false) return "";
    if (activeChat?.partner?.online) return "Online";
    if (activeChat?.partner?.lastSeenAt) return `Last seen at ${new Date(activeChat.partner.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return "";
  }, [activeChat?.partner?.online, activeChat?.partner?.activeStatus, activeChat?.partner?.lastSeenAt]);

  const currentCategory = activeChat?.bucket || "primary";
  const canMoveToPrimary = currentCategory !== "primary";
  const canMoveToGeneral = currentCategory !== "general";

  const processMediaFiles = async (chosenFiles, append = true) => {
    const out = [];
    for (const file of chosenFiles) {
      if (!file.type.startsWith("image/")) { out.push(file); continue; }
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const maxW = 1600;
      const scale = Math.min(1, maxW / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      out.push(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
    }
    setFiles((prev) => (append ? [...prev, ...out] : out));
  };

  const openGalleryFallback = () => {
    galleryFallbackRef.current?.click();
  };

  const stopCameraStream = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause?.();
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.onloadedmetadata = null;
      videoPreviewRef.current.onloadeddata = null;
    }
  };

  const closeCamera = () => {
    cameraDiscardRecordingRef.current = true;
    if (cameraRecordingIntervalRef.current) {
      clearInterval(cameraRecordingIntervalRef.current);
      cameraRecordingIntervalRef.current = null;
    }
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== "inactive") {
      try { cameraRecorderRef.current.stop(); } catch (_error) {}
    }
    stopCameraStream();
    cameraRecorderRef.current = null;
    cameraChunksRef.current = [];
    setCameraRecording(false);
    setCameraRecordingMs(0);
    setCameraLoading(false);
    setCameraReady(false);
    setCameraOpen(false);
    setCameraError("");
  };

  const openCamera = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      openGalleryFallback();
      return;
    }
    setCameraError("");
    setCameraRecording(false);
    setCameraRecordingMs(0);
    setCameraMode("photo");
    setCameraLoading(true);
    setCameraReady(false);
    setCameraOpen(true);
  };

  const flipCamera = () => {
    if (cameraRecording) return;
    setCameraError("");
    setCameraLoading(true);
    setCameraReady(false);
    setCameraFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    const startCameraStream = async () => {
      setCameraError("");
      setCameraLoading(true);
      setCameraReady(false);
      stopCameraStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacingMode },
          audio: true
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const preview = videoPreviewRef.current;
        if (!preview) {
          setCameraReady(true);
          setCameraLoading(false);
          return;
        }
        preview.srcObject = stream;
        const markReady = () => {
          if (cancelled) return;
          preview.play().catch(() => {});
          setCameraReady(true);
          setCameraLoading(false);
        };
        preview.onloadedmetadata = markReady;
        preview.onloadeddata = markReady;
        if (preview.readyState >= 1) markReady();
      } catch (_error) {
        if (cancelled) return;
        setCameraReady(false);
        setCameraLoading(false);
        setCameraError("Unable to start camera. Check permissions.");
      }
    };
    startCameraStream();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, cameraFacingMode]);

  const capturePhoto = async () => {
    const video = videoPreviewRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    await processMediaFiles([file]);
    closeCamera();
  };

  const startCameraRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream || cameraRecording || cameraMode !== "video" || !cameraReady) return;
    try {
      cameraDiscardRecordingRef.current = false;
      cameraChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      cameraRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) cameraChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (cameraRecordingIntervalRef.current) {
          clearInterval(cameraRecordingIntervalRef.current);
          cameraRecordingIntervalRef.current = null;
        }
        const shouldDiscard = cameraDiscardRecordingRef.current;
        setCameraRecording(false);
        if (shouldDiscard) {
          cameraDiscardRecordingRef.current = false;
          setCameraRecordingMs(0);
          return;
        }
        const blob = new Blob(cameraChunksRef.current, { type: "video/webm" });
        if (blob.size > 0) {
          const file = new File([blob], `camera-video-${Date.now()}.webm`, { type: "video/webm" });
          await processMediaFiles([file]);
          closeCamera();
        }
      };
      recorder.start();
      setCameraRecording(true);
      setCameraRecordingMs(0);
      cameraRecordingIntervalRef.current = setInterval(() => {
        setCameraRecordingMs((ms) => ms + 1000);
      }, 1000);
    } catch (_error) {
      setCameraError("Video recording is not supported on this device.");
    }
  };

  const stopCameraRecording = () => {
    if (!cameraRecorderRef.current || !cameraRecording) return;
    if (cameraRecordingIntervalRef.current) {
      clearInterval(cameraRecordingIntervalRef.current);
      cameraRecordingIntervalRef.current = null;
    }
    cameraRecorderRef.current.stop();
    setCameraRecording(false);
  };

  const handleCameraPrimaryAction = async () => {
    if (cameraMode === "photo") {
      await capturePhoto();
      return;
    }
    if (!cameraRecording) startCameraRecording();
    else stopCameraRecording();
  };

  const handleSend = (event) => {
    event.preventDefault();
    if (blockedByMe || blockedByThem) return;
    const payloadFiles = [...files, ...(recordedBlob ? [new File([recordedBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" })] : [])];
    if (!input.trim() && payloadFiles.length === 0) return;
    const nextText = input.trim();
    setInput("");
    setFiles([]);
    setRecordedBlob(null);
    setReplyingTo(null);
    forceScrollOnNextMessageRef.current = true;
    scrollToMessagesEnd("smooth");
    onSend({ text: nextText, files: payloadFiles, conversationId: activeChat.id, replyTo: replyingTo?._id || null }).catch(() => {});
  };

  const drawWaveform = () => {
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    const data = new Uint8Array(analyser.frequencyBinCount);
    const render = () => {
      analyser.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mid = canvas.height / 2;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(148,163,184,0.45)";
      ctx.lineWidth = 1;
      ctx.moveTo(0, mid);
      ctx.lineTo(canvas.width, mid);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#38bdf8";
      const slice = canvas.width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 2) {
        const normalized = (data[i] - 128) / 128;
        const y = mid + normalized * (canvas.height * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice * 2;
      }
      ctx.stroke();
      waveformRafRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const startRecording = async (startX = 0) => {
    if (isRecording) return;
    try {
      recordingStartX.current = startX;
      recordingCancelledRef.current = false;
      setSlideOffset(0);
      setRecordingMs(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (!recordingCancelledRef.current) {
          setRecordedBlob(new Blob(audioChunksRef.current, { type: "audio/webm" }));
          setRecordedDurationMs(recordingMs);
        } else {
          setRecordedDurationMs(0);
        }
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
        waveformRafRef.current = null;
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
        audioContextRef.current?.close?.();
        audioContextRef.current = null;
        analyserRef.current = null;
      };

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      recordingIntervalRef.current = setInterval(() => setRecordingMs((ms) => ms + 100), 100);
      setTimeout(drawWaveform, 0);
    } catch (_error) {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setSlideOffset(0);
  };

  const cancelRecording = () => {
    recordingCancelledRef.current = true;
    setRecordedBlob(null);
    setRecordedDurationMs(0);
    stopRecording();
  };

  const sendRecordedAudio = async () => {
    if (!recordedBlob || blockedByMe || blockedByThem) return;
    await onSend({
      text: "",
      files: [new File([recordedBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" })],
      conversationId: activeChat.id,
      replyTo: replyingTo?._id || null
    });
    setRecordedBlob(null);
    setRecordedDurationMs(0);
    setReplyingTo(null);
  };

  const toggleMessageSelection = (messageId) => {
    setSelectedIds((prev) => (prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]));
  };

  const startSelectionMode = (message) => {
    if (!message?._id) return;
    setSelectMode(true);
    setSelectedIds((prev) => (prev.includes(message._id) ? prev : [...prev, message._id]));
  };

  const openDeletePromptForMessages = (targets) => {
    const messagesToDelete = (targets || []).filter((message) => message?._id);
    if (messagesToDelete.length === 0) return;
    const canDeleteForEveryone = messagesToDelete.every((message) => message?.sender?._id === currentUserId);
    setDeletePrompt({ messages: messagesToDelete, canDeleteForEveryone });
  };

  const deletePromptTargets = useMemo(() => {
    if (!deletePrompt?.messages?.length) return [];
    return deletePrompt.messages;
  }, [deletePrompt]);

  const cancelDeletePrompt = () => {
    setDeletePrompt(null);
    setContextMenu(null);
    setSelectedIds([]);
    setSelectMode(false);
  };

  const handleDeleteSelection = async (mode) => {
    if (!deletePromptTargets.length) {
      cancelDeletePrompt();
      return;
    }
    await Promise.all(
      deletePromptTargets.map((message) => {
        const isMine = message?.sender?._id === currentUserId;
        const effectiveMode = mode === "everyone" ? (isMine ? "everyone" : "me") : "me";
        return onDelete(message, effectiveMode);
      })
    );
    cancelDeletePrompt();
  };

  const resolveContextMenuPosition = (clientX, clientY) => {
    const hostRect = chatWindowRef.current?.getBoundingClientRect();
    if (!hostRect) return { x: CONTEXT_MENU_GAP, y: CONTEXT_MENU_GAP };
    const clickX = clientX - hostRect.left;
    const clickY = clientY - hostRect.top;

    let nextX = clickX;
    let nextY = clickY;

    if (nextX + CONTEXT_MENU_WIDTH > hostRect.width - CONTEXT_MENU_GAP) {
      nextX = clickX - CONTEXT_MENU_WIDTH;
    }
    if (nextY + CONTEXT_MENU_HEIGHT > hostRect.height - CONTEXT_MENU_GAP) {
      nextY = clickY - CONTEXT_MENU_HEIGHT;
    }

    nextX = Math.max(CONTEXT_MENU_GAP, Math.min(nextX, Math.max(CONTEXT_MENU_GAP, hostRect.width - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GAP)));
    nextY = Math.max(CONTEXT_MENU_GAP, Math.min(nextY, Math.max(CONTEXT_MENU_GAP, hostRect.height - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_GAP)));
    return { x: nextX, y: nextY };
  };

  const openMessageMenu = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    const pointer = event.changedTouches?.[0] || event.touches?.[0] || event;
    const clientX = typeof pointer.clientX === "number" ? pointer.clientX : 140;
    const clientY = typeof pointer.clientY === "number" ? pointer.clientY : 240;
    const nextPosition = resolveContextMenuPosition(clientX, clientY);
    setContextMenu({ ...nextPosition, message });
  };

  const startLongPress = (event, message) => {
    const touchPoint = event.touches?.[0] || event.changedTouches?.[0];
    holdTimerRef.current = setTimeout(() => {
      openMessageMenu(
        touchPoint
          ? { ...event, clientX: touchPoint.clientX, clientY: touchPoint.clientY, preventDefault: () => {}, stopPropagation: () => {} }
          : event,
        message
      );
    }, 1000);
  };
  const cancelLongPress = () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); };

  const openViewer = (attachments, startIndex) => {
    setViewer({ attachments, index: startIndex });
    setViewerZoom(1);
  };
  const shiftViewer = (delta) => {
    setViewer((prev) => {
      if (!prev) return prev;
      const total = prev.attachments.length;
      const nextIndex = (prev.index + delta + total) % total;
      return { ...prev, index: nextIndex };
    });
    setViewerZoom(1);
  };

  const syncCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    const start = typeof el.selectionStart === "number" ? el.selectionStart : input.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    caretRef.current = { start, end };
  };

  const insertEmojiAtCaret = (emoji) => {
    const emojiChar = emoji?.native || "";
    if (!emojiChar) return;
    const current = input || "";
    const el = inputRef.current;
    const fallbackStart = typeof caretRef.current.start === "number" ? caretRef.current.start : current.length;
    const fallbackEnd = typeof caretRef.current.end === "number" ? caretRef.current.end : fallbackStart;
    const start = el && typeof el.selectionStart === "number" ? el.selectionStart : fallbackStart;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : fallbackEnd;
    const nextValue = `${current.slice(0, start)}${emojiChar}${current.slice(end)}`;
    const nextPos = start + emojiChar.length;
    setInput(nextValue);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(nextPos, nextPos);
      caretRef.current = { start: nextPos, end: nextPos };
    });
  };

  useEffect(() => {
    if (!emojiOpen) return;
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (emojiPickerRef.current?.contains(target)) return;
      if (emojiButtonRef.current?.contains(target)) return;
      setEmojiOpen(false);
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!emojiOpen || emojiPickerModule) return;
    let cancelled = false;
    Promise.all([import("@emoji-mart/react"), import("@emoji-mart/data")])
      .then(([pickerMod, dataMod]) => {
        if (cancelled) return;
        setEmojiPickerModule({ Picker: pickerMod.default, data: dataMod.default });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [emojiOpen, emojiPickerModule]);

  useEffect(() => {
    if (!activeChat?.id) return;
    setEmojiOpen(false);
  }, [activeChat?.id]);

  const isLightTheme = themeMode === "light";
  if (!activeChat) return <section className={`glass-panel grid h-full place-items-center rounded-2xl p-6 text-center ${isLightTheme ? "text-slate-900" : "text-white"}`}><p className="font-display text-xl">Select a chat</p></section>;
  const hasTypingText = input.trim().length > 0;
  const showSend = hasTypingText || files.length > 0;
  const blockedReason = blockedByThem ? "This user has blocked you" : blockedByMe ? "You have blocked this user" : "";

  return (
    <section ref={chatWindowRef} className={`glass-panel chat-window relative flex h-full w-full flex-col overflow-clip rounded-2xl md:w-[32%] md:min-w-[400px] md:max-w-[430px] ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-cyan-400/20 bg-[#081633]/90 text-slate-100"}`} style={{ overflow: "clip" }}>
      {offline ? <div className="bg-amber-500/15 px-3 py-1 text-center text-xs text-amber-200">Waiting for network <button onClick={() => window.location.reload()} className="ml-2 underline">Retry</button></div> : null}
      {selectMode ? (
        <div className={`flex items-center justify-between border-b px-3 py-2 text-sm ${isLightTheme ? "border-slate-200 bg-slate-50" : "border-cyan-400/20 bg-[#07152f]/90"}`}>
          <span className={`font-medium ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openDeletePromptForMessages(messages.filter((message) => selectedIds.includes(message._id)))}
              className={`rounded-lg border p-2 disabled:opacity-40 ${isLightTheme ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-400/30 bg-rose-500/15 text-rose-200"}`}
              disabled={selectedIds.length === 0}
              title="Delete selected messages"
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => { setSelectedIds([]); setSelectMode(false); }}
              className={`rounded-lg border px-2 py-1 text-xs ${isLightTheme ? "border-slate-300 text-slate-700" : "border-slate-700 text-slate-300"}`}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
      <header className={`chat-window-header relative flex items-center justify-between border-b px-4 py-3 ${isLightTheme ? "border-slate-200" : "border-cyan-400/20"}`}>
        <div className="flex items-center gap-2">
          {focused ? <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-slate-800"><ArrowLeft size={16} /></button> : null}
          <button className="flex items-center gap-3" onClick={onAvatarClick}><img loading="lazy" decoding="async" src={activeChat.partner.avatarUrl} alt={activeChat.partner.username} className="h-10 w-10 rounded-full object-cover" /><div><p className={`text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{activeChat.partner.displayName || activeChat.partner.fullName || activeChat.partner.username}</p><p className={`text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>{headerStatus}</p></div></button>
        </div>
        <div className={`${isLightTheme ? "text-slate-700" : "text-slate-300"} flex items-center gap-1`}>
          <button onClick={() => onStartCall?.("audio")} className={`rounded-lg p-1.5 ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`} title="Audio Call">
            <Phone size={15} />
          </button>
          <button onClick={() => onStartCall?.("video")} className={`rounded-lg p-1.5 ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`} title="Video Call">
            <Video size={15} />
          </button>
          <button
            ref={headerMenuButtonRef}
            onClick={() => setMenuOpen((s) => !s)}
            className={`rounded-lg p-1.5 ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}
            title="Menu"
          >
            <EllipsisVertical size={16} />
          </button>
        </div>
        {menuOpen ? (
          <div
            ref={headerMenuRef}
            className={`absolute right-2 top-12 z-[70] w-44 origin-top-right animate-[menuFadeIn_100ms_ease-out] rounded-xl border p-1 text-sm ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950/95 text-slate-100"}`}
          >
            <button onClick={() => { onViewProfile?.(); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>View Profile</button>
            {canMoveToPrimary ? (
              <button onClick={() => { onMoveBucket?.("primary"); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Move to Primary</button>
            ) : null}
            {canMoveToGeneral ? (
              <button onClick={() => { onMoveBucket?.("general"); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Move to General</button>
            ) : null}
            <button onClick={() => { onReportUser?.(activeChat.partner._id); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Report User</button>
            {blockedByMe ? (
              <button onClick={() => { onUnblockUser?.(activeChat.partner._id); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Unblock User</button>
            ) : (
              <button onClick={() => { onBlockUser?.(activeChat.partner._id); setMenuOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Block User</button>
            )}
          </div>
        ) : null}
      </header>

      <div ref={feedRef} onScroll={handleFeedScroll} className="chat-window-feed relative flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loadingMessages ? <p className="text-sm text-slate-500">Loading messages...</p> : null}
        {messages.filter((message) => !message?.isDeleted && !message?.deletedForEveryone).map((message) => {
          const mine = message.sender._id === currentUserId;
          const selected = selectedIds.includes(message._id);
          const tick = message.status === "seen"
            ? <CheckCheck size={13} className="text-blue-400" />
            : <CheckCheck size={13} className="text-slate-400" />;
          return (
            <article
              key={message._id}
              className={`group flex animate-[pop_160ms_ease-out] ${mine ? "items-end justify-end" : "items-start justify-start"}`}
              onClick={() => {
                if (selectMode) toggleMessageSelection(message._id);
              }}
              onContextMenu={(e) => openMessageMenu(e, message)}
              onTouchStart={(e) => { startLongPress(e, message); replySwipeStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                cancelLongPress();
                if (selectMode) return;
                const dx = e.changedTouches[0].clientX - replySwipeStartX.current;
                if (dx > 55) setReplyingTo(message);
              }}
              onDoubleClick={() => {
                if (!selectMode) setReplyingTo(message);
              }}
            >
              <div className={`chat-message-bubble relative inline-flex w-fit max-w-[75%] flex-col rounded-2xl border px-3 py-2 text-left ${selected ? `border-brandBlue/80 ring-2 ring-brandBlue/45 ${mine ? (isLightTheme ? "bg-blue-100" : "bg-brandBlue/20") : (isLightTheme ? "bg-slate-100" : "bg-slate-900/90")}` : mine ? (isLightTheme ? "border-blue-200 bg-blue-100" : "border-brandBlue/40 bg-brandBlue/20") : (isLightTheme ? "border-slate-200 bg-slate-100" : "border-slate-700/80 bg-slate-900/90")}`}>
                {message.text ? <p className={`break-words whitespace-pre-wrap text-sm leading-relaxed ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{message.text}</p> : null}
                {message.lockedMedia ? <p className="mt-2 text-xs text-amber-300">Media is hidden until this request is accepted.</p> : null}
                {message.attachments?.length ? (
                  <MessageAttachments attachments={message.attachments} onOpen={selectMode ? () => {} : openViewer} mine={mine} />
                ) : null}
                <div className={`pointer-events-none mt-0.5 flex items-center gap-1 self-end whitespace-nowrap text-[11px] leading-none ${isLightTheme ? "text-slate-500/90" : "text-slate-400/90"}`}>
                  <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {mine ? tick : null}
                </div>
              </div>
            </article>
          );
        })}
        {typing ? <p className={`text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>User is typing...</p> : null}
        <div ref={messagesEndRef} className="h-px w-full" />
      </div>

      {!isAtBottom && newMessageCount > 0 ? <button onClick={() => { scrollToMessagesEnd("smooth"); setNewMessageCount(0); }} className="absolute bottom-24 right-4 rounded-full bg-brandBlue px-3 py-1 text-xs text-white shadow-lg">{newMessageCount} New Messages</button> : null}
      {contextMenu ? (
        <div className={`absolute z-[45] w-44 rounded-xl border p-1 text-sm ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950/95 text-slate-100"}`} style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { setReplyingTo(contextMenu.message); setContextMenu(null); }} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Reply</button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.message.text || ""); setContextMenu(null); }} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Copy</button>
          <button onClick={() => { startSelectionMode(contextMenu.message); setContextMenu(null); }} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Select</button>
          <button onClick={() => { onInfo(contextMenu.message); setContextMenu(null); }} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Message Info</button>
          <button onClick={() => { openDeletePromptForMessages([contextMenu.message]); setContextMenu(null); }} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Delete</button>
          <button onClick={() => setContextMenu(null)} className={`block w-full rounded px-2 py-1.5 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Cancel</button>
        </div>
      ) : null}

      <footer className={`chat-window-footer border-t p-3 ${isLightTheme ? "border-slate-200" : "border-cyan-400/20"}`}>
        {blockedReason ? <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{blockedReason}</div> : null}
        {replyingTo && <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${isLightTheme ? "border-slate-200 bg-slate-50" : "border-slate-700 bg-slate-950/70"}`}><p className={`truncate ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>Replying to @{replyingTo.sender?.username || "user"}: {replyingTo.text || "Attachment"}</p><button className={`${isLightTheme ? "text-slate-500" : "text-slate-400"}`} onClick={() => setReplyingTo(null)}>X</button></div>}
        {files.length > 0 && (
          <div className={`mb-2 rounded-lg border px-3 py-2 text-xs ${isLightTheme ? "border-slate-200 bg-slate-50 text-slate-600" : "border-slate-700 bg-slate-950/70 text-slate-300"}`}>
            <p className="mb-2">{files.length} media selected</p>
            <div className="grid grid-cols-3 gap-2">
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className={`relative overflow-hidden rounded-lg border ${isLightTheme ? "border-slate-200" : "border-slate-700"}`}>
                  {file.type.startsWith("video/") ? (
                    <video controls src={URL.createObjectURL(file)} className="h-20 w-full object-cover" />
                  ) : (
                    <img src={URL.createObjectURL(file)} className="h-20 w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {isRecording ? (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-slate-950 px-2 py-2 shadow-[0_0_25px_rgba(34,211,238,0.16)]">
            <button type="button" onClick={cancelRecording} className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-rose-200" title="Delete recording"><Trash2 size={15} /></button>
            <div className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-2 py-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-cyan-200">
                <span>REC</span>
                <span>{formatDuration(recordingMs / 1000)}</span>
              </div>
              <canvas ref={waveformCanvasRef} width={260} height={28} className="h-8 w-full" />
            </div>
            <button type="button" onClick={stopRecording} className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-2 text-emerald-200" title="Stop and preview"><Send size={15} /></button>
          </div>
        ) : null}
        {recordedBlob ? (
          <div className="mb-2 rounded-2xl border border-slate-700 bg-slate-950/90 p-2">
            <VoicePreview blob={recordedBlob} durationMs={recordedDurationMs} onDelete={() => { setRecordedBlob(null); setRecordedDurationMs(0); }} onSend={sendRecordedAudio} />
          </div>
        ) : null}
        <form onSubmit={handleSend} className="flex h-11 min-h-[44px] w-full min-w-0 items-center justify-between gap-2">
          <button type="button" onClick={openCamera} className={`shrink-0 rounded-xl border p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-800" : "border-slate-700 bg-slate-900/70 text-slate-300"}`} title="Camera"><Camera size={17} /></button>
          <input ref={galleryFallbackRef} type="file" accept="image/*,video/*" capture="environment" multiple className="hidden" onChange={(e) => processMediaFiles(Array.from(e.target.files || []))} />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <textarea
              ref={inputRef}
              disabled={!!blockedReason}
              value={input}
              onChange={(event) => { setInput(event.target.value); syncCaret(); }}
              onClick={syncCaret}
              onKeyUp={syncCaret}
              onSelect={syncCaret}
              rows={1}
              placeholder={blockedReason || "Type a message..."}
              className={`chat-window-input h-10 min-h-[40px] max-h-[40px] w-full min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-sm leading-5 outline-none transition-all duration-200 ease-in-out disabled:opacity-60 ${isLightTheme ? "border-slate-300 bg-white text-slate-900 focus:border-cyan-300 placeholder:text-slate-500" : "border-slate-700 bg-slate-950/70 text-slate-100 focus:border-cyan-400 placeholder:text-slate-400"}`}
            />
            <div className={`flex h-10 items-center justify-end gap-2 overflow-hidden transition-all duration-200 ease-in-out ${hasTypingText ? "max-w-0 opacity-0 pointer-events-none" : "max-w-[84px] opacity-100"}`}>
              <button type="button" onClick={() => (isRecording ? stopRecording() : startRecording(0))} className={`rounded-xl border p-2 ${isRecording ? "bg-rose-500/25 text-rose-200 border-rose-400/40" : (isLightTheme ? "border-slate-300 bg-white text-slate-700" : "border-slate-700 bg-slate-900/70 text-slate-300")}`} title="Record"><Mic size={17} /></button>
              <label className={`cursor-pointer rounded-xl border p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-700" : "border-slate-700 bg-slate-900/70 text-slate-300"}`} title="Photos & videos"><ImageIcon size={17} /><input type="file" accept="image/*,video/*" className="hidden" multiple onChange={(e) => processMediaFiles(Array.from(e.target.files || []))} /></label>
            </div>
            <div className="relative shrink-0">
              <button
                ref={emojiButtonRef}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setEmojiOpen((open) => !open)}
                className={`rounded-xl border p-2 ${isLightTheme ? "border-slate-300 bg-white text-slate-700" : "border-slate-700 bg-slate-900/70 text-slate-300"}`}
                title="Emoji"
              >
                <Smile size={17} />
              </button>
              {emojiOpen ? (
                <div ref={emojiPickerRef} className="absolute bottom-12 right-0 z-[75] overflow-hidden rounded-2xl border shadow-2xl" style={{ borderColor: "var(--nexvocal-border)", backgroundColor: "var(--nexvocal-surface)" }}>
                  {emojiPickerModule?.Picker ? (
                    <emojiPickerModule.Picker
                      data={emojiPickerModule.data}
                      theme={isLightTheme ? "light" : "dark"}
                      onEmojiSelect={insertEmojiAtCaret}
                      previewPosition="none"
                      skinTonePosition="search"
                      perLine={8}
                      navPosition="bottom"
                    />
                  ) : (
                    <div className="grid h-[420px] w-[352px] place-items-center">
                      <Loader2 size={26} className="animate-spin" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <button type="submit" disabled={!!blockedReason} className={`shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white transition-all duration-200 ease-in-out disabled:opacity-40 ${showSend ? "w-10 p-2 opacity-100" : "pointer-events-none w-0 p-0 opacity-0"}`}><Send size={18} /></button>
          </div>
        </form>
      </footer>
      {messageInfo ? (
        <div className="absolute inset-0 z-[999]" onClick={() => onCloseMessageInfo?.()}>
          <div className="absolute inset-0 bg-black/28" />
          <div
            className={`absolute left-1/2 top-1/2 z-[1000] w-[50%] min-w-[180px] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-2.5 shadow-xl ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`}
            style={{ margin: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={`text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>Message Info</h3>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 rounded-lg px-1 py-1">
                <CheckCheck size={14} className={isLightTheme ? "text-slate-500" : "text-slate-400"} />
                <div>
                  <p className={`text-xs font-medium ${isLightTheme ? "text-slate-700" : "text-slate-200"}`}>Delivered</p>
                  <p className={`text-[11px] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>{messageInfo.deliveredAtText}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg px-1 py-1">
                <CheckCheck size={14} className="text-blue-400" />
                <div>
                  <p className={`text-xs font-medium ${isLightTheme ? "text-slate-700" : "text-slate-200"}`}>Read</p>
                  <p className={`text-[11px] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>{messageInfo.readAtText}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {cameraOpen ? (
        <div className="fixed inset-0 z-[120] bg-black">
          <video
            ref={videoPreviewRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover transition-opacity duration-200 ${cameraReady ? "opacity-100" : "opacity-0"}`}
          />
          {cameraLoading && !cameraReady ? (
            <div className="absolute inset-0 grid place-items-center bg-[#030a1d]/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-full border border-cyan-300/35 bg-black/20 text-cyan-100">
                  <Loader2 size={24} className="animate-spin" />
                </span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={closeCamera}
            className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-white/10 text-white backdrop-blur-md"
            title="Close camera"
          >
            <X size={18} />
          </button>
          <button
            type="button"
            onClick={flipCamera}
            disabled={cameraRecording || cameraLoading}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-white/10 text-white backdrop-blur-md disabled:opacity-45"
            title="Flip camera"
          >
            <RefreshCw size={18} />
          </button>
          {cameraError ? <p className="absolute top-14 w-full text-center text-xs text-rose-300">{cameraError}</p> : null}
          <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              disabled={cameraRecording}
              onClick={() => setCameraMode("photo")}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur-sm transition ${cameraMode === "photo" ? "border-white/80 bg-white/18 text-white" : "border-white/30 bg-black/18 text-slate-200"}`}
            >
              <span className="inline-flex items-center gap-1">
                <Camera size={13} />
                Photo
              </span>
            </button>
            <button
              type="button"
              disabled={cameraRecording}
              onClick={() => setCameraMode("video")}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur-sm transition ${cameraMode === "video" ? "border-white/80 bg-white/18 text-white" : "border-white/30 bg-black/18 text-slate-200"}`}
            >
              <span className="inline-flex items-center gap-1">
                <Video size={13} />
                Video
              </span>
            </button>
          </div>
          {cameraMode === "video" && cameraRecording ? (
            <div className="absolute bottom-24 left-0 right-0 text-center text-xs font-semibold tracking-wide text-rose-100">
              REC {formatDuration(cameraRecordingMs / 1000)}
            </div>
          ) : null}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button
              type="button"
              onClick={handleCameraPrimaryAction}
              className={`relative grid h-20 w-20 place-items-center rounded-full border-2 shadow-[0_0_0_4px_rgba(255,255,255,0.15)] transition ${cameraMode === "video" ? "border-rose-300/90 bg-white/10" : "border-white/85 bg-white/12"}`}
              title={cameraRecording ? "Stop recording" : cameraMode === "video" ? "Start recording" : "Take photo"}
            >
              {cameraMode === "photo" ? (
                <span className="h-14 w-14 rounded-full border border-white/90 bg-white" />
              ) : (
                <>
                  {cameraRecording ? <span className="absolute h-14 w-14 rounded-full bg-rose-400/45 animate-ping" /> : null}
                  <span className={`h-14 w-14 rounded-full bg-rose-500 transition ${cameraRecording ? "scale-90" : "scale-100"}`} />
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
      {deletePrompt ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4" onClick={cancelDeletePrompt}>
          <div className={`w-full max-w-xs rounded-2xl border p-3 ${isLightTheme ? "border-slate-200 bg-white text-slate-900" : "border-slate-700 bg-slate-950 text-slate-100"}`} onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-semibold">{deletePromptTargets.length > 1 ? `Delete ${deletePromptTargets.length} messages` : "Delete message"}</p>
            {deletePrompt?.canDeleteForEveryone ? (
              <button onClick={() => handleDeleteSelection("everyone")} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Delete for Everyone</button>
            ) : null}
            <button onClick={() => handleDeleteSelection("me")} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Delete for Me</button>
            <button onClick={cancelDeletePrompt} className={`block w-full rounded-lg px-3 py-2 text-left ${isLightTheme ? "hover:bg-slate-100" : "hover:bg-slate-800"}`}>Cancel</button>
          </div>
        </div>
      ) : null}
      {viewer ? <FullscreenMediaViewer viewer={viewer} onClose={() => setViewer(null)} onShift={shiftViewer} zoom={viewerZoom} setZoom={setViewerZoom} themeMode={themeMode} /> : null}
    </section>
  );
}

function getMediaCount(media) {
  let images = media.filter((m) => m.type === "image").length;
  let videos = media.filter((m) => m.type === "video").length;
  const imageText = images === 1 ? "1 photo" : `${images} photos`;
  const videoText = videos === 1 ? "1 video" : `${videos} videos`;
  if (images > 0 && videos > 0) return `${imageText} and ${videoText}`;
  if (images > 0) return imageText;
  return videoText;
}

function MessageAttachments({ attachments, onOpen, mine }) {
  const audioAttachments = attachments.filter((item) => item.fileType?.startsWith("audio/"));
  const mediaAttachments = attachments.filter((item) => item.fileType?.startsWith("image/") || item.fileType?.startsWith("video/"));
  const mediaGroup = useMemo(() => ({
    type: "media_group",
    items: mediaAttachments.map((item) => ({
      type: item.fileType?.startsWith("video/") ? "video" : "image",
      url: item.url,
      fileType: item.fileType
    }))
  }), [mediaAttachments]);
  return (
    <>
      {mediaGroup.items.length ? <StackedMediaGroup mediaGroup={mediaGroup} mine={mine} onOpen={onOpen} /> : null}
      {audioAttachments.map((attachment, index) => (
        <div key={`${attachment.url}-${index}`} className="mt-2">
          <VoiceMessageBubble url={attachment.url} />
        </div>
      ))}
    </>
  );
}

function MediaImageCard({ src, alt = "media" }) {
  const [loaded, setLoaded] = useState(() => cachedMediaUrls.has(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(cachedMediaUrls.has(src));
    setFailed(false);
  }, [src]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900">
      {!loaded && !failed ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800" />
      ) : null}
      {!failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className={`h-full w-full object-cover transition-all duration-300 ${loaded ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-md"}`}
          onLoad={() => {
            cachedMediaUrls.add(src);
            setLoaded(true);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-slate-900/95 px-3 text-center text-xs text-slate-300">
          Image unavailable
        </div>
      )}
    </div>
  );
}

function MediaVideoCard({ src }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900">
      {!loaded && !failed ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800" />
      ) : null}
      {!failed ? (
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoadedData={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-slate-900/95 px-3 text-center text-xs text-slate-300">
          Video unavailable
        </div>
      )}
    </div>
  );
}

function StackedMediaGroup({ mediaGroup, mine, onOpen }) {
  const [orderedItems, setOrderedItems] = useState(mediaGroup.items);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);

  useEffect(() => {
    setOrderedItems(mediaGroup.items);
  }, [mediaGroup.items]);

  const rotateForward = () => {
    setOrderedItems((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
  };

  const rotateBackward = () => {
    setOrderedItems((prev) => (prev.length > 1 ? [prev[prev.length - 1], ...prev.slice(0, -1)] : prev));
  };

  const onSwipeEnd = (endX) => {
    const delta = endX - startXRef.current;
    setDragOffset(0);
    if (Math.abs(delta) < 30) return;
    if (delta < 0) rotateForward();
    else rotateBackward();
  };

  const attachmentItems = orderedItems.map((item) => ({ url: item.url, fileType: item.fileType }));
  const countText = getMediaCount(orderedItems);

  return (
    <div className="mt-2 flex flex-col items-center">
      <p className="mb-3 text-center text-[13px] text-slate-300">{mine ? `You sent ${countText}` : `${countText} received`}</p>
      <div
        className="relative h-[290px] w-[240px] touch-pan-y"
        onMouseDown={(e) => {
          setDragging(true);
          startXRef.current = e.clientX;
        }}
        onMouseMove={(e) => {
          if (!dragging) return;
          setDragOffset(e.clientX - startXRef.current);
        }}
        onMouseUp={(e) => {
          if (!dragging) return;
          onSwipeEnd(e.clientX);
          setDragging(false);
        }}
        onMouseLeave={(e) => {
          if (!dragging) return;
          onSwipeEnd(e.clientX);
          setDragging(false);
        }}
        onTouchStart={(e) => {
          startXRef.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          setDragOffset(e.touches[0].clientX - startXRef.current);
        }}
        onTouchEnd={(e) => {
          onSwipeEnd(e.changedTouches[0].clientX);
        }}
      >
        {orderedItems.slice(0, 3).map((item, index) => {
          const zIndex = 30 - index;
          const transforms = [
            `translate(${Math.max(-24, Math.min(24, dragOffset * 0.24))}px, 0px) rotate(0deg) scale(1)`,
            "translate(18px, -10px) rotate(9deg) scale(0.96)",
            "translate(-16px, -18px) rotate(-8deg) scale(0.93)"
          ];
          const cardTransform = transforms[index] || "translate(0, 0) rotate(0deg) scale(1)";
          return (
            <button
              key={`${item.url}-${index}`}
              type="button"
              onClick={() => onOpen(attachmentItems, index)}
              className="absolute left-0 top-0 h-[270px] w-[220px] min-h-[220px] overflow-hidden rounded-[26px] border border-slate-800/80 bg-slate-900 shadow-[0_24px_45px_rgba(2,6,23,0.58)] transition-transform duration-300"
              style={{ transform: cardTransform, zIndex }}
            >
              {item.type === "video" ? (
                <MediaVideoCard src={item.url} />
              ) : (
                <MediaImageCard src={item.url} alt="chat media" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VoicePreview({ blob, durationMs, onDelete, onSend }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  if (!url) return null;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onDelete} className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-rose-200"><Trash2 size={15} /></button>
      <div className="min-w-0 flex-1">
        <VoiceMessageBubble url={url} durationOverride={durationMs ? Math.round(durationMs / 1000) : null} />
      </div>
      <button type="button" onClick={onSend} className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-2 text-emerald-200"><Send size={15} /></button>
    </div>
  );
}

function VoiceMessageBubble({ url, durationOverride = null }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationOverride || 0);
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const waveRef = useRef(null);
  const scrubbingRef = useRef(false);
  const pointerIdRef = useRef(null);
  const bars = useMemo(() => Array.from({ length: 44 }, (_, i) => {
    const base = 0.22 + (Math.sin(i * 0.68) + 1) * 0.2 + (Math.cos(i * 0.37) + 1) * 0.09;
    return Math.min(1, base);
  }), []);

  useEffect(() => {
    if (durationOverride != null) setDuration(durationOverride);
  }, [durationOverride]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const updateProgress = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = audio.duration ? audio.currentTime / audio.duration : 0;
    setProgress(value);
    if (!audio.paused && !audio.ended) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch(() => {});
      setPlaying(true);
      rafRef.current = requestAnimationFrame(updateProgress);
    } else {
      audio.pause();
      setPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  };

  const resolveDuration = () => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
    return 0;
  };

  const seekToRatio = (ratio) => {
    const audio = audioRef.current;
    const effectiveDuration = resolveDuration();
    if (!audio || effectiveDuration <= 0) return;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const nextTime = effectiveDuration * clampedRatio;
    audio.currentTime = nextTime;
    setProgress(clampedRatio);
  };

  const ratioFromClientX = (clientX) => {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const handleScrubStart = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    scrubbingRef.current = true;
    pointerIdRef.current = event.pointerId;
    waveRef.current?.setPointerCapture?.(event.pointerId);
    seekToRatio(ratioFromClientX(event.clientX));
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const handleScrubMove = (event) => {
    if (!scrubbingRef.current) return;
    if (pointerIdRef.current != null && event.pointerId !== pointerIdRef.current) return;
    seekToRatio(ratioFromClientX(event.clientX));
  };

  const handleScrubEnd = (event) => {
    if (!scrubbingRef.current) return;
    if (pointerIdRef.current != null && event.pointerId !== pointerIdRef.current) return;
    seekToRatio(ratioFromClientX(event.clientX));
    scrubbingRef.current = false;
    pointerIdRef.current = null;
    waveRef.current?.releasePointerCapture?.(event.pointerId);
    if (playing) rafRef.current = requestAnimationFrame(updateProgress);
  };

  const formatVoiceDuration = (totalSeconds) => {
    const safe = Math.max(0, Math.round(totalSeconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const progressPercent = `${Math.max(0, Math.min(100, progress * 100))}%`;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-2 py-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = Number(event.currentTarget.duration || 0);
          setDuration(nextDuration > 0 ? nextDuration : 0);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio || scrubbingRef.current) return;
          const resolved = resolveDuration();
          const next = resolved > 0 ? audio.currentTime / resolved : 0;
          setProgress(Math.max(0, Math.min(1, next)));
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }}
      />
      <button type="button" onClick={togglePlayback} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-1.5 text-cyan-200">
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div
        ref={waveRef}
        className="relative flex h-8 min-w-0 flex-1 cursor-pointer touch-none select-none items-end gap-[2px]"
        onPointerDown={handleScrubStart}
        onPointerMove={handleScrubMove}
        onPointerUp={handleScrubEnd}
        onPointerCancel={handleScrubEnd}
        onPointerLeave={(event) => {
          if (!scrubbingRef.current || event.pointerType !== "mouse") return;
          handleScrubEnd(event);
        }}
      >
        {bars.map((bar, i) => {
          const ratio = bars.length > 1 ? i / (bars.length - 1) : 0;
          const active = ratio <= progress;
          const waveMotion = playing ? (Math.sin((Date.now() / 150) + i) + 1) * 0.06 : 0;
          const height = 6 + (bar + waveMotion) * 16;
          return <span key={i} style={{ height: `${height}px` }} className={`w-[3px] rounded-full transition-colors duration-100 ${active ? "bg-cyan-300" : "bg-slate-600"}`} />;
        })}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1]" style={{ width: progressPercent }}>
          <span className="absolute inset-y-0 right-0 w-[2px] rounded-full bg-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
        </div>
      </div>
      <span className="w-10 text-right text-[11px] text-slate-300">{formatVoiceDuration(duration)}</span>
    </div>
  );
}

function FullscreenMediaViewer({ viewer, onClose, onShift, zoom, setZoom, themeMode = "dark" }) {
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const pinchRef = useRef(null);
  const pointerStartRef = useRef(null);
  const current = viewer.attachments[viewer.index];
  const isLightTheme = themeMode === "light";
  const overlayClass = isLightTheme ? "bg-black/[0.85]" : "bg-black/[0.92]";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onShift(1);
      if (e.key === "ArrowLeft") onShift(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onShift]);

  useEffect(() => {
    const preload = (idx) => {
      const item = viewer.attachments[(idx + viewer.attachments.length) % viewer.attachments.length];
      if (item?.fileType?.startsWith("image/")) {
        const img = new Image();
        img.src = item.url;
      }
    };
    preload(viewer.index + 1);
    preload(viewer.index - 1);
  }, [viewer]);

  const pinchDist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  return (
    <div
      className={`fixed inset-0 z-[1200] ${overlayClass}`}
      onWheel={(e) => {
        e.preventDefault();
        const dz = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom((z) => Math.max(1, Math.min(3, z + dz)));
      }}
      onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          startXRef.current = e.touches[0].clientX;
          startYRef.current = e.touches[0].clientY;
        }
        if (e.touches.length === 2) pinchRef.current = pinchDist(e.touches[0], e.touches[1]);
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && pinchRef.current) {
          const curr = pinchDist(e.touches[0], e.touches[1]);
          const ratio = curr / pinchRef.current;
          setZoom((z) => Math.max(1, Math.min(3, z * ratio)));
          pinchRef.current = curr;
        }
      }}
      onTouchEnd={(e) => {
        if (startXRef.current != null && startYRef.current != null && e.changedTouches?.[0]) {
          const dx = e.changedTouches[0].clientX - startXRef.current;
          const dy = e.changedTouches[0].clientY - startYRef.current;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) onShift(dx < 0 ? 1 : -1);
          if (dy > 80 && Math.abs(dy) > Math.abs(dx)) onClose();
        }
        startXRef.current = null;
        startYRef.current = null;
        pinchRef.current = null;
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!pointerStartRef.current) return;
        const dx = e.clientX - pointerStartRef.current.x;
        const dy = e.clientY - pointerStartRef.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) onShift(dx < 0 ? 1 : -1);
        if (dy > 100 && Math.abs(dy) > Math.abs(dx)) onClose();
        pointerStartRef.current = null;
      }}
      onPointerCancel={() => {
        pointerStartRef.current = null;
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close viewer"
        className="absolute right-4 top-4 z-[1201] grid h-9 w-9 place-items-center rounded-full bg-black/20 text-white hover:bg-black/35 hover:text-white"
      >
        <X size={20} strokeWidth={2.5} />
      </button>
      <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-center p-6 text-center">
        {current.fileType?.startsWith("video/") ? (
          <video controls autoPlay src={current.url} className="max-h-[84vh] w-full object-contain" />
        ) : (
          <img src={current.url} className="max-h-[84vh] w-full object-contain transition-transform duration-200" style={{ transform: `scale(${zoom})` }} />
        )}
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 text-xs font-medium tracking-wide text-white/95">{viewer.index + 1} / {viewer.attachments.length}</div>
    </div>
  );
}

