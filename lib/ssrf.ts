import * as dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export async function isSSRFSafeUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    
    // Check hostname for private IPs
    const { address } = await lookup(url.hostname);
    
    const parts = address.split('.').map(Number);
    if (parts.length === 4) {
      if (parts[0] === 10) return false;
      if (parts[0] === 127) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 169 && parts[1] === 254) return false;
      if (parts[0] === 0) return false;
    }
    
    // Basic IPv6 check
    if (address.includes(':')) {
      if (address === '::1' || address === '::' || address.toLowerCase().startsWith('fe80:')) return false;
      if (address.toLowerCase().startsWith('fc') || address.toLowerCase().startsWith('fd')) return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}
