import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./tailwind.css";
import "./styles.css";

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Versery render error:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-shell loading-screen" role="alert" style={{ padding: "1.5rem" }}>
          <p className="loading-label">Versery hit an error in this browser</p>
          <p className="load-error-hint">
            Try a hard reload (Cmd+Shift+R or Ctrl+Shift+R), then an Incognito window with extensions
            disabled for this host. Open Developer Tools (F12) → Console and note any red message if
            this keeps happening.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Missing #root element — check index.html');
}

ReactDOM.createRoot(rootEl).render(
  <RootErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
    <Analytics />
  </RootErrorBoundary>,
);

/** Defer service worker registration until after load to avoid competing with first paint. */
if (import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const register = () => {
      import("virtual:pwa-register")
        .then(({ registerSW }) => {
          registerSW({ immediate: true });
        })
        .catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(register, { timeout: 4000 });
    } else {
      window.setTimeout(register, 2000);
    }
  });
}
