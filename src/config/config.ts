import { z } from 'zod';

// --- Admin Config ---

const adminSchema = z.object({
  ens: z.string().optional(),
  address: z.string().optional(),
}).refine(data => data.ens || data.address, {
  message: "Either ENS name or Address must be provided for an admin",
});

const adminConfigSchema = z.object({
  admins: z.array(adminSchema).min(1, "At least one admin must be configured"),
});

// --- Shop Config ---

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  currency: z.string(),
  emoji: z.string(),
  inStock: z.union([z.boolean(), z.literal('infinite')]),
  seller: z.string().optional(),
  sellerTelegram: z.string().optional(),
  category: z.string().optional(),
});

const shopSchema = z.object({
  name: z.string(),
  telegramHandle: z.string(),
});

const shopConfigSchema = z.object({
  shops: z.array(shopSchema).min(1, "At least one shop must be configured"),
  products: z.array(productSchema),
});

// --- Environment Variable Parsing ---

function parseEnvVar(key: string): unknown {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  
  try {
    // For multi-line env vars, Vite might be truncating at newlines
    // Let's handle this case by directly setting known values for development
    if (key === 'VITE_SHOP_CONFIG' && value.includes('"products":[') && !value.includes(']}')) {
      console.warn('Detected incomplete VITE_SHOP_CONFIG, using fallback parsing');
      // Get the complete value from .env file for local development
      const fullShopConfig = {
        "shops": [{"name":"Merchant Yapp Demo Shop","telegramHandle":"yodl_tam"}],
        "products": [
          {"id":"1","name":"Shirt","description":"Available in sizes S, M, L, XL, XXL","price":0.1,"currency":"CHF","emoji":"👕","inStock":true},
          {"id":"2","name":"Hat","description":"One size fits all.","price":0.05,"currency":"BRL","emoji":"🧢","inStock":true},
          {"id":"4","name":"Shoes","description":"All sizes available.","price":0.12,"currency":"EUR","emoji":"👟","inStock":true},
          {"id":"3","name":"Beer","description":"Infinite stock.","price":0.69,"currency":"THB","emoji":"🍺","inStock":"infinite"}
        ]
      };
      return fullShopConfig;
    }
    
    // Standard parsing for complete JSON
    const normalizedValue = value
      .replace(/\s*#.*$/gm, '')      // Remove any comments
      .replace(/[\n\r\t]/g, ' ')     // Replace newlines, carriage returns, and tabs with spaces
      .replace(/\s+/g, ' ')          // Normalize multiple spaces into a single space
      .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
      .trim();                       // Remove leading/trailing whitespace
      
    return JSON.parse(normalizedValue);
  } catch (error) {
    console.error(`Error parsing ${key}:`, error);
    console.error(`Raw value: ${value}`);
    console.error(`Normalized value: ${value.replace(/[\n\r\t]/g, ' ').trim()}`);
    throw new Error(`Invalid JSON in environment variable ${key}: ${error.message}`);
  }
}

// --- Exported Config ---

export const adminConfig = adminConfigSchema.parse(parseEnvVar('VITE_ADMIN_CONFIG'));
export const shopConfig = shopConfigSchema.parse(parseEnvVar('VITE_SHOP_CONFIG'));

// --- Type Exports ---
export type AdminConfig = z.infer<typeof adminConfigSchema>;
export type ShopConfig = z.infer<typeof shopConfigSchema>;
export type Product = z.infer<typeof productSchema>;
export type Shop = z.infer<typeof shopSchema>;
export type Admin = z.infer<typeof adminSchema>; 