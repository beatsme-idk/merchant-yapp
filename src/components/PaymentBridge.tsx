import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateConfirmationUrl } from '@/utils/url';
import { useYodl } from '../contexts/YodlContext';

/**
 * This component acts as a global listener for payment completion signals.
 * It stores the result in localStorage and navigates to the confirmation page.
 */
const PaymentBridge: React.FC = () => {
  const navigate = useNavigate();
  const { isInIframe } = useYodl();
  
  // Use ref to ensure the navigate function used in the listener is up-to-date
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Add origin validation
      const allowedOrigins = [
        window.location.origin,
        'http://localhost:5174',
        'https://merchant-yapp.vercel.app',
        'https://yodl.me',
        'https://keys.coinbase.com'
      ];
      
      if (!allowedOrigins.includes(event.origin)) {
        console.warn(`PaymentBridge: Received message from untrusted origin: ${event.origin}`);
        return;
      }
      
      // Filter for potential payment completion messages (more specific)
      if (event.data && typeof event.data === 'object' && 
          event.data.type === 'payment_complete' && 
          event.data.txHash && 
          (event.data.orderId || event.data.memo)) {
        
        const { txHash, chainId, orderId: messageOrderId, memo } = event.data;
        const orderId = messageOrderId || memo; // Prefer orderId, fallback to memo

        console.log(`PaymentBridge: Received payment_complete message for order ${orderId}:`, event.data);

        // --- Primary Action: Store result and Navigate --- 
        try {
          // 1. Store payment data in localStorage immediately
          localStorage.setItem(`payment_${orderId}`, JSON.stringify({ txHash, chainId }));
          console.log(`PaymentBridge: Stored payment for ${orderId} in localStorage.`);

          // 2. Construct the full confirmation URL including txHash and chainId
          const confirmationUrl = new URL(generateConfirmationUrl(orderId)); // Base: /confirmation?orderId=...
          confirmationUrl.searchParams.set('txHash', txHash);
          if (chainId !== undefined) { // Only add chainId if it exists and is not null/undefined
             confirmationUrl.searchParams.set('chainId', String(chainId));
          }
          
          // Add order details if available
          try {
            const storedOrderDetails = localStorage.getItem(orderId) || localStorage.getItem(`order_${orderId}`);
            if (storedOrderDetails) {
              const orderDetails = JSON.parse(storedOrderDetails);
              // Add essential order details to URL
              if (orderDetails.name) confirmationUrl.searchParams.set('name', orderDetails.name);
              if (orderDetails.price) confirmationUrl.searchParams.set('price', orderDetails.price.toString());
              if (orderDetails.currency) confirmationUrl.searchParams.set('currency', orderDetails.currency);
              if (orderDetails.emoji) confirmationUrl.searchParams.set('emoji', orderDetails.emoji);
              if (orderDetails.timestamp) {
                confirmationUrl.searchParams.set('timestamp', encodeURIComponent(orderDetails.timestamp));
              }
              console.log("PaymentBridge: Added order details to confirmation URL");
            }
          } catch (e) {
            console.error("PaymentBridge: Error adding order details to URL:", e);
          }
          
          const fullConfirmationPath = confirmationUrl.pathname + confirmationUrl.search;
          console.log("PaymentBridge: Constructed full confirmation path:", fullConfirmationPath);

          // 3. Check if already on the correct confirmation page (or similar enough)
          const currentPath = window.location.pathname;
          const currentSearchParams = new URLSearchParams(window.location.search);
          const currentOrderId = currentSearchParams.get('orderId');
          const currentTxHash = currentSearchParams.get('txHash');

          // If in iframe mode, notify parent window of payment completion
          if (isInIframe && window.parent) {
            try {
              const parentMessage = {
                type: 'yapp_payment_complete',
                txHash,
                chainId,
                orderId,
                confirmation_url: window.location.origin + fullConfirmationPath
              };
              window.parent.postMessage(parentMessage, '*');
              console.log('PaymentBridge: Notified parent window of payment completion');
            } catch (e) {
              console.error('PaymentBridge: Error notifying parent window:', e);
            }
          }

          // Only navigate if we are not already on the confirmation page for this specific tx
          if (!(currentPath.includes('/confirmation') && currentOrderId === orderId && currentTxHash === txHash)) {
             console.log(`PaymentBridge: Navigating to full confirmation page: ${fullConfirmationPath}`);
             // Use replace state navigation to avoid polluting browser history
             navigateRef.current(fullConfirmationPath, { replace: true });
          } else {
             console.log('PaymentBridge: Already on the correct confirmation page with txHash. No navigation needed.');
             // If already on the page, ensure localStorage is set (already done above)
             // OrderConfirmation component polling/initial check should handle UI update.
          }
        } catch (e) {
          console.error("PaymentBridge: Error processing payment message:", e);
        }
      } else if (event.data && typeof event.data === 'object' && !event.data.target && event.data.txHash) {
         // Log other potential messages with txHash for debugging, but don't act on them unless type is 'payment_complete'
         console.log('PaymentBridge: Received message with txHash but type is not payment_complete:', event.data);
      }
    };

    console.log("PaymentBridge: Adding message listener.");
    window.addEventListener('message', handleMessage);

    // Handle Yodl iframe specific communication
    if (isInIframe) {
      // Let parent know this app is ready to handle payments
      try {
        window.parent.postMessage({ type: 'yapp_ready' }, '*');
        console.log('PaymentBridge: Notified parent window that Yapp is ready');
      } catch (e) {
        console.error('PaymentBridge: Error notifying parent window of readiness:', e);
      }
    }

    // Cleanup
    return () => {
      console.log("PaymentBridge: Removing message listener.");
      window.removeEventListener('message', handleMessage);
    };
  }, [isInIframe]); // Run when isInIframe changes

  // This component does not render anything itself
  return null;
};

export default PaymentBridge; 