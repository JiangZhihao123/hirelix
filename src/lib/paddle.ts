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
          items?: { priceId: string; quantity: number }[];
          transactionId?: string;
          customer?: { email?: string };
          customData?: Record<string, string>;
          settings?: {
            displayMode?: "overlay";
            locale?: "en" | "zh-Hans";
            successUrl?: string;
          };
        }) => void;
      };
    };
  }
}

let checkoutErrorHandler: ((message: string) => void) | undefined;
function handlePaddleEvent(event: unknown) {
  if (!event || typeof event !== "object") return;
  const value = event as Record<string, unknown>;
  if (value.name === "checkout.error" || value.name === "checkout.payment.error" || value.name === "checkout.payment.failed") {
    checkoutErrorHandler?.("Paddle could not open or complete your checkout. Please try again or contact support@hirelix.online. Your subscription has not been activated.");
  }
}

let paddlePromise: Promise<typeof window.Paddle> | null = null;

export async function loadPaddle(
  clientToken: string,
  environment: "sandbox" | "production",
  onError?: (message: string) => void,
) {
  if (typeof window === "undefined") return null;

  checkoutErrorHandler = onError;

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
        window.Paddle.Initialize({ token: clientToken, eventCallback: handlePaddleEvent });
        resolve(window.Paddle);
      };
      script.onerror = () => reject(new Error("Failed to load Paddle"));
      document.head.appendChild(script);
    });
  }

  try { return await paddlePromise; }
  catch (error) { paddlePromise = null; throw error; }
}
