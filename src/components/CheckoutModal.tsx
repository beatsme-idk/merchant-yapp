import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  onCheckout?: (product: Product, quantity: number) => Promise<void>;
}

const CheckoutModal = ({
  isOpen,
  onClose,
  product,
}: CheckoutModalProps) => {
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "processing" | "success" | "failed"
  >("pending");
  const [progress, setProgress] = useState(0);
  const { createPayment, merchantAddress, merchantEns, isInIframe } = useYodl();
  const [orderId] = useState(() => `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  const [userName, setUserName] = useState("");
  
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

  const handleStartPayment = async () => {
    if (!product) return;
    setPaymentStatus("processing");
    setProgress(10);

    // Format userName for inclusion in memo if provided
    const formattedOrderId = userName.trim() 
      ? `${orderId}_${userName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)}`
      : orderId;

    try {
      const confirmationUrl = generateConfirmationUrl(orderId);
      console.log(`Starting payment for order ${formattedOrderId}${isInIframe ? ' (in iframe mode)' : ''}`);

      const payment = await createPayment({
        amount: product.price,
        currency: product.currency,
        description: product.name,
        orderId: formattedOrderId, // Use formatted order ID with user name
        metadata: {
          productId: product.id,
          productName: product.name,
          orderId: orderId, // Keep original order ID in metadata
          customerName: userName.trim(), // Add customer name to metadata
          emoji: product.emoji,
          quantity: "1"
        },
        redirectUrl: confirmationUrl
      });

      console.log('Payment request successful (or redirect initiated):', payment);

      if (isInIframe && payment?.txHash) {
        try {
          localStorage.setItem(`payment_${orderId}`, JSON.stringify({
            txHash: payment.txHash,
            chainId: payment.chainId
          }));
        } catch (e) {
          console.error("Failed to save iframe payment result to localStorage", e);
        }
        setProgress(100);
        setPaymentStatus("success");
        setTimeout(() => {
          navigate(`/confirmation?orderId=${orderId}`);
          onClose();
        }, 1500);
      } else if (!isInIframe) {
        setPaymentStatus("processing");
        setProgress(50);
      } else {
        console.warn("Payment initiated, but no immediate txHash in iframe mode.");
        setPaymentStatus("processing");
        setProgress(30);
      }

    } catch (error: any) {
      console.error('Payment failed:', error);
      if (error.message?.includes('cancelled') || error.code === 4001) {
        console.log('User cancelled the payment');
        setPaymentStatus("pending");
      } else if (error.message?.includes('timed out')) {
        console.log('Payment request timed out');
        setPaymentStatus("failed");
      } else {
        setPaymentStatus("failed");
      }
      setProgress(0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${isInIframe ? 'sm:max-w-sm' : 'sm:max-w-md'} w-[90%] bg-background rounded-lg`}>
        <DialogHeader>
          <DialogTitle className={`${isInIframe ? 'text-xl' : 'text-2xl'} font-bold flex items-center gap-2`}>
            <span>{product?.emoji}</span>
            <span>Checkout</span>
          </DialogTitle>
          {!isInIframe && product && (
            <DialogDescription>
              {product.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-4">
          <Card className="border border-border">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                  <h3 className="font-medium text-lg">{product?.name}</h3>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-lg">
                    {product?.price} {product?.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-4" />
        
        {/* Add user name input field */}
        <div className="mb-4">
          <Label htmlFor="userName" className="text-sm font-medium">
            Your Name
          </Label>
          <div className="flex items-center mt-1.5">
            <User className="w-4 h-4 mr-2 text-muted-foreground" />
            <Input
              id="userName"
              placeholder="Enter your name (optional)"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="flex-1"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Your name will be included in the transaction memo to help the seller identify your purchase
          </p>
        </div>

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

        <DialogFooter className="mt-4 sm:mt-6">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutModal;
