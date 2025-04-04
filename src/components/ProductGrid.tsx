import { useEffect, useState } from "react"
import { Product } from "@/lib/types"
import { ProductCard } from "@/components/ProductCard"
import { Skeleton } from "@/components/ui/skeleton"
import shopsData from "@/config/shops.json"

export function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // Use the imported data instead of fetching
      setProducts(shopsData.products || [])
      setIsLoading(false)
    } catch (err) {
      setError("Error loading products. Please try again later.")
      setIsLoading(false)
      console.error("Error loading products:", err)
    }
  }, [])

  if (error) {
    return (
      <div className="flex justify-center items-center h-48">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {isLoading
        ? Array(8)
            .fill(0)
            .map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="aspect-square w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[80%]" />
                  <Skeleton className="h-4 w-[60%]" />
                </div>
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-[40%]" />
                  <Skeleton className="h-9 w-[30%]" />
                </div>
              </div>
            ))
        : products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
    </div>
  )
}
