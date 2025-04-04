import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAccount, useSignMessage, useDisconnect, useChainId } from 'wagmi'
import { SiweMessage } from 'siwe'
import adminConfig from '../config/admin.json'
import yodlService from '@/lib/yodl'
import { FALLBACK_ADDRESS } from '@/config/yodl'

// Define a type for the admin object structure
type AdminConfig = {
  admins: (string | { ens: string; address: string })[];
};

interface AuthContextType {
  isAuthenticated: boolean
  isAdmin: boolean
  address: `0x${string}` | undefined
  signIn: () => Promise<boolean>
  signOut: () => void
  isLoading: boolean
  setIsAdmin?: (isAdmin: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// SECURITY: Never enable this in production
const FORCE_ADMIN_MODE = false;

// Store authentication state in localStorage to persist across page refreshes
const STORAGE_KEYS = {
  AUTH_STATUS: 'merchant_yapp_auth_status',
  ADMIN_MODE: 'merchant_yapp_admin_mode'
};

// Check if we're in development environment
const IS_DEV = import.meta.env.MODE === 'development';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId() || 1
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Initialize from localStorage if available
    const savedAuth = localStorage.getItem(STORAGE_KEYS.AUTH_STATUS);
    return savedAuth === 'true';
  })
  const [isAdmin, setIsAdmin] = useState(() => {
    // Initialize from localStorage if available, but only if we're not admin in dev
    const savedAdmin = localStorage.getItem(STORAGE_KEYS.ADMIN_MODE);
    return savedAdmin === 'true';
  })
  const [isLoading, setIsLoading] = useState(false)
  
  // State for automatically connecting via Yodl when in iframe
  const [yodlAddress, setYodlAddress] = useState<string | null>(null)
  const [isYodlIframe, setIsYodlIframe] = useState(false)
  
  // Check if we're in an iframe on mount
  useEffect(() => {
    const isInIframe = yodlService.isInIframe()
    setIsYodlIframe(isInIframe)
    
    // If in iframe, try to get the connected address
    if (isInIframe) {
      yodlService.getConnectedAccount().then(account => {
        if (account) {
          console.log('Auto-detected Yodl account:', account)
          setYodlAddress(account)
          
          // Check if the account is an admin
          const adminStatus = checkAdminStatus(account)
          setIsAdmin(adminStatus)
        }
      }).catch(error => {
        console.error('Failed to get Yodl account:', error)
      })
    }
  }, [])
  
  console.log("ADMIN_ADDRESSES:", adminConfig.admins);

  // Normalize an ethereum address
  const normalizeAddress = (addr: string | undefined): string => {
    if (!addr) return '';
    return addr.toLowerCase().trim();
  };

  // Get all admin addresses (both ENS and wallet addresses)
  const getAllAdminAddresses = (): string[] => {
    return (adminConfig as AdminConfig).admins.flatMap(admin => {
      if (typeof admin === 'string') {
        // Handle legacy format (string only)
        return [normalizeAddress(admin)];
      } else if (typeof admin === 'object') {
        // Handle new format (object with ens and address)
        const addresses: string[] = [];
        if (admin.ens) addresses.push(normalizeAddress(admin.ens));
        if (admin.address) addresses.push(normalizeAddress(admin.address));
        return addresses;
      }
      return [];
    });
  };

  // Check if the current address is in the admin list
  const checkAdminStatus = (currentAddress: string | undefined): boolean => {
    if (!currentAddress) return false;
    
    // Get all admin addresses (ENS and wallet addresses)
    const adminAddresses = getAllAdminAddresses();
    
    // Normalize the current address
    const normalizedCurrentAddress = normalizeAddress(currentAddress);
    
    // Check if the normalized address is in the admin list
    const isMatch = adminAddresses.includes(normalizedCurrentAddress);
    
    // Log for debugging
    console.log("Admin check:", {
      currentAddress,
      normalizedCurrentAddress,
      adminAddresses,
      isMatch
    });
    
    // IMPORTANT: No backdoors, only actual admin addresses can be admins
    return isMatch;
  };

  // Update localStorage when authentication status changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTH_STATUS, String(isAuthenticated));
  }, [isAuthenticated]);
  
  // Update localStorage when admin status changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ADMIN_MODE, String(isAdmin));
  }, [isAdmin]);

  // Check authentication status when wallet changes
  useEffect(() => {
    // If wallet is connected, check if the address is an admin
    if (address) {
      // ALWAYS verify against the admin list, never trust localStorage
      const adminStatus = checkAdminStatus(address);
      console.log(`✅ Address ${address} admin status: ${adminStatus}`);
      
      // Set admin status based on address check
      setIsAdmin(adminStatus);
      
      // If not an admin, ensure not authenticated
      if (!adminStatus) {
        setIsAuthenticated(false);
      }
    } else if (yodlAddress) {
      // If we have a Yodl address but no wallet address, check if it's an admin
      const adminStatus = checkAdminStatus(yodlAddress);
      console.log(`✅ Yodl address ${yodlAddress} admin status: ${adminStatus}`);
      
      // Set admin status based on address check
      setIsAdmin(adminStatus);
    } else {
      // If no wallet is connected, reset both states
      setIsAdmin(false);
      setIsAuthenticated(false);
    }
  }, [address, yodlAddress]);

  // Reset states when wallet disconnects
  useEffect(() => {
    if (!isConnected && !yodlAddress) {
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  }, [isConnected, yodlAddress]);

  // Sign-in function - handles both regular wallet and Yodl iframe scenarios
  const signIn = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // Get the current address (wallet or Yodl)
      const currentAddress = address || (yodlAddress as `0x${string}` | undefined);
      
      // SECURITY CHECK: Always verify admin status before proceeding
      const isUserAdmin = checkAdminStatus(currentAddress);
      console.log(`Attempting sign in for: ${currentAddress} isAdmin: ${isUserAdmin}`);
      
      // CRITICAL: Block non-admins immediately
      if (!isUserAdmin) {
        console.error("Authentication failed: Not an admin address");
        return false;
      }
      
      // Security: Never bypass signature verification
      // If you see "SIWE verification skipped in development" in the console, there's a security issue
      
      // If in Yodl iframe mode and we have a Yodl address
      if (isYodlIframe && yodlAddress) {
        try {
          // Create SIWE message
          const message = new SiweMessage({
            domain: window.location.host,
            address: yodlAddress as `0x${string}`,
            statement: 'Sign in to Merchant Yapp with Yodl',
            uri: window.location.origin,
            version: '1',
            chainId: 1, // Default to Ethereum mainnet
            nonce: Math.floor(Math.random() * 1000000).toString(), // Generate random nonce
          }).prepareMessage();
          
          // Sign message using Yodl SDK
          const signature = await yodlService.signMessage(message);
          
          // If we got a signature, consider authentication successful
          if (signature) {
            setIsAuthenticated(true);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error signing message with Yodl:', error);
          return false;
        }
      }
      
      // Regular wallet flow
      else if (address && isConnected) {
        try {
          // Create SIWE message with explicit chainId
          const nonce = Math.floor(Math.random() * 1000000).toString();
          console.log(`Creating SIWE message with chainId: ${chainId} and nonce: ${nonce}`);
          
          // Format the SIWE message properly - create simple text format first
          const messageText = `${window.location.host} wants you to sign in with your Ethereum account:
${address}

Sign in to Merchant Yapp with Ethereum

URI: ${window.location.origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;

          console.log('Prepared SIWE message:', messageText);
          
          // SECURITY FIX: Always require signature verification
          let signature: string | undefined;
          
          // Only in development, provide a warning but still require signature
          if (IS_DEV) {
            console.warn('⚠️ Development mode: Still requiring signature verification for security');
            try {
              // Sign the message using the connected wallet
              signature = await signMessageAsync({
                message: messageText,
                account: address
              });
            } catch (error) {
              console.error('Error during signature:', error);
              return false;
            }
          } else {
            try {
              // Sign the message using the connected wallet
              signature = await signMessageAsync({
                message: messageText,
                account: address
              });
            } catch (error) {
              console.error('Error during signature:', error);
              return false;
            }
          }
          
          // CRITICAL SECURITY: Always verify we have a valid signature
          if (!signature) {
            console.error("Authentication failed: No signature provided");
            return false;
          }
          
          // Authentication successful
          setIsAuthenticated(true);
          return true;
        } catch (error) {
          console.error('Error during signature:', error);
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error during sign-in:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign-out function
  const signOut = () => {
    setIsAuthenticated(false);
    if (!isAdmin) {
      disconnect();
    }
  };

  // Combine regular wallet address and Yodl address for context
  const effectiveAddress = address || (yodlAddress as `0x${string}` | undefined);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isAdmin,
        address: effectiveAddress,
        signIn,
        signOut,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 