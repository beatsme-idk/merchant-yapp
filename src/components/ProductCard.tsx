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
  seller: string;
  sellerTelegram?: string;
  paymentAddress?: string;
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
  seller,
  sellerTelegram,
  paymentAddress,
}: ProductCardProps) => {
  const productData: Product = { 
    id, 
    name, 
    description, 
    price, 
    currency, 
    emoji, 
    inStock, 
    seller, 
    sellerTelegram,
    paymentAddress 
  };
  const isAvailable = inStock === true || inStock === "infinite";

  return (
    <Card className="w-full max-w-full overflow-hidden transition-colors duration-200 bg-white dark:bg-background/95 border border-border shadow-md dark:shadow-lg rounded-xl flex flex-col">
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
          <div className="flex justify-between items-center mb-2">
            <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
              {price} {currency}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Seller:</span> {seller || 'Unknown'}
            </div>
            {sellerTelegram && (
              <a
                href={`https://t.me/${sellerTelegram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors whitespace-nowrap"
                style={{ minWidth: 'unset', width: 'auto' }}
              >
                Contact Seller
              </a>
            )}
          </div>
        </CardContent>
      </div>
      <CardFooter className="px-4 pb-4 sm:px-6 sm:pb-6">
        <Button
          onClick={() => isAvailable && onCheckout(productData)}
          className={`w-full ${isAvailable ? 'bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-700 text-white' : ''}`}
          disabled={!isAvailable}
          variant={isAvailable ? "default" : "outline"}
        >
          {!isAvailable ? (
            "Sold Out"
          ) : (
            "Buy Now"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
