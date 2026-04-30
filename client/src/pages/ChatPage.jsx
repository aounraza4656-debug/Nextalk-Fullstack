import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Bell, EllipsisVertical, MessageCircle, Moon, Phone, Sun, Users } from "lucide-react";
import ChatWindow from "../components/chat/ChatWindow";
import { chatApi } from "../api/chat";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";

const navItems = [
  { id: "chats", label: "Chats", Icon: MessageCircle },
  { id: "groups", label: "Groups", Icon: Users },
  { id: "updates", label: "Updates", Icon: Bell },
  { id: "calls", label: "Calls", Icon: Phone }
];
const cycleModes = ["light", "dark", "system"];

export default function ChatPage() {
  const { user, logout, saveProfile, saveSettings } = useAuth();
  const [chats, setChats] = useState([]);
  const [stories, setStories] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConversation, setMessagesByConversation] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [tab, setTab] = useState("primary");
  const [mainNav, setMainNav] = useState("chats");
  const [newQuery, setNewQuery] = useState("");
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [messageInfo, setMessageInfo] = useState(null);
  const [typingState, setTypingState] = useState({});
  const [relationship, setRelationship] = useState("none");
  const [profileView, setProfileView] = useState(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const refreshConversations = useCallback(async () => {
    const { data } = await chatApi.getConversations();
    setChats(data.conversations.map((conv) => ({ ...conv, id: conv._id })));
  }, []);

  const refreshMeta = useCallback(async () => {
    const [storiesRes, activeRes, blockedRes, incomingRes] = await Promise.all([
      chatApi.getStories(),
      chatApi.getActiveUsers(),
      chatApi.getBlockedUsers(),
      chatApi.getIncomingFriendRequests()
    ]);
    setStories(storiesRes.data.stories);
    setActiveUsers(activeRes.data.users);
    setBlockedUsers(blockedRes.data.blockedUsers);
    setIncomingRequests(incomingRes.data.requests || []);
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
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: data.messages }));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeConversationId) loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  const socketRef = useSocket(user, {
    onPresence: ({ userId, online }) => setChats((prev) => prev.map((c) => (c.partner._id === userId ? { ...c, partner: { ...c.partner, online } } : c))),
    onMessage: (message) => {
      setMessagesByConversation((prev) => ({ ...prev, [message.conversationId]: [...(prev[message.conversationId] || []), message] }));
      setChats((prev) => prev.map((c) => {
        if (c.id !== message.conversationId) return c;
        const incoming = message.sender?._id !== user.id;
        return { ...c, unreadCount: incoming ? (c.unreadCount || 0) + 1 : c.unreadCount, lastMessage: { text: message.text?.trim() || (incoming ? "Got a new message" : "You have a new message") } };
      }));
    },
    onMessageUpdated: ({ conversationId, message }) => setMessagesByConversation((prev) => ({ ...prev, [conversationId]: (prev[conversationId] || []).map((m) => (m._id === message._id ? { ...m, ...message } : m)) })),
    onTyping: ({ conversationId, userId, typing }) => setTypingState((prev) => ({ ...prev, [conversationId]: typing && userId !== user.id })),
    onSocialUpdate: async () => { await refreshMeta(); if (activeConversationId) { const { data } = await chatApi.getRelationship(chats.find((c) => c.id === activeConversationId)?.partner?._id); setRelationship(data.status); } }
  });

  const activeChat = useMemo(() => chats.find((item) => item.id === activeConversationId), [chats, activeConversationId]);
  const visibleChats = useMemo(() => chats.filter((c) => (tab === "unread" ? c.unreadCount > 0 && c.bucket !== "requests" : c.bucket === tab)).filter((c) => c.visible !== false), [chats, tab]);

  useEffect(() => {
    if (!activeChat?.partner?._id) return;
    chatApi.getRelationship(activeChat.partner._id).then(({ data }) => setRelationship(data.status)).catch(() => setRelationship("none"));
  }, [activeChat?.partner?._id, incomingRequests]);

  const sendMessage = useCallback(async ({ text, files, conversationId, replyTo }) => {
    const form = new FormData();
    form.append("conversationId", conversationId);
    if (text) form.append("text", text);
    (files || []).forEach((file) => form.append("files", file));
    if (replyTo) form.append("replyTo", replyTo);
    await chatApi.sendMessage(form);
  }, []);

  const currentMode = user.theme?.mode === "dark" ? "dark" : user.theme?.mode === "light" ? "light" : "system";
  const cycleTheme = () => {
    const idx = cycleModes.indexOf(currentMode);
    saveSettings({ theme: { mode: cycleModes[(idx + 1) % cycleModes.length] } });
  };

  if (profileView) {
    const isOwn = profileView.id === user.id;
    return (
      <main className="h-screen overflow-hidden p-4">
        <section className="mx-auto flex h-full w-full max-w-[1200px] flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <button onClick={() => setProfileView(null)} className="mb-3 flex items-center gap-2 text-sm"><ArrowLeft size={16} /> Back</button>
          <div className="mx-auto mt-2 max-w-md text-center">
            <img src={profileView.avatarUrl} className="mx-auto h-40 w-40 rounded-full object-cover" />
            <h2 className="mt-3 text-xl font-semibold">@{profileView.username}</h2>
            <p className="text-sm text-slate-400">{profileView.bio || "No bio yet."}</p>
            <div className="mt-4 flex justify-center gap-2">
              {isOwn ? <><label className="rounded-lg bg-brandBlue/30 px-3 py-1.5 text-sm cursor-pointer">Change Photo<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const form = new FormData(); form.append("avatar", f); await saveProfile(form); toast.success("Photo updated"); }} /></label><button onClick={async () => { await saveProfile({ removeAvatar: true }); toast.success("Photo removed"); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm">Remove Photo</button></> : <SocialButtons relationship={relationship} onRequest={async () => { try { await chatApi.sendFriendRequest(profileView.id); await refreshMeta(); setRelationship("pending"); } catch (e) { toast.error(e.response?.data?.message || "Unable to send request"); } }} onRespond={async (action) => { await chatApi.respondFriendRequest(profileView.id, action); await refreshMeta(); setRelationship("none"); }} onCancel={async () => { await chatApi.cancelFriendRequest(profileView.id); setRelationship("none"); }} onUnfriend={async () => { await chatApi.unfriendUser(profileView.id); setRelationship("none"); }} />}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (activeConversationId && activeChat) {
    return (
      <main className="h-screen overflow-hidden p-0">
        <section className="mx-auto flex h-full w-full max-w-[1200px] overflow-hidden">
          <ChatWindow
            focused
            onBack={() => setActiveConversationId(null)}
            activeChat={activeChat}
            blockedByMe={activeChat?.blockedByMe}
            blockedByThem={activeChat?.blockedByThem}
            messages={messagesByConversation[activeConversationId] || []}
            currentUserId={user.id}
            onAvatarClick={() => setProfileView({ ...activeChat.partner, id: activeChat.partner._id })}
            onViewProfile={() => setProfileView({ ...activeChat.partner, id: activeChat.partner._id })}
            onMoveBucket={(bucket) => chatApi.updateConversationBucket(activeChat.id, bucket).then(refreshConversations)}
            onSend={sendMessage}
            onDelete={(id, mode) => chatApi.deleteMessage(id, mode)}
            onEdit={(id, text) => chatApi.editMessage(id, text)}
            onMarkSeen={(id) => chatApi.markSeen(id)}
            onInfo={async (id) => { const { data } = await chatApi.getMessageInfo(id); setMessageInfo(data.info); }}
            onBlockUser={(userId) => chatApi.blockUser(userId).then(async () => { await refreshMeta(); await refreshConversations(); })}
            onUnblockUser={(userId) => chatApi.unblockUser(userId).then(async () => { await refreshMeta(); await refreshConversations(); })}
            onReportUser={(userId) => chatApi.reportUser(userId, "abuse")}
            onTyping={(conversationId, isTyping) => socketRef.current?.emit(isTyping ? "typing:start" : "typing:stop", { conversationId })}
            typing={typingState[activeConversationId]}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            loadingMessages={loadingMessages}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1200px] flex-col overflow-hidden px-2 py-2 pb-20">
      <header className="glass-panel grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl px-3 py-3">
        <div className="flex items-center gap-2"><img src="/nextalk-logo.svg" alt="Nextalk" className="h-10 w-10 rounded-xl" /><button onClick={cycleTheme} className="rounded-lg border border-slate-700 p-1.5">{currentMode === "dark" ? <Moon size={14} /> : currentMode === "light" ? <Sun size={14} /> : <span className="text-xs">◐</span>}</button></div>
        <h1 className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-center font-display text-lg font-bold text-transparent">NEXTALK</h1>
        <div className="ml-auto flex items-center gap-2"><button onClick={() => setShowNotifications((s) => !s)} className="relative rounded-xl border border-slate-700 p-2"><Bell size={15} />{incomingRequests.length > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] text-white">{incomingRequests.length}</span> : null}</button><button onClick={() => setProfileView({ ...user, id: user.id })}><img src={user.avatarUrl} alt="profile" className="h-9 w-9 rounded-full" /></button><button onClick={() => setSettingsMenuOpen((s) => !s)} className="rounded-xl border border-slate-700 p-2"><EllipsisVertical size={16} /></button></div>
      </header>

      {showNotifications ? <section className="glass-panel mt-2 rounded-2xl p-3"><h4 className="text-sm font-semibold">Notifications</h4><div className="mt-2 space-y-2">{incomingRequests.length === 0 ? <p className="text-xs text-slate-400">No pending friend requests.</p> : incomingRequests.map((r) => <div key={r._id} className="flex items-center justify-between rounded-xl bg-slate-900/70 px-2 py-2"><div className="flex items-center gap-2"><img src={r.avatarUrl} className="h-7 w-7 rounded-full" /><span className="text-xs">@{r.username}</span></div><div className="flex gap-1"><button onClick={async () => { await chatApi.respondFriendRequest(r._id, "accept"); await refreshMeta(); }} className="rounded bg-emerald-500/20 px-2 py-1 text-xs">Accept</button><button onClick={async () => { await chatApi.respondFriendRequest(r._id, "decline"); await refreshMeta(); }} className="rounded bg-rose-500/20 px-2 py-1 text-xs">Decline</button></div></div>)}</div></section> : null}

      <div className="mt-2 flex gap-2 overflow-x-auto">{["primary", "general", "requests", "unread"].map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3 py-1 text-xs capitalize ${tab === item ? "bg-brandBlue/30 text-blue-100" : "bg-slate-900/50 text-slate-300"}`}>{item}</button>)}</div>
      <section className="glass-panel mt-2 flex-1 overflow-hidden rounded-2xl p-2">
        <div className="mb-2 rounded-xl border border-slate-700/70 p-2"><p className="mb-1 text-xs text-slate-400">Active Users</p><div className="flex flex-wrap gap-2">{activeUsers.slice(0, 8).map((u) => <span key={u._id} className="rounded-full bg-slate-900 px-2 py-1 text-[11px]"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />@{u.username}</span>)}</div></div>
        <input value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="Search users" className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm" />
        {discoverUsers.length > 0 ? <div className="mb-2 max-h-24 overflow-auto">{discoverUsers.map((u) => <button key={u._id} onClick={async () => { const { data } = await chatApi.createConversation(u._id); setActiveConversationId(data.conversation._id); }} className="mr-1 mt-1 rounded-full border border-slate-700 px-2 py-1 text-xs">@{u.username}</button>)}</div> : null}
        <div className="h-[calc(100%-132px)] overflow-y-auto space-y-2">{visibleChats.map((chat) => <div key={chat.id} className="rounded-xl border border-slate-700/60 p-2"><button onClick={() => { setActiveConversationId(chat.id); setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, unreadCount: 0 } : c)); }} className="w-full text-left"><div className="flex items-center gap-2"><img src={chat.partner.avatarUrl} className="h-10 w-10 rounded-full" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{chat.partner.displayName || chat.partner.fullName || chat.partner.username}</p><p className="truncate text-xs text-slate-400">{chat.lastMessage?.text || "Start chat"}</p></div>{chat.unreadCount ? <span className="rounded-full bg-brandBlue px-2 text-xs">{chat.unreadCount}</span> : null}</div></button>{chat.bucket === "requests" ? <div className="mt-2 flex gap-2"><button onClick={() => chatApi.updateConversationBucket(chat.id, "primary").then(refreshConversations)} className="rounded bg-emerald-500/20 px-2 py-1 text-xs">Accept</button><button onClick={() => chatApi.blockUser(chat.partner._id).then(refreshConversations)} className="rounded bg-rose-500/20 px-2 py-1 text-xs">Block</button></div> : null}</div>)}</div>
      </section>

      {settingsMenuOpen ? <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSettingsMenuOpen(false)}><div className="glass-panel absolute right-4 top-16 w-72 rounded-xl p-3" onClick={(e) => e.stopPropagation()}><SettingsPanel user={user} saveSettings={saveSettings} logout={logout} blockedUsers={blockedUsers} onUnblock={async (id) => { await chatApi.unblockUser(id); await refreshMeta(); }} /></div></div> : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-[1200px] grid-cols-4 gap-2">{navItems.map(({ id, label, Icon }) => <button key={id} onClick={() => setMainNav(id)} className={`rounded-xl px-2 py-2 text-xs ${mainNav === id ? "bg-brandBlue/25 text-blue-100" : "text-slate-300"}`}><Icon size={16} className="mx-auto" /><span className="mt-1 block">{label}</span></button>)}</div>
      </nav>
    </main>
  );
}

function ProfileEditor({ user, saveProfile, close }) {
  return <div><h3 className="font-display text-xl">Edit Profile</h3><input defaultValue={user.fullName} id="fn" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /><input defaultValue={user.displayName || user.fullName} id="dn" placeholder="Display Name" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /><input defaultValue={user.username} id="un" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /><textarea defaultValue={user.bio || ""} placeholder="Add bio..." id="bio" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /><label className="mt-2 block rounded-lg border border-slate-700 px-3 py-2 text-sm">Choose photo<input type="file" id="avatarFile" accept="image/*" className="hidden" /></label>{!user.avatarUrl ? <p className="mt-1 text-xs text-slate-500">No file chosen</p> : null}<div className="mt-2 grid grid-cols-2 gap-2"><button onClick={async () => { const form = new FormData(); form.append("fullName", document.getElementById("fn").value); form.append("displayName", document.getElementById("dn").value); form.append("username", document.getElementById("un").value); form.append("bio", document.getElementById("bio").value); const f = document.getElementById("avatarFile").files?.[0]; if (f) form.append("avatar", f); await saveProfile(form); close(); }} className="rounded-xl bg-brandBlue/40 py-2">Save</button><button onClick={async () => { await saveProfile({ removeAvatar: true }); close(); }} className="rounded-xl border border-slate-700 py-2">Remove Photo</button></div></div>;
}

function SettingsPanel({ user, saveSettings, logout, blockedUsers, onUnblock }) {
  const p = user.privacy || {};
  return <div><h3 className="font-display text-xl">Settings</h3><div className="mt-2 space-y-2 text-sm"><Toggle label="Activity Status" value={!!user.activeStatus} onChange={(v) => saveSettings({ activeStatus: v })} /><Toggle label="Read Receipts" value={p.readReceipts !== false} onChange={(v) => saveSettings({ privacy: { readReceipts: v } })} /><Select label="Who can send Friend Requests" value={p.friendRequests || "everyone"} options={["everyone", "nobody"]} onChange={(v) => saveSettings({ privacy: { friendRequests: v } })} /><Select label="Profile Picture Privacy" value={p.profilePhoto || "everyone"} options={["everyone", "friends", "nobody"]} onChange={(v) => saveSettings({ privacy: { profilePhoto: v } })} /><Select label="Who can DM me" value={p.messaging || "everyone"} options={["everyone", "friends"]} onChange={(v) => saveSettings({ privacy: { messaging: v } })} /><p className="pt-1 text-xs text-slate-400">Blocked users</p>{blockedUsers.map((u) => <div key={u._id} className="flex items-center justify-between rounded-lg bg-slate-900 px-2 py-1"><span>@{u.username}</span><button onClick={() => onUnblock(u._id)} className="text-xs text-blue-300">Unblock</button></div>)}<button className="w-full rounded-lg bg-rose-500/20 px-3 py-2 text-left text-rose-200" onClick={logout}>Logout</button></div></div>;
}

function Toggle({ label, value, onChange }) { return <button onClick={() => onChange(!value)} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left">{label}: {value ? "ON" : "OFF"}</button>; }
function Select({ label, value, options, onChange }) { return <label className="block rounded-lg bg-slate-900 px-3 py-2">{label}<select className="mt-1 w-full rounded bg-slate-800 p-1" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>; }

function SocialButtons({ relationship, onRequest, onRespond, onCancel, onUnfriend }) {
  if (relationship === "incoming") return <><button className="rounded-lg bg-emerald-500/20 px-3 py-1.5" onClick={() => onRespond("accept")}>Accept</button><button className="rounded-lg bg-rose-500/20 px-3 py-1.5" onClick={() => onRespond("decline")}>Decline</button></>;
  if (relationship === "pending") return <button className="rounded-lg bg-amber-500/20 px-3 py-1.5" onClick={onCancel}>Cancel Request</button>;
  if (relationship === "friends") return <button className="rounded-lg bg-rose-500/20 px-3 py-1.5" onClick={onUnfriend}>Unfriend</button>;
  return <button className="rounded-lg bg-brandBlue/30 px-3 py-1.5" onClick={onRequest}>Add Friend</button>;
}
