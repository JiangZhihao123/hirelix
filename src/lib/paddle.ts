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

const CHECKOUT_ERROR_MESSAGE = "Paddle could not open or complete your checkout. Please try again or contact support@hirelix.online. Your subscription has not been activated.";

type PaddleCheckoutCallbacks = {
  onLoaded?: () => void;
  onSettled?: () => void;
  onError?: (message: string) => void;
};

type PaddleCheckoutState = PaddleCheckoutCallbacks & {
  release: () => void;
};

let activeCheckout: PaddleCheckoutState | null = null;

export function acquirePaddleCheckout(callbacks: PaddleCheckoutCallbacks) {
  if (activeCheckout) return null;

  const state: PaddleCheckoutState = {
    ...callbacks,
    release: () => {
      if (activeCheckout === state) activeCheckout = null;
    },
  };
  activeCheckout = state;
  return { release: state.release };
}

function handlePaddleEvent(event: unknown) {
  if (!event || typeof event !== "object") return;
  const value = event as Record<string, unknown>;
  const name = String(value.name);
  const checkout = activeCheckout;
  if (!checkout) return;
  if (name === "checkout.loaded") {
    checkout.onLoaded?.();
    return;
  }
  if (!["checkout.closed", "checkout.completed", "checkout.error", "checkout.payment.error", "checkout.payment.failed"].includes(name)) return;
  checkout.release();
  if (["checkout.error", "checkout.payment.error", "checkout.payment.failed"].includes(name)) {
    checkout.onError?.(CHECKOUT_ERROR_MESSAGE);
  }
  checkout.onSettled?.();
}

let paddlePromise: Promise<typeof window.Paddle> | null = null;

export async function loadPaddle(
  clientToken: string,
  environment: "sandbox" | "production",
) {
  if (typeof window === "undefined") return null;

  if (!paddlePromise) {
    paddlePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => {
        try {
          if (!window.Paddle) throw new Error("Paddle failed to load");
          if (environment === "sandbox") {
            window.Paddle.Environment?.set("sandbox");
          }
          window.Paddle.Initialize({ token: clientToken, eventCallback: handlePaddleEvent });
          resolve(window.Paddle);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error("Failed to load Paddle"));
      document.head.appendChild(script);
    });
  }

  try { return await paddlePromise; }
  catch (error) { paddlePromise = null; throw error; }
}
