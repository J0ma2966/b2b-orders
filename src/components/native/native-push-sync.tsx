"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";
import { pushAskedBefore, registerNativePush, type NativePushConfig } from "./native-push";

// После входа в приложении токен устройства привязывается к новой сессии.
// Первый раз разрешение на уведомления спрашивается сразу (Android 13+ и iOS без него push не покажут),
// дальше — только тихое обновление токена; включить заново можно в «Профиль → Push-уведомления».
export function NativePushSync({ config }: { config: NativePushConfig }) {
  useEffect(() => {
    if (!isNativeApp()) return;
    registerNativePush(config, !pushAskedBefore()).catch(() => null);
  }, [config]);
  return null;
}
