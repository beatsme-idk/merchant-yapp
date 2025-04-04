import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import OrderScanner from '@/components/OrderScanner';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const AdminScannerPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  // Get auth context values
  const { isAdmin, isAuthenticated, setIsAdmin, address, signIn, isLoading } = useAuth();
  const isDev = process.env.NODE_ENV === 'development';
  
  // Check if user has admin access (must be both admin AND authenticated)
  const hasAdminAccess = isAdmin && isAuthenticated;
  
  // No development bypass - security is critical
  
  // Finish loading after initial render
  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Admin Order Scanner</h1>
        
        {isAdmin && isAuthenticated ? (
          <>
            <OrderScanner isAdmin={true} />
            
            <div className="bg-card p-3 border rounded-lg mt-4 md:mt-6 max-w-md mx-auto text-sm">
              <div className="cursor-pointer font-medium flex items-center" onClick={() => setDetailsOpen(!detailsOpen)}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Scanner Features
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-4 w-4 ml-1.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {detailsOpen && (
                <div className="mt-2 pl-2">
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
                    <li>Scan QR codes from customer payment confirmations</li>
                    <li>Verify payment status and transaction details instantly</li>
                    <li>See product information including emoji and description</li>
                    <li>View buyer's wallet address for transaction verification</li>
                    <li>Access direct links to blockchain transactions</li>
                  </ul>
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/40 rounded-md border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 text-xs">
                    <strong>Pro Tip:</strong> Position the QR code from the customer's payment confirmation screen directly in the scanner frame for best results.
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Admin Access Required</AlertTitle>
            <AlertDescription>
              You do not have permission to use the Admin Scanner. Please sign in with an admin account.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default AdminScannerPage; 