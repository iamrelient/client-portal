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

  // Pure black during loading — no flash
  if (state.status === "loading") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#000000",
        }}
      />
    );
  }

  if (state.status === "password_required") {
    // Redirect to password gate
    router.replace(`/present/${params.token}/password`);
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#000000",
        }}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#060608",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          fontFamily: "'Inter', sans-serif",
          color: "rgba(255,255,255,0.9)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "1.125rem",
            fontWeight: 300,
            letterSpacing: "0.02em",
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          {state.code === "expired" || state.code === "revoked"
            ? "This presentation is no longer available. Contact Ray Renders for access."
            : state.error}
        </p>
        <p
          style={{
            fontSize: "0.75rem",
            color: "#666",
            marginTop: "2rem",
          }}
        >
          Ray Renders
        </p>
      </div>
    );
  }

  return <PresentationShell data={state.data} />;
}
