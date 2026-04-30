import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CheckCheck, EllipsisVertical, Image as ImageIcon, Mic, Phone, Plus, Send, Smile } from "lucide-react";

export default function ChatWindow({ focused = false, onBack, activeChat, blockedByMe, blockedByThem, messages, currentUserId, onAvatarClick, onViewProfile, onMoveBucket, onSend, onDelete, onEdit, onMarkSeen, onInfo, onBlockUser, onReportUser, onUnblockUser, onTyping, typing, replyingTo, setReplyingTo, loadingMessages }) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const feedRef = useRef(null);
  const mediaRecorderRef = useRef(null);
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

  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    window.addEventListener("click", closeMenu);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
      window.removeEventListener("click", closeMenu);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
      audioContextRef.current?.close?.();
    };
  }, []);

  useEffect(() => {
    const view = feedRef.current;
    if (!view) return;
    const nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 64;
    if (nearBottom) {
      view.scrollTop = view.scrollHeight;
      setIsAtBottom(true);
      setNewMessageCount(0);
    } else {
      setIsAtBottom(false);
      if (messages.length > 0) setNewMessageCount((c) => c + 1);
    }
  }, [messages, activeChat?.id]);

  const handleFeedScroll = () => {
    const view = feedRef.current;
    if (!view) return;
    const nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 64;
    setIsAtBottom(nearBottom);
    if (nearBottom) setNewMessageCount(0);
  };

  useEffect(() => { if (activeChat?.id) onMarkSeen(activeChat.id); }, [activeChat?.id, onMarkSeen]);
  useEffect(() => { if (!activeChat?.id || !onTyping) return; const id = setTimeout(() => onTyping(activeChat.id, Boolean(input.trim())), 120); return () => clearTimeout(id); }, [input, activeChat?.id, onTyping]);

  const headerStatus = useMemo(() => {
    if (activeChat?.partner?.activeStatus === false) return "";
    if (activeChat?.partner?.online) return "Online";
    if (activeChat?.partner?.lastSeenAt) return `Last seen at ${new Date(activeChat.partner.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return "";
  }, [activeChat?.partner?.online, activeChat?.partner?.activeStatus, activeChat?.partner?.lastSeenAt]);

  const compressImages = async (chosenFiles) => {
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
    setFiles(out);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (blockedByMe || blockedByThem) return;
    const payloadFiles = [...files, ...(recordedBlob ? [new File([recordedBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" })] : [])];
    if (!input.trim() && payloadFiles.length === 0) return;
    await onSend({ text: input.trim(), files: payloadFiles, conversationId: activeChat.id, replyTo: replyingTo?._id || null });
    setInput(""); setFiles([]); setRecordedBlob(null); setReplyingTo(null);
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
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#60a5fa";
      const slice = canvas.width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 2) {
        const y = (data[i] / 255) * canvas.height;
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
    recordingStartX.current = startX;
    recordingCancelledRef.current = false;
    setSlideOffset(0);
    setRecordingMs(0);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = () => {
      if (!recordingCancelledRef.current) setRecordedBlob(new Blob(audioChunksRef.current, { type: "audio/webm" }));
      stream.getTracks().forEach((t) => t.stop());
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
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
    recordingIntervalRef.current = setInterval(() => setRecordingMs((ms) => ms + 100), 100);
    setTimeout(drawWaveform, 0);
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
    stopRecording();
  };

  const handleVoicePointerDown = async (event) => {
    event.preventDefault();
    await startRecording(event.clientX || 0);
  };
  const handleVoicePointerMove = (event) => {
    if (!isRecording) return;
    const delta = Math.min(0, (event.clientX || 0) - recordingStartX.current);
    setSlideOffset(Math.max(-140, delta));
    if (delta < -110) recordingCancelledRef.current = true;
  };
  const handleVoicePointerUp = () => {
    if (!isRecording) return;
    if (recordingCancelledRef.current || slideOffset < -110) cancelRecording();
    else stopRecording();
  };

  const openMessageMenu = (event, message) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX || 140, y: event.clientY || 240, message }); };
  const startLongPress = (event, message) => { holdTimerRef.current = setTimeout(() => openMessageMenu(event.changedTouches?.[0] ? { ...event, clientX: event.changedTouches[0].clientX, clientY: event.changedTouches[0].clientY, preventDefault: () => {}, stopPropagation: () => {} } : event, message), 2000); };
  const cancelLongPress = () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); };

  if (!activeChat) return <section className="glass-panel grid h-full place-items-center rounded-2xl p-6 text-center"><p className="font-display text-xl text-white">Select a chat</p></section>;
  const showSend = input.trim().length > 0 || files.length > 0 || recordedBlob;
  const blockedReason = blockedByThem ? "This user has blocked you" : blockedByMe ? "You have blocked this user" : "";

  return (
    <section className="glass-panel relative flex h-full flex-col overflow-hidden rounded-2xl">
      {offline ? <div className="bg-amber-500/15 px-3 py-1 text-center text-xs text-amber-200">Waiting for network <button onClick={() => window.location.reload()} className="ml-2 underline">Retry</button></div> : null}
      {selectMode ? <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-sm"><span>{selectedIds.length} selected</span><button onClick={async () => { await Promise.all(selectedIds.map((id) => onDelete(id, "me"))); setSelectedIds([]); setSelectMode(false); }} className="rounded bg-rose-500/20 px-2 py-1">Delete</button></div> : null}
      <header className="relative flex items-center justify-between border-b border-slate-800/90 px-4 py-3">
        <div className="flex items-center gap-2">
          {focused ? <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-slate-800"><ArrowLeft size={16} /></button> : null}
          <button className="flex items-center gap-3" onClick={onAvatarClick}><img src={activeChat.partner.avatarUrl} alt={activeChat.partner.username} className="h-10 w-10 rounded-full" /><div><p className="text-sm font-semibold text-slate-100">{activeChat.partner.displayName || activeChat.partner.fullName || activeChat.partner.username}</p><p className="text-xs text-slate-400">{headerStatus}</p></div></button>
        </div>
        <div className="flex items-center gap-1 text-slate-300"><button className="rounded-lg p-1.5 hover:bg-slate-800" title="Call"><Phone size={15} /></button><button onClick={() => setMenuOpen((s) => !s)} className="rounded-lg p-1.5 hover:bg-slate-800" title="Menu"><EllipsisVertical size={16} /></button></div>
        {menuOpen ? <div className="absolute right-2 top-12 z-20 w-44 rounded-xl border border-slate-700 bg-slate-950/95 p-1 text-sm"><button onClick={() => { onViewProfile?.(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">View Profile</button><button onClick={() => { onMoveBucket?.("primary"); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">Move to Primary</button><button onClick={() => { onMoveBucket?.("general"); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">Move to General</button><button onClick={() => { onReportUser?.(activeChat.partner._id); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">Report User</button>{blockedByMe ? <button onClick={() => { onUnblockUser?.(activeChat.partner._id); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">Unblock User</button> : <button onClick={() => { onBlockUser?.(activeChat.partner._id); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800">Block User</button>}</div> : null}
      </header>

      <div ref={feedRef} onScroll={handleFeedScroll} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loadingMessages ? <p className="text-sm text-slate-500">Loading messages...</p> : null}
        {messages.map((message) => {
          const mine = message.sender._id === currentUserId;
          const selected = selectedIds.includes(message._id);
          const tick = message.status === "seen" ? <CheckCheck size={13} className="text-blue-400" /> : message.status === "delivered" ? <CheckCheck size={13} className="text-slate-400" /> : <Check size={13} className="text-slate-400" />;
          return (
            <article
              key={message._id}
              className={`group flex animate-[pop_160ms_ease-out] ${mine ? "justify-end" : "justify-start"}`}
              onContextMenu={(e) => openMessageMenu(e, message)}
              onTouchStart={(e) => { startLongPress(e, message); replySwipeStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                cancelLongPress();
                const dx = e.changedTouches[0].clientX - replySwipeStartX.current;
                if (dx > 55) setReplyingTo(message);
              }}
              onDoubleClick={() => setReplyingTo(message)}
            >
              <div className={`max-w-[82%] rounded-2xl border px-3 py-2 ${mine ? "border-brandBlue/40 bg-brandBlue/20" : "border-slate-700/80 bg-slate-900/90"}`}>
                {selectMode ? <label className="mb-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={selected} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, message._id] : prev.filter((x) => x !== message._id))} />Select</label> : null}
                {message.text ? <p className="break-words text-sm text-slate-100">{message.text}</p> : null}
                {message.attachments?.[0]?.url ? (message.attachments[0].fileType?.startsWith("audio/") ? <audio controls src={message.attachments[0].url} className="mt-2 w-full" /> : <img src={message.attachments[0].url} className="mt-2 max-h-56 w-full rounded-xl object-cover" />) : null}
                <div className="mt-1 flex justify-end gap-2 text-[11px] text-slate-400"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{mine ? tick : null}</div>
              </div>
            </article>
          );
        })}
        {typing ? <p className="text-xs text-slate-400">User is typing...</p> : null}
      </div>

      {!isAtBottom && newMessageCount > 0 ? <button onClick={() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; setNewMessageCount(0); }} className="absolute bottom-24 right-4 rounded-full bg-brandBlue px-3 py-1 text-xs text-white shadow-lg">{newMessageCount} New Messages</button> : null}
      {contextMenu ? <div className="fixed z-50 w-40 rounded-xl border border-slate-700 bg-slate-950/95 p-1 text-sm" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={() => { setReplyingTo(contextMenu.message); setContextMenu(null); }} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800">Reply</button><button onClick={() => { navigator.clipboard.writeText(contextMenu.message.text || ""); setContextMenu(null); }} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800">Copy</button><button onClick={() => { onDelete(contextMenu.message._id, "everyone"); setContextMenu(null); }} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800">Unsend</button><button onClick={() => { onInfo(contextMenu.message._id); setContextMenu(null); }} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800">Message Info</button><button onClick={() => { setSelectMode(true); setContextMenu(null); }} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800">Select</button></div> : null}

      <footer className="border-t border-slate-800/90 p-3">
        {blockedReason ? <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{blockedReason}</div> : null}
        {replyingTo && <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs"><p className="truncate text-slate-300">Replying to @{replyingTo.sender?.username || "user"}: {replyingTo.text || "Attachment"}</p><button className="text-slate-400" onClick={() => setReplyingTo(null)}>X</button></div>}
        {files.length > 0 && <div className="mb-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{files.length} media selected</div>}
        {isRecording ? (
          <div className="mb-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
            <div className="flex items-center justify-between">
              <span>{(recordingMs / 1000).toFixed(1)}s</span>
              <span className="transition-transform" style={{ transform: `translateX(${slideOffset}px)` }}>Slide left to cancel</span>
            </div>
            <canvas ref={waveformCanvasRef} width={260} height={28} className="mt-1 w-full" />
          </div>
        ) : null}
        {recordedBlob ? <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Voice clip ready</div> : null}
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900/70 p-2 text-slate-300" title="Camera"><Camera size={17} /><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => compressImages(Array.from(e.target.files || []))} /></label>
          <textarea disabled={!!blockedReason} value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder={blockedReason || "Type a message..."} className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brandBlue disabled:opacity-60" />
          {!showSend ? <><button type="button" onPointerDown={handleVoicePointerDown} onPointerMove={handleVoicePointerMove} onPointerUp={handleVoicePointerUp} onPointerCancel={cancelRecording} className={`rounded-xl border border-slate-700 p-2 ${isRecording ? "bg-rose-500/25 text-rose-200" : "bg-slate-900/70 text-slate-300"}`} title="Hold to record"><Mic size={17} /></button><label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900/70 p-2 text-slate-300" title="Photos"><ImageIcon size={17} /><input type="file" accept="image/*" className="hidden" multiple onChange={(e) => compressImages(Array.from(e.target.files || []))} /></label><button type="button" className="rounded-xl border border-slate-700 bg-slate-900/70 p-2 text-slate-300" title="Emoji"><Smile size={17} /></button><label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900/70 p-2 text-slate-300" title="More"><Plus size={17} /><input type="file" className="hidden" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label></> : <button disabled={!!blockedReason} className="rounded-xl bg-gradient-to-r from-brandBlue to-electric p-2 text-white disabled:opacity-40"><Send size={18} /></button>}
        </form>
      </footer>
    </section>
  );
}
