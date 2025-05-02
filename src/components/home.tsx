import React, { useContext, useState, useEffect } from "react";
import { useYodl } from '../contexts/YodlContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProductCard from "./ProductCard";
import { shopConfig, Product } from "../config/config";
import ThemeToggle from './ThemeToggle';
import { generateConfirmationUrl } from "@/utils/url";
import { useToast } from "./ui/use-toast";
import useDeviceDetection from "../hooks/useMediaQuery";

const Home = () => {
  const { createPayment, isInIframe } = useYodl();
  const { toast } = useToast();
  const { isMobile } = useDeviceDetection();

  const handleInstantCheckout = async (product: Product) => {
    if (!product) return;
    const generateUniqueId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    const productName = product.name.replace(/\s+/g, '_').substring(0, 20);
    const rand = generateUniqueId();
    const memo = `${productName}_${rand}`;
    const orderId = memo;
    const confirmationUrl = generateConfirmationUrl(orderId);
    try {
      localStorage.setItem(orderId, JSON.stringify({
        name: product.name,
        price: product.price,
        currency: product.currency,
        emoji: product.emoji,
        timestamp: new Date().toISOString(),
      }));
      await createPayment({
        amount: product.price,
        currency: product.currency,
        description: product.name,
        orderId,
        memo,
        metadata: {
          productId: product.id,
          productName: product.name,
          orderId,
        },
        redirectUrl: confirmationUrl,
      });
    } catch (e) {
      toast({ title: "Error", description: "Could not start payment. Please try again.", variant: "destructive" });
    }
  };

  // Group products by category
  const productsByCategory = shopConfig.products.reduce((acc, product) => {
    const category = product.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {} as Record<string, typeof shopConfig.products>);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background dark:bg-gradient-to-br dark:from-purple-900 dark:via-indigo-900 dark:to-purple-800 container mx-auto pl-8 pr-4 py-8 flex flex-col">
      <header className="sticky top-0 z-10 w-full backdrop-blur border-b py-2 flex items-center">
        <h1 className="text-4xl sm:text-2xl md:text-3xl font-bold truncate inline-block text-left flex-1">{shopConfig.shops[0].name}</h1>
        <ThemeToggle />
      </header>
      <main className="flex-grow pt-8 pb-16">
        <h2 className="text-2xl font-bold text-left mb-8">Products</h2>
        <div className="space-y-12">
          {Object.entries(productsByCategory).map(([category, products]) => (
            <section key={category}>
              <h3 className="text-xl font-semibold mb-4 capitalize text-left">{category}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {products.map((productData, idx) => (
                  <ProductCard
                    key={productData.id || `prod_${idx}`}
                    id={productData.id || `prod_${Math.random()}`}
                    name={productData.name || 'Unknown Product'}
                    description={productData.description || ''}
                    price={productData.price || 0}
                    currency={productData.currency || 'USD'}
                    emoji={productData.emoji || '🛒'}
                    inStock={productData.inStock !== undefined ? productData.inStock : true}
                    seller={productData.seller || ''}
                    sellerTelegram={productData.sellerTelegram || ''}
                    onCheckout={handleInstantCheckout}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Home;
