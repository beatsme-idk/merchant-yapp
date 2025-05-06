import React, { useEffect } from 'react';

const AppIframe: React.FC<{ url: string; onPaymentComplete: (data: any) => void }> = ({ url, onPaymentComplete }) => {
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
        console.warn(`Received message from untrusted origin: ${event.origin}`);
        return;
      }

      const data = event.data;
      if (data && typeof data === 'object' && data.type === 'payment_complete') {
        console.log('Payment completion message received in iframe:', data);
        onPaymentComplete(data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onPaymentComplete]);

  return (
    <div className="w-full h-full">
      <iframe
        src={url}
        className="w-full h-full border-0"
        allow="camera; microphone; payment"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals"
        title="Yodl Payment"
      />
    </div>
  );
};

export default AppIframe; 