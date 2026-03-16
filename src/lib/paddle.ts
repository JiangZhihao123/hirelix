"use client";

declare global {
  interface Window {
    Paddle?: {
      Environment?: {
        set: (environment: "sandbox" | "production") => void;
      };
      Initialize: (options: {
        token: string;
        eventCallback?: (event: unknown) => void;
      }) => void;
      Checkout: {
        open: (options: {
          items: { priceId: string; quantity: number }[];
          customer?: { email?: string };
          customData?: Record<string, string>;
          settings?: {
            displayMode?: "overlay";
            successUrl?: string;
          };
        }) => void;
      };
    };
  }
}

let paddlePromise: Promise<typeof window.Paddle> | null = null;

export async function loadPaddle(
  clientToken: string,
  environment: "sandbox" | "production",
) {
  if (typeof window === "undefined") return null;

  if (window.Paddle) {
    if (environment === "sandbox") {
      window.Paddle.Environment?.set("sandbox");
    }
    window.Paddle.Initialize({ token: clientToken });
    return window.Paddle;
  }

  if (!paddlePromise) {
    paddlePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => {
        if (!window.Paddle) {
          reject(new Error("Paddle failed to load"));
          return;
        }
        if (environment === "sandbox") {
          window.Paddle.Environment?.set("sandbox");
        }
        window.Paddle.Initialize({ token: clientToken });
        resolve(window.Paddle);
      };
      script.onerror = () => reject(new Error("Failed to load Paddle"));
      document.head.appendChild(script);
    });
  }

  return paddlePromise;
}
