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
    memo?: string;
    metadata?: Record<string, any>;
    redirectUrl?: string;
    productPaymentAddress?: string;
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
  const [yodl] = useState(() => {
    console.log('Initializing Yodl SDK...');
    const sdk = new YappSDK();
    console.log('Yodl SDK initialized:', sdk);
    return sdk;
  });
  const isInIframeValue = isInIframe();
  
  // Use our media query-based detection
  const { isMobile, isTouch } = useDeviceDetection();
  
  // Get merchant address from validated config
  const merchantAdmin = adminConfig.admins[0];
  const merchantAddress = merchantAdmin.address || "";
  const merchantEns = merchantAdmin.ens || "";

  // Check if debug mode is enabled
  const isDebugMode = window.location.search.includes('debug=true');

  // Log handler that respects debug mode
  const logDebug = (message: string, data?: any) => {
    console.log(`[YodlContext] ${message}`, data || '');
  };

  // Ensure we have an identifier
  useEffect(() => {
    logDebug('Checking merchant configuration:', { merchantAddress, merchantEns });
    if (!merchantAddress && !merchantEns) {
      console.error("CRITICAL: No merchant address or ENS found in validated config. Payment requests will fail.");
    }
  }, [merchantAddress, merchantEns]);

  // Check for payment information in URL on component mount
  useEffect(() => {
    // Parse payment information from URL (for redirect flow)
    const urlPaymentResult = yodl.parsePaymentFromUrl();

    if (urlPaymentResult && urlPaymentResult.txHash) {
      logDebug('Payment detected in URL:', urlPaymentResult);
      
      const orderId = (urlPaymentResult as any).memo || '';
        
      if (orderId) {
        // Payment was successful via redirect
        logDebug('Payment successful (redirect):', urlPaymentResult);
          
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
  }, [yodl, isInIframeValue, isDebugMode]);

  // Handle message events for payment completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Add origin validation
      const allowedOrigins = [
        window.location.origin,
        'http://localhost:5174',
        'https://merchant-yapp.vercel.app'
      ];
      
      if (!allowedOrigins.includes(event.origin)) {
        console.warn(`Received message from untrusted origin: ${event.origin}`);
        return;
      }

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
          logDebug("Message missing required transaction data", data);
          return;
        }
        
        logDebug(`Processing payment result for order ${orderId}:`, { txHash, chainId });
            
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
  }, [isInIframeValue, isDebugMode]);

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
    memo?: string;
    metadata?: Record<string, any>;
    redirectUrl?: string;
    productPaymentAddress?: string;
  }): Promise<Payment | null> => {
    try {
      // Use product's payment address if available, otherwise fall back to admin address
      const recipientIdentifier = params.productPaymentAddress || merchantEns || merchantAddress;
      
      // Add debug logging
      console.log('Payment address resolution:', {
        productPaymentAddress: params.productPaymentAddress,
        merchantEns,
        merchantAddress,
        finalRecipient: recipientIdentifier
      });
      
      if (!recipientIdentifier) {
        throw new Error("No merchant address or ENS configured.");
      }
      
      // Determine redirectUrl - required when not in iframe mode
      const redirectUrl = params.redirectUrl || generateConfirmationUrl(params.orderId);
      
      logDebug('Creating payment:', { 
        ...params,
        redirectUrl,
        recipient: recipientIdentifier 
      });
      
      // Handle preferred flow based on device/context
      let flow = 'iframe';
      
      // Use redirect flow only for mobile/touch devices but NOT when in an iframe
      if ((isMobile || isTouch) && !isInIframeValue) {
        flow = 'redirect';
        logDebug(`Using redirect flow due to: mobile=${isMobile}, touch=${isTouch}`);
      } else {
        logDebug(`Using iframe flow: mobile=${isMobile}, touch=${isTouch}, iframe=${isInIframeValue}`);
      }
            
      // Create payment options
      const paymentOptions = {
        addressOrEns: recipientIdentifier,
        amount: params.amount,
        currency: params.currency as FiatCurrency,
        memo: params.memo || params.orderId,
        metadata: params.metadata,
        redirectUrl,
        flow,
        allowedOrigins: [
          window.location.origin,
          'http://localhost:5174',
          'https://merchant-yapp.vercel.app',
          'https://yodl.me',
          'https://keys.coinbase.com'
        ]
      };
      
      // Create the payment through Yodl
      logDebug('Requesting payment with options:', paymentOptions);
      const payment = await yodl.requestPayment(paymentOptions);
      logDebug('Payment created/requested:', payment);
      
      return payment;
    } catch (error) {
      console.error('Error creating payment:', error);
      return null;
    }
  };

  // Provide the context to children
  return (
    <YodlContext.Provider
      value={{
      yodl, 
      createPayment,
      isInIframe: isInIframeValue,
      merchantAddress,
    merchantEns,
        parsePaymentFromUrl
      }}
    >
      {children}
    </YodlContext.Provider>
  );
}; 