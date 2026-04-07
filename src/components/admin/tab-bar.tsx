"use client";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 border-b border-[#e4e4e7] mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? "border-[#15803d] text-[#15803d]"
              : "border-transparent text-[#71717a] hover:text-black"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[11px] bg-[#f4f4f5] rounded-full px-1.5 py-0.5">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
