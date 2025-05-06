import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  User,
} from "lucide-react";
import { useYodl } from '../contexts/YodlContext';
import { useNavigate } from 'react-router-dom';
import { generateConfirmationUrl } from "@/utils/url";
import { Product } from '../config/config';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onInitiateCheckout: (product: Product, buyerName: string) => Promise<void>;
}

const CheckoutModal = ({
  isOpen,
  onClose,
  product,
  onInitiateCheckout,
}: CheckoutModalProps) => {
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "processing" | "success" | "failed"
  >("pending");
  const [progress, setProgress] = useState(0);
  const { createPayment, merchantAddress, merchantEns, isInIframe } = useYodl();
  const [orderId] = useState(() => `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`);

  useEffect(() => {
    if (isOpen && product) {
      setPaymentStatus("pending");
      setProgress(0);
      try {
        localStorage.setItem(`order_${orderId}`, JSON.stringify({
          name: product.name,
          price: product.price,
          currency: product.currency,
          emoji: product.emoji,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        console.error("Failed to save order details to localStorage", e);
      }
    } else if (!isOpen) {
      setPaymentStatus("pending");
      setProgress(0);
    }
  }, [isOpen, product, orderId]);

  const generateUniqueId = () => Math.random().toString(36).substring(2, 10);
  const getMemoAndOrderId = () => {
    if (!product) return { memo: '', orderId: '' };
    const productName = product.name.replace(/\s+/g, '_').substring(0, 20);
    const rand = generateUniqueId();
    const memo = `${productName}_${rand}`;
    return { memo, orderId: memo };
  };

  const handleStartPayment = async () => {
    // Prevent multiple calls
    if (paymentStatus === "processing") {
      console.log('Payment already in progress, ignoring duplicate click');
      return;
    }
    
    if (!product) return;

    console.log('handleStartPayment called for product:', product);
    setPaymentStatus("processing");
    setProgress(10);

    const { memo, orderId: finalOrderId } = getMemoAndOrderId();
    console.log('Generated memo and orderId:', { memo, finalOrderId });

    // Clean up any existing message listeners from previous attempts
    if (window._paymentMessageHandler) {
      console.log('Removing existing message listener');
      window.removeEventListener('message', window._paymentMessageHandler);
      window._paymentMessageHandler = null;
    }

    try {
      const confirmationUrl = generateConfirmationUrl(finalOrderId);
      console.log('Starting payment process:', {
        orderId: finalOrderId,
        isInIframe,
        confirmationUrl,
        product: {
          name: product.name,
          price: product.price,
          currency: product.currency,
          paymentAddress: product.paymentAddress
        }
      });

      // Set up payment completion listener
      const messageHandler = (event: MessageEvent) => {
        console.log('Received message event:', event.data, 'from origin:', event.origin);
        const data = event.data;
        
        // Verify this is a payment completion message for our order
        const isPaymentComplete = data && 
          typeof data === 'object' && 
          (data.type === 'payment_complete' || data.txHash) &&
          (data.orderId === finalOrderId || data.memo === finalOrderId || !data.orderId);
          
        if (isPaymentComplete) {
          console.log('Payment completion message received:', data);
          setProgress(100);
          setPaymentStatus("success");
          
          // Store payment details for confirmation page
          try {
            localStorage.setItem(`payment_${finalOrderId}`, JSON.stringify({
              txHash: data.txHash,
              chainId: data.chainId,
              timestamp: new Date().toISOString()
            }));
          } catch (err) {
            console.error("Failed to save payment details to localStorage", err);
          }
          
          // Navigate to confirmation page after a short delay
          setTimeout(() => {
            console.log('Navigating to confirmation page with orderId:', finalOrderId);
            navigate(`/confirmation?orderId=${finalOrderId}`);
            onClose();
          }, 1500);
          
          // Clean up listener
          window.removeEventListener('message', messageHandler);
          window._paymentMessageHandler = null;
        }
      };
      
      // Store reference to message handler for cleanup
      window._paymentMessageHandler = messageHandler;
      
      // Add event listener before starting payment
      window.addEventListener('message', messageHandler);
      console.log('Added message event listener for payment completion');

      console.log('Creating payment with options:', {
        amount: product.price,
        currency: product.currency,
        description: product.name,
        orderId: finalOrderId,
        memo,
        redirectUrl: confirmationUrl,
        productPaymentAddress: product.paymentAddress
      });

      // Add a timeout to handle cases where the SDK doesn't respond
      const paymentTimeout = setTimeout(() => {
        console.error('Payment request timed out in CheckoutModal');
        setPaymentStatus("failed");
        setProgress(0);
        if (window._paymentMessageHandler) {
          window.removeEventListener('message', window._paymentMessageHandler);
          window._paymentMessageHandler = null;
        }
      }, 5 * 60 * 1000 + 5000); // 5 minutes + 5 seconds buffer

      console.log('About to call createPayment...');
      const payment = await createPayment({
        amount: product.price,
        currency: product.currency,
        description: product.name,
        orderId: finalOrderId,
        memo,
        metadata: {
          productId: product.id,
          productName: product.name,
          orderId: finalOrderId,
        },
        redirectUrl: confirmationUrl,
        productPaymentAddress: product.paymentAddress,
      });
      
      // Clear timeout as soon as we get a response
      clearTimeout(paymentTimeout);
      
      console.log('createPayment returned:', payment);
      
      // If we get back null, the payment wasn't created - could be user cancellation or error
      if (!payment) {
        console.error('Payment creation returned null');
        window.removeEventListener('message', window._paymentMessageHandler);
        window._paymentMessageHandler = null;
        throw new Error('Payment creation failed');
      } else {
        console.log('Payment created successfully, waiting for completion');
        setProgress(50);
        
        // If payment has txHash, it's already complete - handle direct success
        if (payment.txHash) {
          console.log('Payment already has txHash, handling direct completion:', payment);
          
          // Store payment in localStorage
          try {
            localStorage.setItem(`payment_${finalOrderId}`, JSON.stringify({
              txHash: payment.txHash,
              chainId: payment.chainId,
              timestamp: new Date().toISOString()
            }));
          } catch (err) {
            console.error("Failed to save direct payment details to localStorage", err);
          }
          
          // Update UI
          setProgress(100);
          setPaymentStatus("success");
          
          // Navigate to confirmation after delay
          setTimeout(() => {
            console.log('Navigating to confirmation (direct) with orderId:', finalOrderId);
            navigate(`/confirmation?orderId=${finalOrderId}`);
            onClose();
          }, 1500);
          
          // Remove message listener since we're handling it directly
          window.removeEventListener('message', window._paymentMessageHandler);
          window._paymentMessageHandler = null;
        }
      }
      
    } catch (e) {
      console.error('Payment failed with error:', e);
      setPaymentStatus("failed");
      setProgress(0);
      if (window._paymentMessageHandler) {
        window.removeEventListener('message', window._paymentMessageHandler);
        window._paymentMessageHandler = null;
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${isInIframe ? 'sm:max-w-sm' : 'sm:max-w-md'} w-[92%] sm:w-[90%] bg-background rounded-lg`} style={{ zIndex: 1000 }}>
        <DialogHeader>
          <DialogTitle className={`${isInIframe ? 'text-xl' : 'text-lg sm:text-xl md:text-2xl'} font-bold flex items-center gap-2`}>
            <span>{product?.emoji}</span>
            <span>Checkout</span>
          </DialogTitle>
          {!isInIframe && product && (
            <DialogDescription>
              {product.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-3 sm:mt-4">
          <Card className="border border-border">
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4">
                <div>
                  <h3 className="font-medium text-base sm:text-lg">{product?.name}</h3>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-base sm:text-lg">
                    {product?.price} {product?.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-3 sm:my-4" />

        {paymentStatus === "pending" && (
          <div className="flex flex-col items-center">
            <Button
              onClick={handleStartPayment}
              className="w-full py-6 text-lg font-medium"
              size="lg"
            >
              Pay
            </Button>
          </div>
        )}

        {paymentStatus === "processing" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 animate-spin text-primary" />
            <h3 className="text-lg sm:text-xl font-medium">Processing Payment</h3>
            <Progress value={progress} className="w-full max-w-xs" />
            <p className="text-muted-foreground text-sm text-center px-4">
              {isInIframe ? 'Waiting for confirmation...' : 'Please complete the payment in your wallet or on the Yodl page.'}
            </p>
          </div>
        )}

        {paymentStatus === "success" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-500" />
            <h3 className="text-lg sm:text-xl font-medium">Payment Successful!</h3>
            <p className="text-muted-foreground text-sm text-center px-4">
              Your transaction is confirmed. Redirecting soon...
            </p>
          </div>
        )}

        {paymentStatus === "failed" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <XCircle className="h-12 w-12 sm:h-16 sm:w-16 text-red-500" />
            <h3 className="text-lg sm:text-xl font-medium">Payment Failed</h3>
            <p className="text-muted-foreground text-sm text-center px-4">
              Something went wrong. Please try again.
            </p>
            <Button onClick={handleStartPayment} variant="outline">Try Again</Button>
          </div>
        )}

        <div className="mt-4 sm:mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Add this at the top of the file, outside of the component
declare global {
  interface Window {
    _paymentMessageHandler: ((event: MessageEvent) => void) | null;
  }
}

// Initialize the global handler if it doesn't exist
if (typeof window !== 'undefined' && window._paymentMessageHandler === undefined) {
  window._paymentMessageHandler = null;
}

export default CheckoutModal;
