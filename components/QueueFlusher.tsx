"use client";
import { useEffect } from "react";
import { flushQueue } from "@/lib/queue";

export default function QueueFlusher() {
  useEffect(() => {
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    const t = setInterval(flushQueue, 60_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(t); };
  }, []);
  return null;
}
