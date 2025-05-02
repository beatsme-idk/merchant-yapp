import { Suspense, useEffect } from "react";
import { useRoutes, Routes, Route } from "react-router-dom";
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http, WagmiConfig } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, base, gnosis } from 'wagmi/chains';
import { 
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  phantomWallet,
  rabbyWallet
} from '@rainbow-me/rainbowkit/wallets';
import { YodlProvider, useYodl } from './contexts/YodlContext';
import Home from "./components/home";
import OrderConfirmation from "./components/OrderConfirmation";
import PaymentBridge from "./components/PaymentBridge";
import routes from "tempo-routes";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { Analytics } from "@vercel/analytics/react";

const chains = [mainnet, polygon, optimism, arbitrum, base, gnosis] as const;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const config = getDefaultConfig({
  appName: "Merchant Yapp",
  projectId: projectId,
  chains: [mainnet],
  ssr: true,
  wallets: [
    {
      groupName: "Recommended",
      wallets: [
        coinbaseWallet,
        metaMaskWallet,
        phantomWallet,
        rabbyWallet,
        walletConnectWallet,
      ],
    },
  ],
});

const queryClient = new QueryClient();

// Wrapper for the application content with iframe detection
function AppContent() {
  const { isInIframe } = useYodl();
  
  // Add basic CSS fixes for mobile/tablet devices
  useEffect(() => {
    // Add a style tag to ensure iframes are clickable on mobile/tablet
    const style = document.createElement('style');
    style.textContent = `
      /* Ensure iframes are generally accessible */
      iframe {
        pointer-events: auto !important;
        touch-action: auto !important;
        z-index: 10 !important; /* Keep a reasonable z-index */
      }
      
      /* Basic iOS iframe scrolling */
      .iframe-container {
        -webkit-overflow-scrolling: touch;
        overflow: auto;
      }
      
      /* Basic Yodl iframe styling */
      iframe[src*="yodl.me"] {
        position: relative !important; /* Default to relative */
        min-height: 500px; /* Ensure minimum height */
        background-color: white !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []); // Run only once on mount
  
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <div className={`bg-background text-foreground min-h-screen ${isInIframe ? 'iframe-mode' : ''}`}>
        <PaymentBridge />
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/confirmation" element={<OrderConfirmation />} />
        </Routes>
        {/* {import.meta.env.VITE_TEMPO === "true" && useRoutes(routes)} */}
      </div>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={config}>
          <RainbowKitProvider>
            <YodlProvider>
              <AppContent />
              <Analytics />
            </YodlProvider>
          </RainbowKitProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
