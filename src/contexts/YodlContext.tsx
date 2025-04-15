import React, { createContext, useContext, useEffect, useState } from 'react';
import YappSDK, { FiatCurrency, Payment, isInIframe } from '@yodlpay/yapp-sdk';
import { adminConfig } from '../config/config';
import { generateConfirmationUrl } from '../utils/url';
import useDeviceDetection from '../hooks/useMediaQuery';

// Define the context types
interface YodlContextType {
  yodl: YappSDK;
  createPayment: (params: {
    amount: number;
    currency: string;
    description: string;
    orderId: string;
    metadata?: Record<string, any>;
    redirectUrl?: string;
  }) => Promise<Payment | null>;
  isInIframe: boolean;
  merchantAddress: string;
  merchantEns: string;
  parsePaymentFromUrl: () => Partial<Payment> | null;
}

// Create context with default values
const YodlContext = createContext<YodlContextType>({
  yodl: new YappSDK(),
  createPayment: async () => null,
  isInIframe: false,
  merchantAddress: '',
  merchantEns: '',
  parsePaymentFromUrl: () => null,
});

// Custom hook for accessing the Yodl context
export const useYodl = () => useContext(YodlContext);

interface YodlProviderProps {
  children: React.ReactNode;
}

// Helper to clean payment parameters from URL
const cleanPaymentUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('txHash');
  url.searchParams.delete('chainId');
  window.history.replaceState({}, document.title, url.toString());
};

