"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { LayoutGrid, SlidersHorizontal, Settings2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

const TABS = [
  { label: "Library", icon: LayoutGrid, href: "/library" },
  { label: "Editor", icon: SlidersHorizontal, href: "/editor" },
  { label: "Settings", icon: Settings2, href: "/settings" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then((res) => res.json())
      .then((data: { creditBalance?: number }) => {
        if (typeof data.creditBalance === "number") {
          setCredits(data.creditBalance);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <nav className="relative h-[52px] bg-[#0a0a0a] border-t border-[#2a2a2a] flex items-center px-3 shrink-0">
      {/* User info */}
      <div className="flex items-center gap-2 w-[140px]">
        {user?.imageUrl ? (
          <Image
            src={user.imageUrl}
            alt="avatar"
            width={26}
            height={26}
            className="rounded-sm object-cover"
          />
        ) : (
          <div className="w-[26px] h-[26px] rounded-sm bg-[#1f1f1f] border border-[#2a2a2a] shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-white text-[12px] leading-[1.3] font-medium truncate">
            {user?.fullName ?? user?.firstName ?? ""}
          </span>
          <span className="text-[#888888] text-[10px] leading-[1.3]">
            @ {credits !== null ? credits.toLocaleString() : "—"} Tokens
          </span>
        </div>
      </div>

      {/* Tabs — absolutely centered in the nav */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[3px]">
        {TABS.map(({ label, icon: Icon, href }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <button
              key={label}
              onClick={() => router.push(href)}
              className={[
                "flex flex-col items-center justify-center gap-[3px] px-5 py-[6px] rounded-sm transition-colors cursor-pointer",
                isActive
                  ? "bg-[#1f1f1f] border border-[#333333] text-white"
                  : "border border-transparent text-[#888888] hover:text-[#cccccc]",
              ].join(" ")}
            >
              <Icon size={13} strokeWidth={1.5} />
              <span className="text-[11px] leading-none tracking-tight">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
