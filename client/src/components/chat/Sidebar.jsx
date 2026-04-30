import { Bell, Home, LogOut, MessageCircle, Search, Settings } from "lucide-react";
import BrandLogo from "../common/BrandLogo";

export default function Sidebar({ user, query, setQuery, onLogout }) {
  return (
    <aside className="glass-panel flex h-full flex-col rounded-2xl p-4 lg:p-5">
      <BrandLogo compact />

      <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
        <img
          src={user.avatarUrl || "https://api.dicebear.com/8.x/initials/svg?seed=Nextalk"}
          alt={user.username}
          className="h-11 w-11 rounded-full object-cover"
        />
        <div>
          <p className="text-sm font-semibold text-white">{user.fullName}</p>
          <p className="text-xs text-slate-400">@{user.username}</p>
        </div>
      </div>

      <label className="mt-5 flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
        />
      </label>

      <nav className="mt-6 space-y-2 text-sm">
        <Item icon={Home} label="Home" active />
        <Item icon={MessageCircle} label="Chats" />
        <Item icon={Bell} label="Notifications" />
        <Item icon={Settings} label="Settings" />
      </nav>

      <button
        onClick={onLogout}
        className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
      >
        <LogOut size={16} /> Logout
      </button>
    </aside>
  );
}

function Item({ icon: Icon, label, active = false }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
        active ? "bg-brandBlue/20 text-blue-100" : "text-slate-300 hover:bg-slate-800/70"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