export const YodlProvider: React.FC<YodlProviderProps> = ({ children }) => {
  // Initialize SDK once as a singleton
  const [yodl] = useState(() => new YappSDK());
  const isInIframeValue = isInIframe();
  
  // Use our media query-based detection
  const { isMobile, isTouch } = useDeviceDetection();
  
  // Get merchant address from validated config
  const merchantAdmin = adminConfig.admins[0];
  const merchantAddress = merchantAdmin.address || "";
  const merchantEns = merchantAdmin.ens || "";

  // Ensure we have an identifier
  useEffect(() => {
    if (!merchantAddress && !merchantEns) {
      console.error("CRITICAL: No merchant address or ENS found in validated config. Payment requests will fail.");
    }
  }, [merchantAddress, merchantEns]);

  // Check for payment information in URL on component mount
  useEffect(() => {
    // Parse payment information from URL (for redirect flow)
    const urlPaymentResult = yodl.parsePaymentFromUrl();

    if (urlPaymentResult && urlPaymentResult.txHash) {
      console.log('Payment detected in URL:', urlPaymentResult);
      
      const orderId = (urlPaymentResult as any).memo || '';
      
      if (orderId) {
        // Payment was successful via redirect
        console.log('Payment successful (redirect):', urlPaymentResult);
        
        // Store payment details
        try {
          localStorage.setItem(`payment_${orderId}`, JSON.stringify({
            txHash: urlPaymentResult.txHash,
            chainId: urlPaymentResult.chainId
          }));
          
          // Broadcast successful payment message
          const message = {
            type: 'payment_complete',
            txHash: urlPaymentResult.txHash,
            chainId: urlPaymentResult.chainId,
            orderId
          };
          
          // Broadcast locally
          window.postMessage(message, '*');
          
          // Broadcast to parent if in iframe
          if (isInIframeValue && window.parent) {
            window.parent.postMessage(message, '*');
          }
        } catch (e) {
          console.error("Error saving payment details:", e);
        }
      }
      
      // Clean the URL to prevent duplicate processing on refresh
      cleanPaymentUrl();
    }
  }, [yodl, isInIframeValue]);
  
  // Handle message events for payment completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      
      // Verify this is likely a Yodl payment message
      const isPaymentMessage = 
        data && 
        typeof data === 'object' && 
        !data.target && // Filter out browser extension messages
        data.txHash && 
        (data.orderId || data.memo);
      
      // Skip if already standardized to prevent loops
      if (isPaymentMessage && data.type !== 'payment_complete') {
        const txHash = data.txHash;
        const chainId = data.chainId;
        const orderId = data.orderId || data.memo;
        
        if (!txHash || !orderId) {
          console.log("Message missing required transaction data", data);
          return;
        }
        
        console.log(`Processing payment result for order ${orderId}:`, { txHash, chainId });
        
        // Store in localStorage for persistence
        try {
          localStorage.setItem(`payment_${orderId}`, JSON.stringify({ txHash, chainId }));
        } catch (err) {
          console.error("Failed to save payment data to localStorage:", err);
        }
        
        // Create standardized message
        const standardizedMessage = {
          type: 'payment_complete',
          txHash,
          chainId,
          orderId
        };
        
        // Broadcast standardized message
        try {
          // Broadcast locally 
          window.postMessage(standardizedMessage, '*');
          
          // Broadcast to parent if in iframe
          if (isInIframeValue && window.parent) {
            window.parent.postMessage(standardizedMessage, '*');
          }
        } catch (e) {
          console.error("Error broadcasting message:", e);
        }
      }
    };
    
    // Add event listener
    window.addEventListener('message', handleMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isInIframeValue]);

  // Simple wrapper to expose the SDK's URL parsing function
  const parsePaymentFromUrl = () => {
    return yodl.parsePaymentFromUrl();
  };

  // Request a payment using the Yodl SDK
  const createPayment = async (params: {
    amount: number;
    currency: string;
    description: string;
    orderId: string;
    metadata?: Record<string, any>;
    redirectUrl?: string;
  }): Promise<Payment | null> => {
    try {
      const recipientIdentifier = merchantEns || merchantAddress;
      if (!recipientIdentifier) {
        throw new Error("No merchant address or ENS configured.");
      }
      
      // Determine redirectUrl - required when not in iframe mode
      let redirectUrl = params.redirectUrl || generateConfirmationUrl(params.orderId);
      if ((isMobile || isTouch) && !redirectUrl.startsWith('http')) {
        redirectUrl = new URL(redirectUrl, window.location.origin).toString();
      }
      
      console.log('Requesting payment with params:', { 
        amount: params.amount, 
        currency: params.currency, 
        memo: params.orderId,
        redirectUrl,
        isInIframe: isInIframeValue,
        isMobile,
        isTouch
      });
      console.log('Using recipient:', recipientIdentifier);
      
      // Pre-store order data
      try {
        const orderData = {
          name: params.description,
          price: params.amount,
          currency: params.currency,
          emoji: params.metadata?.emoji || '💰',
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(`order_${params.orderId}`, JSON.stringify(orderData));
        console.log(`Saved order data for ${params.orderId} before payment request`);
      } catch (e) {
        console.warn('Could not save order data to localStorage', e);
      }
            
      // Request payment using SDK
      const paymentResult = await yodl.requestPayment({
        addressOrEns: recipientIdentifier,
        amount: params.amount,
        currency: params.currency as FiatCurrency,
        memo: params.orderId,
        redirectUrl: redirectUrl,
      });

      console.log("Payment request completed with result:", paymentResult);

      // If we got an immediate result with txHash, handle it
      if (paymentResult?.txHash) {
        console.log("Got direct payment result with txHash:", paymentResult.txHash);
        
        const txHash = paymentResult.txHash;
        const chainId = paymentResult.chainId;
        const orderId = params.orderId;

        // Store in localStorage
        localStorage.setItem(`payment_${orderId}`, JSON.stringify({ txHash, chainId }));
        
        // Broadcast standardized message
        const message = {
          type: 'payment_complete', 
          txHash,
          chainId,
          orderId
        };
        
        // Use try-catch in case of errors during postMessage
        try {
          // Broadcast locally
          window.postMessage(message, '*');
          
          // Broadcast to parent if in iframe
          if (isInIframeValue && window.parent) {
            window.parent.postMessage(message, '*');
          }
        } catch (e) {
          console.error("Error broadcasting payment message:", e);
        }
      }

      return paymentResult;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  };

  const contextValue = {
    yodl,
    createPayment,
    parsePaymentFromUrl,
    isInIframe: isInIframeValue,
    merchantAddress,
    merchantEns,
  };

  return (
    <YodlContext.Provider value={contextValue}>
      {children}
    </YodlContext.Provider>
  );
}; 