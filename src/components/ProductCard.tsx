import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { Product } from '../config/config'; // Import shared Product type

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  emoji: string;
  inStock: boolean | "infinite";
  onCheckout: (product: Product) => void;
  isWalletConnected?: boolean;
  onConnectWallet?: () => void;
}

const ProductCard = ({
  id,
  name,
  description,
  price,
  currency,
  emoji,
  inStock,
  onCheckout,
  isWalletConnected = false,
  onConnectWallet = () => {},
}: ProductCardProps) => {
  const productData: Product = { id, name, description, price, currency, emoji, inStock };

  const handleCheckout = () => {
    if (isWalletConnected && isAvailable) {
      onCheckout(productData);
    } else if (!isWalletConnected) {
      onConnectWallet();
    }
  };

  const isAvailable = inStock === true || inStock === "infinite";

  return (
    <Card className="w-full max-w-full overflow-hidden transition-all duration-200 hover:shadow-lg bg-card dark:bg-card/80 flex flex-col">
      <div className="flex-grow">
        <CardHeader className="pb-2 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg sm:text-xl font-bold text-black dark:text-white">{name}</CardTitle>
            <div className="text-3xl sm:text-4xl">{emoji}</div>
          </div>
          <CardDescription className="text-sm text-muted-foreground dark:text-gray-400 min-h-[2rem] sm:min-h-[2.5rem]">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="flex justify-between items-center">
            <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
              {price} {currency}
            </div>
          </div>
        </CardContent>
      </div>
      <CardFooter className="px-4 pb-4 sm:px-6 sm:pb-6">
        <Button
          onClick={handleCheckout}
          className={`w-full ${isWalletConnected && isAvailable ? 'bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-700 text-white' : ''}`}
          disabled={!isAvailable}
          variant={isWalletConnected && isAvailable ? "default" : "outline"}
        >
          {!isAvailable ? (
            "Sold Out"
          ) : isWalletConnected ? (
            "Buy Now"
          ) : (
            <>
              <Wallet className="mr-2 h-4 w-4" />
              Connect wallet to purchase
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
