"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Device, Call } from "@twilio/voice-sdk";
import { sendCallDigit } from "@/lib/voice/dtmf";
import { toast } from "sonner";
import { selectCallerId } from "@/lib/voice/caller-id";
import { DialerPanel } from "./dialer-panel";

export type DialerState =
  | { phase: "idle" }
  | { phase: "incoming"; name: string; phone: string }
  | { phase: "connecting"; name: string; phone: string }
  | { phase: "ringing"; name: string; phone: string }
  | { phase: "in-call"; name: string; phone: string; startedAt: number }
  | { phase: "wrap-up"; name: string; phone: string; callSid: string | null; durationSec: number }
  | { phase: "error"; name: string; phone: string; message: string };

type OwnedNumber = { number: string; label: string };

type DialerContextValue = {
  state: DialerState;
  incomingEnabled: boolean;
  setIncomingEnabled: (enabled: boolean) => Promise<void>;
  answerIncoming: () => void;
  rejectIncoming: () => void;
  muted: boolean;
  numbers: OwnedNumber[];
  callerId: string | null;
  activeCallerId: string | null;
  setCallerId: (n: string) => void;
  startCall: (opts: { phone: string; name: string; contactId?: string }) => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  sendDigit: (digit: string) => void;
  dismiss: () => void;
  saveWrapUp: (outcome: string, notes: string) => Promise<void>;
};

// Empty selection means automatic matching; manual choices last for this session.

const DialerContext = createContext<DialerContextValue | null>(null);

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used inside DialerProvider");
  return ctx;
}

