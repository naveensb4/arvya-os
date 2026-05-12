"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type TelemetryPayload = {
  eventType: string;
  path: string;
  title?: string;
  target?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

function enabled() {
  return process.env.NEXT_PUBLIC_ARVYA_LOCAL_TELEMETRY === "1";
}

function describeTarget(target: EventTarget | null): {
  target: string;
  text?: string;
  meta?: Record<string, unknown>;
} {
  if (!(target instanceof HTMLElement)) {
    return { target: "unknown" };
  }
  const tag = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : "";
  const role = target.getAttribute("role");
  const aria = target.getAttribute("aria-label");
  const name = target.getAttribute("name");
  const href = target instanceof HTMLAnchorElement ? target.href : undefined;
  const type = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target.type : undefined;
  const text = (target.innerText || target.textContent || aria || name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const fieldMeta =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? {
          inputType: target instanceof HTMLInputElement ? target.type : target.tagName.toLowerCase(),
          valueLength: target.value.length,
          placeholder: target.getAttribute("placeholder")?.slice(0, 120),
        }
      : undefined;
  return {
    target: [
      tag + id,
      role ? `role=${role}` : "",
      type ? `type=${type}` : "",
      name ? `name=${name}` : "",
      aria ? `aria=${aria}` : "",
      href ? `href=${href}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    text,
    meta: fieldMeta,
  };
}

function send(payload: TelemetryPayload) {
  if (!enabled()) return;
  const body = JSON.stringify({
    ...payload,
    ts: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/local-telemetry", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/local-telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function LocalTelemetry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastInputAtRef = useRef(0);

  useEffect(() => {
    if (!enabled()) return;
    const query = searchParams?.toString();
    send({
      eventType: "page_view",
      path: `${pathname}${query ? `?${query}` : ""}`,
      title: document.title,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!enabled()) return;

    function onClick(event: MouseEvent) {
      const described = describeTarget(event.target);
      send({
        eventType: "click",
        path: window.location.pathname + window.location.search,
        ...described,
        meta: { x: event.clientX, y: event.clientY },
      });
    }

    function onSubmit(event: SubmitEvent) {
      send({
        eventType: "submit",
        path: window.location.pathname + window.location.search,
        ...describeTarget(event.target),
      });
    }

    function onInput(event: Event) {
      const now = Date.now();
      if (now - lastInputAtRef.current < 750) return;
      lastInputAtRef.current = now;
      send({
        eventType: "input",
        path: window.location.pathname + window.location.search,
        ...describeTarget(event.target),
      });
    }

    function onError(event: ErrorEvent) {
      send({
        eventType: "client_error",
        path: window.location.pathname + window.location.search,
        meta: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      send({
        eventType: "client_unhandled_rejection",
        path: window.location.pathname + window.location.search,
        meta: { reason: String(event.reason) },
      });
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("input", onInput, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
