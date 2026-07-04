"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Device, Call } from "@twilio/voice-sdk";
import { DialerPanel } from "./dialer-panel";

export type DialerState =
  | { phase: "idle" }
  | { phase: "connecting"; name: string; phone: string }
  | { phase: "ringing"; name: string; phone: string }
  | { phase: "in-call"; name: string; phone: string; startedAt: number }
  | { phase: "wrap-up"; name: string; phone: string; callSid: string | null; durationSec: number }
  | { phase: "error"; name: string; phone: string; message: string };

type DialerContextValue = {
  state: DialerState;
  muted: boolean;
  startCall: (opts: { phone: string; name: string; contactId?: string }) => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  dismiss: () => void;
  saveWrapUp: (outcome: string, notes: string) => Promise<void>;
};

const DialerContext = createContext<DialerContextValue | null>(null);

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used inside DialerProvider");
  return ctx;
}

export function DialerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialerState>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => () => { deviceRef.current?.destroy(); }, []);

  const getDevice = useCallback(async (): Promise<Device> => {
    if (deviceRef.current) return deviceRef.current;

    const res = await fetch("/api/voice/token");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Token request failed (${res.status})`);
    }
    const { token } = (await res.json()) as { token: string };

    const { Device } = await import("@twilio/voice-sdk");
    const device = new Device(token, { logLevel: "error" });
    device.on("tokenWillExpire", async () => {
      const r = await fetch("/api/voice/token");
      if (r.ok) device.updateToken((await r.json()).token);
    });
    deviceRef.current = device;
    return device;
  }, []);

  const startCall = useCallback(
    async (opts: { phone: string; name: string; contactId?: string }) => {
      if (callRef.current) return; // one call at a time
      setState({ phase: "connecting", name: opts.name, phone: opts.phone });
      setMuted(false);
      try {
        const device = await getDevice();
        const call = await device.connect({
          params: { To: opts.phone, contactId: opts.contactId || "" },
        });
        callRef.current = call;

        call.on("ringing", () => setState({ phase: "ringing", name: opts.name, phone: opts.phone }));
        call.on("accept", () => {
          startedAtRef.current = Date.now();
          setState({ phase: "in-call", name: opts.name, phone: opts.phone, startedAt: startedAtRef.current });
        });
        call.on("disconnect", () => {
          const durationSec = startedAtRef.current
            ? Math.round((Date.now() - startedAtRef.current) / 1000)
            : 0;
          const callSid = call.parameters?.CallSid || null;
          callRef.current = null;
          startedAtRef.current = 0;
          setState({ phase: "wrap-up", name: opts.name, phone: opts.phone, callSid, durationSec });
        });
        call.on("error", (err: Error) => {
          callRef.current = null;
          setState({ phase: "error", name: opts.name, phone: opts.phone, message: err.message });
        });
      } catch (err) {
        setState({
          phase: "error",
          name: opts.name,
          phone: opts.phone,
          message: err instanceof Error ? err.message : "Could not start call",
        });
      }
    },
    [getDevice]
  );

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);

  const saveWrapUp = useCallback(
    async (outcome: string, notes: string) => {
      if (state.phase !== "wrap-up" || !state.callSid) {
        setState({ phase: "idle" });
        return;
      }
      await fetch(`/api/admin/calls/${state.callSid}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, notes }),
      });
      setState({ phase: "idle" });
    },
    [state]
  );

  return (
    <DialerContext.Provider value={{ state, muted, startCall, hangUp, toggleMute, dismiss, saveWrapUp }}>
      {children}
      <DialerPanel />
    </DialerContext.Provider>
  );
}