export function DialerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialerState>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const voiceSessionId = useRef<string>("");
  useEffect(() => { voiceSessionId.current = crypto.randomUUID(); }, []);
  const [incomingEnabled, setIncomingState] = useState(false);
  const [registered, setRegistered] = useState(false);
  const stateRef = useRef<DialerState>(state);
  stateRef.current = state;
  const devicePromise = useRef<Promise<Device> | null>(null);
  const [numbers, setNumbers] = useState<OwnedNumber[]>([]);
  const [callerId, setCallerIdState] = useState<string | null>(null);
  const callerIdRef = useRef<string | null>(null);
  const [activeCallerId, setActiveCallerId] = useState<string | null>(null);
  const inventoryRef = useRef<{ numbers: OwnedNumber[]; default: string | null }>({ numbers: [], default: null });
  const startingRef = useRef(false);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => () => { deviceRef.current?.destroy(); }, []);

  // Load the account's owned voice numbers for the outbound caller-ID picker,
  // Automatic state matching is the default, including for previously saved caller IDs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/numbers");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { numbers: OwnedNumber[]; default: string | null };
        if (cancelled) return;
        setNumbers(data.numbers || []);
        inventoryRef.current = data;
      } catch {
        /* Retry loading inventory when a call starts. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setCallerId = useCallback((n: string) => {
    callerIdRef.current = n;
    setCallerIdState(n);
  }, []);

  const createDevice = useCallback(async (): Promise<Device> => {
    if (deviceRef.current) return deviceRef.current;

    const res = await fetch("/api/voice/token");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Token request failed (${res.status})`);
    }
    const { token } = (await res.json()) as { token: string };

    const { Device } = await import("@twilio/voice-sdk");
    const device = new Device(token, { logLevel: "error", closeProtection: true });
    device.on("registered", () => setRegistered(true));
    device.on("unregistered", () => setRegistered(false));
    device.on("error", (error: Error) => { setRegistered(false); toast.error(`Phone connection: ${error.message}`); });
    device.on("incoming", (call: Call) => {
      if (callRef.current || startingRef.current || !["idle", "error"].includes(stateRef.current.phase)) { call.reject(); return; }
      const phone = call.parameters.From || "Unknown caller";
      const name = "Incoming support call";
      callRef.current = call;
      setActiveCallerId(null); setMuted(false);
      setState({ phase: "incoming", name, phone });
      const reset = () => { if (callRef.current === call) { callRef.current = null; startedAtRef.current = 0; setState({ phase: "idle" }); } };
      call.on("cancel", reset); call.on("reject", reset);
      call.on("accept", () => { startedAtRef.current = Date.now(); setState({ phase: "in-call", name, phone, startedAt: startedAtRef.current }); });
      call.on("disconnect", () => {
        const durationSec = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
        callRef.current = null; startedAtRef.current = 0;
        setState({ phase: "wrap-up", name, phone, callSid: call.customParameters.get("parentCallSid") || call.parameters.CallSid || null, durationSec });
      });
      call.on("error", (err: Error) => { reset(); toast.error(err.message); });
    });
    device.on("tokenWillExpire", async () => {
      const r = await fetch("/api/voice/token");
      if (r.ok) device.updateToken((await r.json()).token);
    });
    deviceRef.current = device;
    return device;
  }, []);

  const getDevice = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current;
    if (!devicePromise.current) devicePromise.current = createDevice().finally(() => { devicePromise.current = null; });
    return devicePromise.current;
  }, [createDevice]);

  const setIncomingEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const device = await getDevice();
      await device.register();
      setIncomingState(true);
    } else {
      setIncomingState(false);
      await deviceRef.current?.unregister();
      await fetch("/api/voice/availability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ available: false, sessionId: voiceSessionId.current }) });
    }
  }, [getDevice]);

  useEffect(() => {
    const available = incomingEnabled && registered && state.phase === "idle";
    const heartbeat = async () => {
      try {
        const res = await fetch("/api/voice/availability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ available, sessionId: voiceSessionId.current }), keepalive: true });
        if (!res.ok && available) { setIncomingState(false); void deviceRef.current?.unregister(); toast.error("Could not enable incoming calls. Please try again."); }
      } catch { if (available) toast.error("Could not update phone availability. Check your connection."); }
    };
    void heartbeat();
    const timer = available ? setInterval(() => void heartbeat(), 20000) : null;
    return () => { if (timer) clearInterval(timer); };
  }, [incomingEnabled, registered, state.phase]);

  useEffect(() => {
    const offline = () => { void fetch("/api/voice/availability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ available: false, sessionId: voiceSessionId.current }), keepalive: true }); };
    window.addEventListener("pagehide", offline);
    return () => { window.removeEventListener("pagehide", offline); offline(); };
  }, []);

  const answerIncoming = useCallback(() => { callRef.current?.accept(); }, []);
  const rejectIncoming = useCallback(() => { callRef.current?.reject(); callRef.current = null; setState({ phase: "idle" }); }, []);

  const startCall = useCallback(
    async (opts: { phone: string; name: string; contactId?: string }) => {
      if (callRef.current || startingRef.current) return; // one call at a time
      startingRef.current = true;
      setActiveCallerId(null);
      setState({ phase: "connecting", name: opts.name, phone: opts.phone });
      setMuted(false);
      try {
        // Resolve for every call, including queue calls and rapid calls before inventory loads.
        {
          const res = await fetch("/api/voice/numbers");
          if (!res.ok) throw new Error("Could not load outbound phone numbers.");
          inventoryRef.current = await res.json();
          setNumbers(inventoryRef.current.numbers);
        }
        const manualNumber = callerIdRef.current;
        const choice = selectCallerId({ to: opts.phone, numbers: inventoryRef.current.numbers, defaultNumber: inventoryRef.current.default, manualNumber });
        if (!choice.number) throw new Error("No owned voice number is available. Check the voice settings.");
        setActiveCallerId(choice.number);
        const device = await getDevice();
        const call = await device.connect({
          params: {
            To: opts.phone,
            contactId: opts.contactId || "",
            callerId: choice.number,
            callerIdMode: manualNumber ? "manual" : "auto",
          },
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
      } finally {
        startingRef.current = false;
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

  const sendDigit = useCallback((digit: string) => {
    if (state.phase !== "in-call") return;
    try {
      if (!sendCallDigit(callRef.current, digit)) toast.error("The call is not connected");
    } catch {
      toast.error("Could not send the keypad tone. Try again.");
    }
  }, [state.phase]);

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
    <DialerContext.Provider value={{ state, incomingEnabled: incomingEnabled && registered, setIncomingEnabled, answerIncoming, rejectIncoming, muted, numbers, callerId, activeCallerId, setCallerId, startCall, hangUp, toggleMute, sendDigit, dismiss, saveWrapUp }}>
      {children}
      <DialerPanel />
    </DialerContext.Provider>
  );
}
