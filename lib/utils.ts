import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) 
{
  // Utility for conditional className merging // by claude
  // minor update
  return twMerge(clsx(inputs));
}
