/**
 * useBridge — manages the connection to the Python bridge server.
 * 
 * Polls the health endpoint until the server is ready.
 * In production, Tauri launches the Python process automatically.
 * In dev mode, you start it manually: python scripts/start_bridge.py
 */

import { useState, useEffect, useCallback } from "react";
import { checkHealth } from "../lib/api";

interface BridgeState {
  connected: boolean;
  checking: boolean;
  error: string | null;
}

export function useBridge() {
  const [state, setState] = useState<BridgeState>({
    connected: false,
    checking: true,
    error: null,
  });

  const check = useCallback(async () => {
    try {
      await checkHealth();
      setState({ connected: true, checking: false, error: null });
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    const poll = async () => {
      while (!cancelled && attempts < maxAttempts) {
        const ok = await check();
        if (ok || cancelled) break;
        attempts++;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!cancelled && attempts >= maxAttempts) {
        setState({
          connected: false,
          checking: false,
          error: "Could not connect to PureQL engine. Make sure the bridge server is running.",
        });
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [check]);

  return state;
}
