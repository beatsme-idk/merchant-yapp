import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useYodl } from "../contexts/YodlContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Home, Loader2, ExternalLink, Send, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format } from 'date-fns';
import { QRCodeCanvas } from 'qrcode.react';
import { shopConfig, Product } from '../config/config';
import ThemeToggle from "./ThemeToggle";
import { generateConfirmationUrl } from "@/utils/url";
import useDeviceDetection from "../hooks/useMediaQuery";
import { fetchTransactionDetails } from "../utils/dateUtils";

interface PaymentResult {
  txHash?: string | null; 
  chainId?: number | undefined;
}

interface TransactionDetails {
  payment?: {
    memo?: string;
    blockTimestamp?: string;
  };
}

interface OrderDetails {
  name: string;
  price: number;
  currency: string;
  emoji: string;
  timestamp: string; // Add timestamp
}

const OrderConfirmation = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { yodl, merchantAddress, merchantEns, isInIframe, parsePaymentFromUrl } = useYodl(); 
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [orderedProduct, setOrderedProduct] = useState<Product | null>(null);
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  
  const orderIdFromUrl = searchParams.get("orderId");
  const urlTxHash = searchParams.get("txHash");
  const urlChainId = searchParams.get("chainId");

  const shop = shopConfig.shops[0];
  const shopTelegramHandle = shop?.telegramHandle;
  
  // Use our media query-based detection instead
  const { isMobile, isTouch } = useDeviceDetection();

  // Helper function to clean specific parameters from URL without reload
  const cleanUrlParams = (paramsToRemove: string[]) => {
    const newSearchParams = new URLSearchParams(searchParams);
    paramsToRemove.forEach(param => newSearchParams.delete(param));
    // Use replace: true to avoid adding to browser history
    setSearchParams(newSearchParams, { replace: true }); 
  };

  // Primary Effect: Detect Payment Completion and Load Data
  useEffect(() => {
    if (!orderIdFromUrl) {
      setError("Order ID is missing from URL.");
      setIsLoading(false);
      return;
    }

    console.log(`Order Confirmation: Starting check for orderId: ${orderIdFromUrl}`);
    setIsLoading(true); 
    setError(null);
    setWarning(null);
    setPaymentResult(null);
    setOrderDetails(null);

    let confirmedPayment: PaymentResult | null = null;
    let detailsFound = false;

    // --- Step 1: Check URL parameters for txHash (Primary confirmation method) ---
    if (urlTxHash) {
      console.log(`Found txHash in URL: ${urlTxHash}`);
      confirmedPayment = {
        txHash: urlTxHash,
        chainId: urlChainId ? parseInt(urlChainId, 10) : undefined
      };
      // We'll process these parameters later
    }

    // --- Step 2: Check for order details in URL parameters ---
    const productName = searchParams.get("name");
    const productPrice = searchParams.get("price");
    const productCurrency = searchParams.get("currency");
    const productEmoji = searchParams.get("emoji");
    const productTimestamp = searchParams.get("timestamp");

    const hasDetailsInUrl = productName && productPrice && productCurrency;

    if (hasDetailsInUrl) {
      console.log("Found order details in URL parameters");
      try {
        const urlOrderDetails: OrderDetails = {
          name: productName,
          price: parseFloat(productPrice),
          currency: productCurrency,
          emoji: productEmoji || "💰",
          timestamp: productTimestamp ? 
                    format(new Date(decodeURIComponent(productTimestamp)), 'PPP p') : 
                    format(new Date(), 'PPP p')
        };
        setOrderDetails(urlOrderDetails);
        detailsFound = true;
        
        // Store in localStorage for future visits
        localStorage.setItem(`order_${orderIdFromUrl}`, JSON.stringify({
          ...urlOrderDetails,
          timestamp: productTimestamp || new Date().toISOString()
        }));
      } catch (e) {
        console.error("Error parsing order details from URL", e);
      }
    }

    // --- Step 3: Check localStorage for payment info if not in URL ---
    if (!urlTxHash) {
      console.log("No txHash in URL, checking localStorage as fallback.");
      try {
        const storedPaymentResult = localStorage.getItem(`payment_${orderIdFromUrl}`);
        if (storedPaymentResult) {
          const parsedResult = JSON.parse(storedPaymentResult);
          if (parsedResult.txHash) {
            console.log("Found payment result in localStorage (fallback):", parsedResult);
            confirmedPayment = parsedResult;
          }
        }
      } catch (e) {
        console.warn("Error parsing localStorage for payment:", e);
      }
    }

    // --- Step 4: Set Payment State --- 
    if (confirmedPayment) {
      setPaymentResult(confirmedPayment);
      console.log("Payment considered CONFIRMED.", confirmedPayment);
      // Ensure it's stored locally even if confirmed via URL
      localStorage.setItem(`payment_${orderIdFromUrl}`, JSON.stringify(confirmedPayment));
      
      // Clean URL params after processing
      if (urlTxHash) {
        cleanUrlParams(['txHash', 'chainId']);
      }
    } else {
      console.log("Payment NOT confirmed via URL or localStorage.");
      // No payment confirmation found, will show 'Waiting for payment' state
    }

    // --- Step 5: Load Order Details from localStorage if not found in URL ---
    if (!detailsFound) {
      console.log("Order details not in URL, checking localStorage...");
    try {
      const storedDetails = localStorage.getItem(orderIdFromUrl) || localStorage.getItem(`order_${orderIdFromUrl}`);
      if (storedDetails) {
        const parsedDetails = JSON.parse(storedDetails);
        // Format timestamp
        if (!parsedDetails.timestamp) {
           parsedDetails.timestamp = format(new Date(), 'PPP p');
        } else {
           try { parsedDetails.timestamp = format(new Date(parsedDetails.timestamp), 'PPP p'); } catch {}
        }
        setOrderDetails(parsedDetails as OrderDetails);
        console.log("Loaded order details from localStorage:", parsedDetails);
          if (parsedDetails) {
            setOrderedProduct(parsedDetails as Product);
          }
          detailsFound = true;
      } else {
        console.warn("Could not find order details in localStorage for", orderIdFromUrl);
        }
      } catch (e) {
        console.error("Error loading order details:", e);
      }
    }

    // --- Step 6: Set warning if payment confirmed but details missing ---
    if (confirmedPayment && !detailsFound) {
      setWarning("Payment confirmed, but order details could not be loaded. This may be a cross-device access.");
    }

    // --- Step 7: Finalize Loading State --- 
    setIsLoading(false);
    console.log("Order Confirmation checks complete.");

  }, [orderIdFromUrl, urlTxHash, urlChainId, searchParams, setSearchParams]);

  // Effect to fetch full transaction details once txHash is confirmed
  useEffect(() => {
    const getDetails = async () => {
      if (paymentResult?.txHash) {
        console.log(`Fetching transaction details for txHash: ${paymentResult.txHash}`);
        setIsFetchingDetails(true);
        try {
          const details = await fetchTransactionDetails(paymentResult.txHash);
          if (details) {
            console.log("Fetched transaction details:", details);
            setTransactionDetails(details);
          } else {
            console.warn("fetchTransactionDetails returned null or undefined");
          } 
        } catch (fetchErr: any) {
          console.error("Error fetching transaction details:", fetchErr);
        } finally {
          setIsFetchingDetails(false);
        }
      }
    };

    getDetails();
  }, [paymentResult?.txHash]);

  // Document title effect
  useEffect(() => {
    if (orderDetails) {
      document.title = `Order Confirmation - ${orderDetails.name}`;
    } else if (orderIdFromUrl) {
      document.title = `Order Status - ${orderIdFromUrl}`;
    } else {
      document.title = "Order Status"; // Keep this for when no orderId
    }
    
    // Set the default title on cleanup
    return () => {
      document.title = "Merchant Yapp"; 
    };
  }, [orderDetails, orderIdFromUrl]);

  // Render Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4">Checking payment status...</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
       <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
         <XCircle className="h-16 w-16 text-destructive mb-4" />
         <h2 className="text-2xl font-bold mb-2">Error</h2>
         <p className="text-destructive mb-6">{error}</p>
         <Button asChild variant="outline">
           <Link to="/">
             <Home className="mr-2 h-4 w-4" />
             Return to Home
           </Link>
         </Button>
       </div>
    );
  }

  // Main Render Logic
  const isSuccess = paymentResult && paymentResult.txHash;
  const displayMemo = transactionDetails?.payment?.memo || orderIdFromUrl;

  // Modify QR Code generation to include the displayed memo/orderId
  const generateQrUrl = () => {
    const url = new URL(generateConfirmationUrl(displayMemo || ""));
    
    // Payment info
    if (paymentResult?.txHash) {
      url.searchParams.set('txHash', paymentResult.txHash);
    }
    if (paymentResult?.chainId !== undefined) {
      url.searchParams.set('chainId', String(paymentResult.chainId));
    }
    
    // Order details (only if available)
    if (orderDetails) {
      url.searchParams.set('name', orderDetails.name);
      url.searchParams.set('price', orderDetails.price.toString());
      url.searchParams.set('currency', orderDetails.currency);
      if (orderDetails.emoji) {
        url.searchParams.set('emoji', orderDetails.emoji);
      }
      
      // For timestamp, store the ISO string 
      const rawTimestamp = new Date().toISOString();
      url.searchParams.set('timestamp', encodeURIComponent(rawTimestamp));
    }
    
    return url.toString();
  };
  const receiptQrValue = generateQrUrl();
  
  // Log the final QR value
  console.log("Final QR Code Value:", receiptQrValue);

  // Corrected URL prefix for yodlTxUrl
  const yodlTxUrl = isSuccess ? `https://yodl.me/tx/${paymentResult.txHash}` : '';

  // Construct pre-filled Telegram message
  let telegramMessage = "";
  if (isSuccess && orderDetails && shop) {
    const messageParts = [
      `Hey, I just bought ${orderDetails.name} from ${shop.name}.`,
      `Where can I pick it up?`,
      `Here is the receipt: ${yodlTxUrl}`
    ];
    telegramMessage = encodeURIComponent(messageParts.join("\n\n")); // Encode for URL
  }
  const telegramLink = shopTelegramHandle ? `https://t.me/${shopTelegramHandle}?text=${telegramMessage}` : '#';

  return (
    <div className="min-h-screen bg-background dark:bg-gradient-to-br dark:from-purple-900 dark:via-indigo-900 dark:to-purple-800">
      <header className={`sticky top-0 z-10 w-full bg-background/95 dark:bg-transparent backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b dark:border-purple-700/50 ${isInIframe ? 'py-2' : 'py-4'}`}>
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center">
              <Home className="h-6 w-6 mr-1" />
            </Link>
            {isSuccess && shopTelegramHandle && (
              <Button 
                variant="outline"
                size="sm"
                className="ml-1 flex items-center gap-1"
                onClick={() => window.open(telegramLink, "_blank")}
              >
                <Send className="h-4 w-4" />
                Contact Seller
              </Button>
            )}
          </div>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col gap-8">
        <Card className="w-full">
          <CardHeader>
            {isSuccess ? (
              <>
                <div className="flex items-center justify-center mb-4">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                </div>
                <CardTitle className="text-2xl text-center">
                  Payment Successful!
                </CardTitle>
                <CardDescription className="text-center">
                  Your order has been confirmed and is being processed.
                </CardDescription>
                {isSuccess && (
                  <div className="mt-4 flex justify-center">
                    <div className="p-2 bg-white rounded-lg">
                      <QRCodeCanvas 
                        value={receiptQrValue}
                        size={180} 
                        level={"H"}
                        includeMargin={false}
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <CardTitle className="text-2xl text-center">Order Status</CardTitle>
            )}
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold text-center mb-2">Order Summary & Transaction Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Order ID:</span>
                  <span className="text-right break-all overflow-hidden overflow-ellipsis">{displayMemo || "N/A"}</span>
                  {orderDetails && (
                    <>
                      <span className="text-muted-foreground">Product:</span>
                      <span className="text-right">{orderDetails.emoji} {orderDetails.name}</span>
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="text-right">{orderDetails.price} {orderDetails.currency}</span>
                      <span className="text-muted-foreground">Timestamp:</span>
                      <span className="text-right">{orderDetails.timestamp}</span>
                    </>
                  )}
                  {isSuccess && paymentResult && (
                    <div className="col-span-2 flex justify-center">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="font-mono text-primary hover:underline flex items-center gap-1 px-2 py-1"
                      >
                        <a
                          href={`https://yodl.me/tx/${paymentResult.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View Receipt
                          <ExternalLink className="h-3 w-3 flex-shrink-0 ml-1" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {warning && (
                <div className="p-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center text-yellow-800">
                  {warning}
                </div>
              )}
              {isSuccess ? (
                <>
                  <Separator />
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-center text-green-800">
                      Thank you for your purchase!
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-center text-yellow-800">
                    Waiting for payment confirmation or payment details not found.
                  </p>
                </div>
              )}
            </div>
            {isSuccess && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="default"
                  onClick={() => window.location.href = '/'}
                >
                  Done
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OrderConfirmation; 