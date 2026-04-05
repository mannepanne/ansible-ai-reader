// ABOUT: Utility helpers shared across components
// ABOUT: cn() merges Tailwind classes safely, resolving conflicts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
