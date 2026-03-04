"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogoShelf } from "@/components/presentation/logo-shelf";

export default function PasswordGatePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [logoDisplay, setLogoDisplay] = useState<string | null>(null);
  const [accentColor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Fetch presentation metadata to show title/logo
  useEffect(() => {
    if (!params.token) return;

    fetch(`/api/present/${params.token}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.error === "password_required") {
          setTitle(data.title || null);
          setClientLogo(data.clientLogo || null);
          setLogoDisplay(data.logoDisplay || null);
        }
        // Also try to get accent color from a separate check
        // The password_required response includes limited data
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setReady(true), 100);
      });
  }, [params.token]);

  // Focus input when ready
  useEffect(() => {
    if (ready && inputRef.current) {
      inputRef.current.focus();
    }
  }, [ready]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(false);

    try {
      const res = await fetch(`/api/present/${params.token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Success — navigate to the presentation
        router.replace(`/present/${params.token}`);
        return;
      }

      // Wrong password
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setSubmitting(false);
      setPassword("");
      inputRef.current?.focus();
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#060608",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter Tight', 'Inter', sans-serif",
        color: "rgba(255,255,255,0.9)",
      }}
    >
      {/* Load fonts */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400&family=Inter:wght@300;400&display=swap"
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "0 2rem",
          maxWidth: 400,
          width: "100%",
          opacity: ready ? 1 : 0,
          transition: reduced ? "none" : "opacity 0.8s ease",
        }}
      >
        {/* Client logo */}
        {clientLogo && (
          <div style={{ marginBottom: "2rem" }}>
            <LogoShelf
              src={`/api/present/${params.token}/asset/${clientLogo}`}
              mode={(logoDisplay as "auto" | "white" | "light-bg") || "auto"}
              height="clamp(36px, 5vw, 60px)"
            />
          </div>
        )}

        {/* Project title */}
        {title && (
          <h1
            style={{
              fontSize: "clamp(1.25rem, 3vw, 2rem)",
              fontWeight: 300,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "1.5rem",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
        )}

        {/* Description */}
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 300,
            color: "#b0b0b0",
            letterSpacing: "0.02em",
            marginBottom: "2.5rem",
          }}
        >
          This presentation is password protected
        </p>

        {/* Password form */}
        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          <div
            style={{
              position: "relative",
              animation: shaking && !reduced ? "gate-shake 0.4s ease" : "none",
            }}
          >
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Enter password"
              autoComplete="off"
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${error ? "rgba(220,60,60,0.6)" : "rgba(255,255,255,0.15)"}`,
                outline: "none",
                color: "rgba(255,255,255,0.9)",
                fontSize: "1rem",
                fontWeight: 300,
                fontFamily: "inherit",
                letterSpacing: "0.02em",
                padding: "0.75rem 0",
                textAlign: "center",
                transition: "border-color 0.3s ease",
                caretColor: accentColor || "rgba(255,255,255,0.6)",
              }}
              onFocus={(e) => {
                if (!error) {
                  e.currentTarget.style.borderBottomColor =
                    accentColor || "rgba(255,255,255,0.4)";
                }
              }}
              onBlur={(e) => {
                if (!error) {
                  e.currentTarget.style.borderBottomColor =
                    "rgba(255,255,255,0.15)";
                }
              }}
            />
          </div>

          {/* Hidden submit — Enter to submit */}
          <button type="submit" style={{ display: "none" }} />
        </form>
      </div>

      <style>{`
        @keyframes gate-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
