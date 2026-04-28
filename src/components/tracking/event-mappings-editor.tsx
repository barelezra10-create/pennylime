"use client";

import { useState } from "react";
import { TRACKING_EVENTS, EVENT_DESCRIPTIONS, PLATFORMS, PLATFORM_LABELS, type Platform, type TrackingEventName } from "@/lib/tracking/click-ids";
import {
  parseMappings,
  defaultMappingFor,
  PLATFORM_HINTS,
  type EventMappings,
  type EventConfig,
  type PlatformMapping,
} from "@/lib/tracking/event-mappings";
import { fireClientEvent } from "@/lib/tracking/event-fire-client";
import { toast } from "sonner";

const BUILTIN: ReadonlyArray<TrackingEventName> = TRACKING_EVENTS;

export function EventMappingsEditor({ initialMappings }: { initialMappings: string }) {
  const parsed = parseMappings(initialMappings);
  const initial: EventMappings = {};
  for (const evt of BUILTIN) {
    initial[evt] = parsed[evt] || defaultMappingFor(evt);
  }
  for (const k of Object.keys(parsed)) {
    if (!BUILTIN.includes(k as TrackingEventName)) initial[k] = parsed[k];
  }

  const [mappings, setMappings] = useState<EventMappings>(initial);
  const [newEventName, setNewEventName] = useState("");
  const [openEvent, setOpenEvent] = useState<string | null>(BUILTIN[0]);

  function updatePlatform(eventName: string, platform: Platform, patch: Partial<PlatformMapping>) {
    setMappings((prev) => {
      const next = { ...prev };
      const evt: EventConfig = next[eventName] || { perPlatform: {} };
      const cur: PlatformMapping = evt.perPlatform[platform] || { enabled: false, label: "" };
      next[eventName] = {
        ...evt,
        perPlatform: { ...evt.perPlatform, [platform]: { ...cur, ...patch } },
      };
      return next;
    });
  }

  function updateEventDefaults(eventName: string, patch: Partial<EventConfig>) {
    setMappings((prev) => ({
      ...prev,
      [eventName]: { ...(prev[eventName] || { perPlatform: {} }), ...patch },
    }));
  }

  function addCustomEvent() {
    const name = newEventName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!name || mappings[name]) return;
    setMappings((prev) => ({ ...prev, [name]: defaultMappingFor(name) }));
    setNewEventName("");
    setOpenEvent(name);
  }

  function removeCustomEvent(name: string) {
    if (BUILTIN.includes(name as TrackingEventName)) return;
    setMappings((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleTestFire(eventName: string) {
    if (!BUILTIN.includes(eventName as TrackingEventName)) {
      toast.error("Test fire only works for built-in events for now");
      return;
    }
    const cfg = mappings[eventName];
    const value = cfg?.defaultValue ?? 1;
    await fireClientEvent({ event: eventName as TrackingEventName, value });
    toast.success(`Fired ${eventName} (value $${value})`);
  }

  return (
    <div className="space-y-5">
      <input type="hidden" name="eventMappings" value={JSON.stringify(mappings)} />

      <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-bold text-black">Add a custom event</h4>
          <p className="text-[11px] text-[#71717a] mt-0.5">e.g., plaid_linked, app_step_3, kyc_passed. Lowercase, snake_case.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            placeholder="event_name"
            className="text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-1.5 w-44"
          />
          <button
            type="button"
            onClick={addCustomEvent}
            disabled={!newEventName.trim()}
            className="bg-black text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {Object.keys(mappings).map((eventName) => {
          const cfg = mappings[eventName];
          const isOpen = openEvent === eventName;
          const isBuiltin = BUILTIN.includes(eventName as TrackingEventName);
          const enabledPlatforms = (Object.keys(cfg.perPlatform) as Platform[]).filter((p) => cfg.perPlatform[p]?.enabled).length;

          return (
            <div key={eventName} className="bg-white border border-[#e4e4e7] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenEvent(isOpen ? null : eventName)}
                className="w-full flex items-center justify-between p-4 hover:bg-[#fafafa] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-[12px] font-mono font-bold text-black">{eventName}</code>
                    {!isBuiltin && (
                      <span className="text-[9px] uppercase tracking-[0.04em] bg-[#fef3c7] text-[#92400e] rounded px-1 py-0.5">custom</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#71717a] mt-0.5">
                    {EVENT_DESCRIPTIONS[eventName as TrackingEventName] || cfg.description || "Custom event."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#71717a]">{enabledPlatforms}/{PLATFORMS.length} platforms</span>
                  <span className="text-[#a1a1aa] text-base">{isOpen ? "▾" : "▸"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[#e4e4e7] p-4 space-y-4 bg-[#fafafa]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] block mb-1">
                        Default conversion value (USD)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={cfg.defaultValue ?? ""}
                        onChange={(e) =>
                          updateEventDefaults(eventName, {
                            defaultValue: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-1.5 bg-white"
                        placeholder="0"
                      />
                    </div>
                    {!isBuiltin && (
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] block mb-1">
                          Description
                        </label>
                        <input
                          value={cfg.description || ""}
                          onChange={(e) => updateEventDefaults(eventName, { description: e.target.value })}
                          className="w-full text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-1.5 bg-white"
                          placeholder="What does this event mean?"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {PLATFORMS.map((platform) => {
                      const pm = cfg.perPlatform[platform] || { enabled: false, label: "" };
                      return (
                        <div key={platform} className="bg-white border border-[#e4e4e7] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={pm.enabled}
                                onChange={(e) => updatePlatform(eventName, platform, { enabled: e.target.checked })}
                                className="w-4 h-4 accent-[#15803d]"
                              />
                              <span className="text-[13px] font-bold text-black">{PLATFORM_LABELS[platform]}</span>
                            </label>
                            <span className="text-[10px] font-mono text-[#a1a1aa]">{platform}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-[0.04em] text-[#71717a] block mb-1">
                                {PLATFORM_HINTS[platform].labelHint}
                              </label>
                              <input
                                value={pm.label}
                                onChange={(e) => updatePlatform(eventName, platform, { label: e.target.value })}
                                placeholder={PLATFORM_HINTS[platform].example}
                                disabled={!pm.enabled}
                                className="w-full text-[12px] font-mono border border-[#e4e4e7] rounded-lg px-2.5 py-1.5 disabled:bg-[#fafafa] disabled:text-[#a1a1aa]"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-[0.04em] text-[#71717a] block mb-1">
                                Value override (optional)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={pm.valueOverride ?? ""}
                                onChange={(e) =>
                                  updatePlatform(eventName, platform, {
                                    valueOverride: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Use event default"
                                disabled={!pm.enabled}
                                className="w-full text-[12px] border border-[#e4e4e7] rounded-lg px-2.5 py-1.5 disabled:bg-[#fafafa] disabled:text-[#a1a1aa]"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <div>
                      {!isBuiltin && (
                        <button
                          type="button"
                          onClick={() => removeCustomEvent(eventName)}
                          className="text-[12px] text-[#dc2626] hover:underline"
                        >
                          Remove this event
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTestFire(eventName)}
                      className="bg-[#15803d] text-white text-[12px] font-semibold rounded-lg px-3.5 py-1.5 hover:bg-[#166534]"
                    >
                      Send test event ↑
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
