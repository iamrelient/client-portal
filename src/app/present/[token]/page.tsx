"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PresentationShell,
  type PresentationData,
} from "@/components/presentation/presentation-shell";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: PresentationData }
  | { status: "password_required"; title: string | null; clientLogo: string | null }
  | { status: "error"; error: string; code: string };

export default function PresentPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!params.token) return;

    fetch(`/api/present/${params.token}`)
      .then(async (res) => {
        const data = await res.json();

        if (res.ok) {
          setState({ status: "loaded", data });
          return;
        }

        if (data.error === "password_required") {
          setState({
            status: "password_required",
            title: data.title,
            clientLogo: data.clientLogo,
          });
          return;
        }

        setState({
          status: "error",
          error: data.message || "Something went wrong",
          code: data.error || "unknown",
        });
      })
      .catch(() => {
        setState({
          status: "error",
          error: "Failed to load presentation",
          code: "network",
        });
      });
  }, [params.token]);

  // Gallery white during loading — no flash
  if (state.status === "loading") {
    return <div className="fixed inset-0 bg-neutral-50" />;
  }

  if (state.status === "password_required") {
    // Redirect to password gate
    router.replace(`/present/${params.token}/password`);
    return <div className="fixed inset-0 bg-neutral-50" />;
  }

  if (state.status === "error") {
    return (
      <div
        className="fixed inset-0 bg-neutral-50 flex items-center justify-center flex-col p-8 text-center"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <p className="text-lg font-light tracking-wide max-w-md leading-relaxed text-neutral-700">
          {state.code === "expired" || state.code === "revoked"
            ? "This presentation is no longer available. Contact Ray Renders for access."
            : state.error}
        </p>
        <p className="text-xs text-neutral-400 mt-8">Ray Renders</p>
      </div>
    );
  }

  return <PresentationShell data={state.data} />;
}
