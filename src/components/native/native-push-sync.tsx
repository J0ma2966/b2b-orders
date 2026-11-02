"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";
import { registerNativePush, type NativePushConfig } from "./native-push";

// После входа в приложении токен устройства привязывается к новой сессии (если push уже разрешён)
export function NativePushSync({ config }: { config: NativePushConfig }) {
  useEffect(() => {
    if (!isNativeApp()) return;
    registerNativePush(config, false).catch(() => null);
  }, [config]);
  return null;
}
